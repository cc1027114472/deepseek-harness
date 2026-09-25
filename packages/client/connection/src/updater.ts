import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

export const CURRENT_VERSION = '2.0.3'

export interface UpdateManifest {
  version: string
  releaseDate?: string | undefined
  minSupportedVersion?: string | undefined
  mandatory?: boolean | undefined
  downloadUrl: string
  sha256?: string | undefined
  fileSize?: number | undefined
  patchUrl?: string | undefined
  changelog: string[] | string
}

export interface CheckUpdateResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string | undefined
  releaseDate?: string | undefined
  downloadUrl?: string | undefined
  changelog?: string[] | string | undefined
  mandatory?: boolean | undefined
  fileSize?: number | undefined
  error?: string | undefined
}

export interface DownloadProgress {
  status: 'idle' | 'downloading' | 'downloaded' | 'error'
  pct: number
  downloadedBytes: number
  totalBytes: number
  error?: string | undefined
  filePath?: string | undefined
}

/**
 * Compare two semver strings: '1.0.1' vs '1.0.0'.
 * Returns:
 *  1 if a > b
 * -1 if a < b
 *  0 if a === b
 */
export function compareSemver(a: string, b: string): number {
  const cleanA = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const cleanB = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const maxLen = Math.max(cleanA.length, cleanB.length)

  for (let i = 0; i < maxLen; i++) {
    const numA = cleanA[i] ?? 0
    const numB = cleanB[i] ?? 0
    if (numA > numB) return 1
    if (numA < numB) return -1
  }
  return 0
}

let cachedCheckResult: CheckUpdateResult | null = null
let currentProgress: DownloadProgress = {
  status: 'idle',
  pct: 0,
  downloadedBytes: 0,
  totalBytes: 0,
}

export function getCachedUpdate(): CheckUpdateResult {
  if (cachedCheckResult) {
    return cachedCheckResult
  }
  return {
    hasUpdate: false,
    currentVersion: CURRENT_VERSION,
  }
}

export function getDownloadStatus(): DownloadProgress {
  return currentProgress
}

export const DEFAULT_UPDATE_URLS = [
  'https://ukapi.cc/downloads/latest.json',
  'https://raw.githubusercontent.com/wensheng-ai/mowan-agent-releases/main/releases/latest.json',
  'https://cdn.jsdelivr.net/gh/wensheng-ai/mowan-agent-releases@main/releases/latest.json',
]

function fetchSingleUrl(updateUrl: string): Promise<CheckUpdateResult> {
  return new Promise<CheckUpdateResult>((resolve) => {
    try {
      const client = updateUrl.startsWith('https') ? https : http
      const req = client.get(updateUrl, { timeout: 6000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          void fetchSingleUrl(res.headers.location).then(resolve)
          return
        }

        if (res.statusCode !== 200) {
          resolve({
            hasUpdate: false,
            currentVersion: CURRENT_VERSION,
            error: `Update server returned status ${res.statusCode}`,
          })
          return
        }

        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          try {
            const manifest = JSON.parse(body) as UpdateManifest
            const hasUpdate = compareSemver(manifest.version, CURRENT_VERSION) > 0

            const result: CheckUpdateResult = {
              hasUpdate,
              currentVersion: CURRENT_VERSION,
              latestVersion: manifest.version,
              releaseDate: manifest.releaseDate,
              downloadUrl: manifest.downloadUrl,
              changelog: manifest.changelog,
              mandatory: Boolean(manifest.mandatory),
              fileSize: manifest.fileSize,
            }
            resolve(result)
          } catch (err) {
            resolve({
              hasUpdate: false,
              currentVersion: CURRENT_VERSION,
              error: `Invalid manifest format: ${String(err)}`,
            })
          }
        })
      })

      req.on('error', (err) => {
        resolve({
          hasUpdate: false,
          currentVersion: CURRENT_VERSION,
          error: `Network error: ${err.message}`,
        })
      })

      req.on('timeout', () => {
        req.destroy()
        resolve({
          hasUpdate: false,
          currentVersion: CURRENT_VERSION,
          error: 'Update check timed out',
        })
      })
    } catch (err) {
      resolve({
        hasUpdate: false,
        currentVersion: CURRENT_VERSION,
        error: String(err),
      })
    }
  })
}

export async function checkForUpdate(overrideUrl?: string): Promise<CheckUpdateResult> {
  const candidates = overrideUrl
    ? [overrideUrl]
    : process.env.MOWAN_UPDATE_URL
      ? [process.env.MOWAN_UPDATE_URL]
      : DEFAULT_UPDATE_URLS

  let lastResult: CheckUpdateResult = {
    hasUpdate: false,
    currentVersion: CURRENT_VERSION,
  }

  for (const url of candidates) {
    const res = await fetchSingleUrl(url)
    lastResult = res
    if (!res.error) {
      cachedCheckResult = res
      return res
    }
  }

  cachedCheckResult = lastResult
  return lastResult
}

export function startDownload(downloadUrl: string, expectedSha256?: string): void {
  if (currentProgress.status === 'downloading') {
    return
  }

  const tmpDir = path.join(os.tmpdir(), 'mowan-update')
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true })
  }
  const destPath = path.join(tmpDir, 'Mowan-Agent-Setup.exe')
  if (existsSync(destPath)) {
    try { unlinkSync(destPath) } catch { /* ignore */ }
  }

  currentProgress = {
    status: 'downloading',
    pct: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    filePath: destPath,
  }

  function executeDownload(targetUrl: string, redirectCount = 0) {
    if (redirectCount > 5) {
      currentProgress = {
        status: 'error',
        pct: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        error: 'Too many redirects during download',
      }
      return
    }

    const client = targetUrl.startsWith('https') ? https : http
    const req = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mowan-Agent-Updater/1.0',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        executeDownload(res.headers.location, redirectCount + 1)
        return
      }

      if (res.statusCode !== 200) {
        currentProgress = {
          status: 'error',
          pct: 0,
          downloadedBytes: 0,
          totalBytes: 0,
          error: `Download failed with HTTP ${res.statusCode}`,
        }
        return
      }

      const totalBytes = parseInt(res.headers['content-length'] ?? '0', 10) || 0
      currentProgress.totalBytes = totalBytes

      const fileStream = createWriteStream(destPath)
      const hash = createHash('sha256')
      let downloaded = 0

      res.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        hash.update(chunk)
        fileStream.write(chunk)
        currentProgress.downloadedBytes = downloaded
        if (totalBytes > 0) {
          currentProgress.pct = Math.min(99, Math.round((downloaded / totalBytes) * 100))
        }
      })

      res.on('end', () => {
        fileStream.end(() => {
          const computedSha = hash.digest('hex').toLowerCase()
          if (expectedSha256 && expectedSha256.toLowerCase() !== computedSha) {
            currentProgress = {
              status: 'error',
              pct: 0,
              downloadedBytes: downloaded,
              totalBytes,
              error: `SHA-256 verification failed! Expected ${expectedSha256}, got ${computedSha}`,
            }
            try { unlinkSync(destPath) } catch { /* ignore */ }
            return
          }

          currentProgress = {
            status: 'downloaded',
            pct: 100,
            downloadedBytes: downloaded,
            totalBytes,
            filePath: destPath,
          }
        })
      })

      res.on('error', (err) => {
        fileStream.close()
        currentProgress = {
          status: 'error',
          pct: 0,
          downloadedBytes: downloaded,
          totalBytes,
          error: err.message,
        }
      })
    })

    req.on('error', (err) => {
      currentProgress = {
        status: 'error',
        pct: 0,
        downloadedBytes: 0,
        totalBytes: 0,
        error: err.message,
      }
    })
  }

  executeDownload(downloadUrl)
}

export function applyAndRestart(): { success: boolean; error?: string } {
  const filePath = currentProgress.filePath
  if (!filePath || !existsSync(filePath)) {
    return { success: false, error: '安装程序文件不存在或未完成下载' }
  }

  try {
    // Launch installer in upgrade mode
    const child = spawn(filePath, ['--upgrade'], {
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    // Gracefully exit host process after 1 second so installer can overwrite files
    setTimeout(() => {
      process.exit(0)
    }, 1000)

    return { success: true }
  } catch (err) {
    return { success: false, error: `启动更新程序失败: ${String(err)}` }
  }
}


