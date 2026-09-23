/**
 * Process controller for the cloudflared executable.
 * Manages downloading, version checks, starting/stopping the tunnel,
 * and extracting the assigned public URL.
 * @module @deepseek-ai/dsh-tunnel-cloudflared/cloudflared-runner
 */

import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { TunnelConfig, TunnelStatus } from './types.ts'

const execFileAsync = promisify(execFile)

/** Get path to local cloudflared executable. */
export function getBinaryPath(): string {
  const isWin = process.platform === 'win32'
  const binName = isWin ? 'cloudflared.exe' : 'cloudflared'
  return dshHomePath('bin', binName)
}

/** Check if cloudflared is installed and extract its version string. */
export async function checkInstalled(): Promise<{ installed: boolean; version?: string }> {
  const binPath = getBinaryPath()
  if (!existsSync(binPath)) {
    return { installed: false }
  }

  try {
    const { stdout } = await execFileAsync(binPath, ['--version'])
    const firstLine = stdout.split('\n')[0]?.trim()
    const result: { installed: boolean; version?: string } = { installed: true }
    if (firstLine) result.version = firstLine
    return result
  } catch {
    return { installed: false }
  }
}

/** Get official GitHub download URL for current platform and arch. */
function getDownloadUrl(): { url: string; isArchive: boolean } {
  const { platform, arch } = process
  let osStr = ''
  let archStr = ''
  let ext = ''
  let isArchive = false

  if (platform === 'win32' && arch === 'x64') {
    osStr = 'windows'
    archStr = 'amd64'
    ext = '.exe'
  } else if (platform === 'darwin') {
    osStr = 'darwin'
    archStr = arch === 'arm64' ? 'arm64' : 'amd64'
    ext = '.tgz'
    isArchive = true
  } else if (platform === 'linux') {
    osStr = 'linux'
    archStr = arch === 'arm64' ? 'arm64' : 'amd64'
    ext = ''
  } else {
    throw new Error(`Unsupported platform/architecture for cloudflared: ${platform}-${arch}`)
  }

  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${osStr}-${archStr}${ext}`
  return { url, isArchive }
}

/** Download and install the cloudflared executable into $DSH_HOME/bin. */
export async function installCloudflared(): Promise<{ installed: boolean; version?: string }> {
  const binPath = getBinaryPath()
  const binDir = dirname(binPath)
  await mkdir(binDir, { recursive: true })

  const { url, isArchive } = getDownloadUrl()
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`Failed to download cloudflared from ${url}: HTTP ${res.status} ${res.statusText}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())

  if (isArchive) {
    const archivePath = join(binDir, 'cloudflared.tgz')
    await writeFile(archivePath, buffer)
    try {
      await execFileAsync('tar', ['-xzf', archivePath, '-C', binDir])
    } finally {
      await rm(archivePath, { force: true }).catch(() => {})
    }
  } else {
    await writeFile(binPath, buffer)
  }

  if (process.platform !== 'win32') {
    await chmod(binPath, 0o755)
  }

  return checkInstalled()
}

/** Runner state controller for cloudflared. */
export class CloudflaredRunner {
  private child: ChildProcess | null = null
  private status: TunnelStatus = {
    installed: false,
    running: false,
  }
  private onStatusChange?: (status: TunnelStatus) => void

  constructor(onStatusChange?: (status: TunnelStatus) => void) {
    if (onStatusChange) {
      this.onStatusChange = onStatusChange
    }
  }

  getStatus(): TunnelStatus {
    return { ...this.status }
  }

  private updateStatus(partial: Partial<TunnelStatus>): void {
    this.status = { ...this.status, ...partial }
    this.onStatusChange?.(this.getStatus())
  }

  /** Refresh installed and version facts. */
  async refreshInstalled(): Promise<void> {
    const info = await checkInstalled()
    const update: Partial<TunnelStatus> = { installed: info.installed }
    if (info.version !== undefined) {
      update.version = info.version
    }
    this.updateStatus(update)
  }

  /** Start cloudflared tunnel child process. */
  async start(config: TunnelConfig): Promise<TunnelStatus> {
    if (this.child && this.status.running) {
      return this.getStatus()
    }

    const { installed, version } = await checkInstalled()
    if (!installed) {
      this.updateStatus({ error: 'cloudflared binary is not installed' })
      throw new Error('cloudflared binary is not installed. Call install() first.')
    }

    const binPath = getBinaryPath()
    const port = config.port ?? 3080
    const mode = config.mode ?? 'quick'
    const args: string[] = []

    if (mode === 'quick') {
      args.push('tunnel', '--url', `http://127.0.0.1:${port}`)
      if (config.useHttp2 !== false) {
        args.push('--protocol', 'http2')
      }
    } else {
      if (!config.token) {
        throw new Error('Cloudflare Named Tunnel token is required for auth mode')
      }
      args.push('tunnel', 'run', '--token', config.token)
      if (config.useHttp2 !== false) {
        args.push('--protocol', 'http2')
      }
    }

    const startingStatus: TunnelStatus = {
      installed: true,
      running: true,
    }
    if (version !== undefined) startingStatus.version = version
    if (config.authToken !== undefined) startingStatus.authToken = config.authToken
    this.status = startingStatus
    this.onStatusChange?.(this.getStatus())

    const child = spawn(binPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child

    const extractUrl = (chunk: Buffer) => {
      const line = chunk.toString()
      const match = line.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
      if (match) {
        this.updateStatus({ url: match[0] })
      }
    }

    child.stdout?.on('data', extractUrl)
    child.stderr?.on('data', extractUrl)

    child.on('error', (err) => {
      this.child = null
      this.updateStatus({
        running: false,
        error: err.message,
      })
    })

    child.on('close', (code) => {
      this.child = null
      const closeUpdate: Partial<TunnelStatus> = { running: false }
      if (code !== 0 && code !== null) {
        closeUpdate.error = `Tunnel exited with code ${code}`
      }
      this.updateStatus(closeUpdate)
    })

    return this.getStatus()
  }

  /** Stop running cloudflared child process. */
  async stop(): Promise<TunnelStatus> {
    if (this.child) {
      const proc = this.child
      this.child = null
      proc.kill('SIGTERM')
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (!proc.killed) {
        proc.kill('SIGKILL')
      }
    }

    const stoppedStatus: TunnelStatus = {
      installed: this.status.installed,
      running: false,
    }
    if (this.status.version !== undefined) stoppedStatus.version = this.status.version
    this.status = stoppedStatus
    this.onStatusChange?.(this.getStatus())

    return this.getStatus()
  }
}
