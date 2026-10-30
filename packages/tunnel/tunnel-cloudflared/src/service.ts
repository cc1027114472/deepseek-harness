/**
 * Cordis Service implementation for Cloudflare Tunnel and Remote Access Auth.
 * @module @deepseek-ai/dsh-tunnel-cloudflared/service
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import {
  checkInstalled,
  installCloudflared,
  CloudflaredRunner,
} from './cloudflared-runner.ts'
import {
  generateAuthToken,
  isLoopbackHost,
  extractToken,
  createAuthInterceptor,
  createUpgradeAuthInterceptor,
} from './auth-guard.ts'
import { resolvePhysicalLanAddresses } from './lan-discovery.ts'
import type { TunnelConfig, TunnelService, TunnelStatus } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tunnel: TunnelServiceImpl
  }
  interface Events {
    'tunnel/status'(status: TunnelStatus): void
  }
}

interface WebServerLike {
  register(route: {
    kind: 'prefix' | 'exact'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
  registerInterceptor?(interceptor: (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>): () => void
  registerUpgradeInterceptor?(interceptor: (req: IncomingMessage, socket: Duplex, head: Buffer) => boolean | Promise<boolean>): () => void
}

interface HostConnectionLike {
  trustAuthority?(authority: string): () => void
}

/** Helper to respond with JSON. */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-dsh-token',
  })
  res.end(JSON.stringify(data))
}

/** Load persisted auth token from ~/.dsh/tunnel-auth.json */
function loadPersistedToken(): string | undefined {
  try {
    const authFile = dshHomePath('tunnel-auth.json')
    if (existsSync(authFile)) {
      const data = JSON.parse(readFileSync(authFile, 'utf8'))
      if (typeof data?.authToken === 'string' && data.authToken.trim() !== '') {
        return data.authToken.trim()
      }
    }
  } catch {
    // Ignore read/parse error
  }
  return undefined
}

/** Save auth token to ~/.dsh/tunnel-auth.json */
function persistToken(token: string): void {
  try {
    const authFile = dshHomePath('tunnel-auth.json')
    mkdirSync(dirname(authFile), { recursive: true })
    writeFileSync(authFile, JSON.stringify({ authToken: token }, null, 2), 'utf8')
  } catch {
    // Ignore write failure
  }
}

/**
 * Tunnel service registered on the Cordis Context as `ctx.tunnel`.
 */
export class TunnelServiceImpl extends Service implements TunnelService {
  private runner: CloudflaredRunner
  private currentConfig: TunnelConfig
  private activeToken: string | undefined
  private unregisterTrustedHost?: (() => void) | undefined

  constructor(ctx: Context, config: TunnelConfig = {}) {
    super(ctx, 'tunnel')
    const webStartup = (ctx as unknown as { webStartup?: { port?: number } }).webStartup
    const actualPort = webStartup?.port ?? config.port ?? 3090
    this.currentConfig = {
      port: actualPort,
      mode: 'quick',
      useHttp2: true,
      ...config,
    }

    // Initialize authentication token with priority:
    // 1. Environment variable (DSH_TUNNEL_AUTH_TOKEN / DSH_WEB_PASSWORD)
    // 2. Persisted token in ~/.dsh/tunnel-auth.json
    // 3. Plugin config (if explicit)
    // 4. Auto-generated cryptographically secure token
    const envToken = process.env.DSH_TUNNEL_AUTH_TOKEN || process.env.DSH_WEB_PASSWORD
    const persisted = loadPersistedToken()
    if (envToken && envToken.trim() !== '') {
      this.activeToken = envToken.trim()
    } else if (persisted) {
      this.activeToken = persisted
    } else if (config.authToken && config.authToken !== 'auto') {
      this.activeToken = config.authToken
      persistToken(this.activeToken)
    } else {
      this.activeToken = generateAuthToken()
      persistToken(this.activeToken)
    }

    this.runner = new CloudflaredRunner((status) => {
      // Dynamic link with connection trusted hosts fence
      if (status.url) {
        try {
          const tunnelHost = new URL(status.url).host
          this.unregisterTrustedHost?.()
          const connection = this.ctx.get('connection') as HostConnectionLike | undefined
          this.unregisterTrustedHost = connection?.trustAuthority?.(tunnelHost)
        } catch {
          // Ignore invalid URL parsing
        }
      } else {
        this.unregisterTrustedHost?.()
        this.unregisterTrustedHost = undefined
      }

      // Broadcast status to listeners
      this.ctx.emit('tunnel/status', status)
    })

    // Perform background check on installed facts
    this.runner.refreshInstalled().catch(() => {})

    // Register HTTP routes and global interceptors if webServer service is available
    this.registerWebServerIntegration()

    // Auto start if enabled in config
    if (this.currentConfig.enabled) {
      this.start().catch((err) => {
        this.ctx.logger?.warn?.(`[tunnel] Auto-start failed: ${err.message}`)
      })
    }

    // Cleanup on service/context disposal
    this.ctx.effect(() => () => {
      this.unregisterTrustedHost?.()
      this.unregisterTrustedHost = undefined
      void this.stop().catch(() => {})
    }, 'tunnel-cloudflared: shutdown runner')
  }

  private registerWebServerIntegration(): void {
    this.ctx.inject(['webServer'], (webCtx) => {
      const webServer = webCtx.get('webServer') as WebServerLike | undefined
      if (!webServer) return

      // Register global interceptors for non-loopback clients
      const registerInterceptor = webServer.registerInterceptor?.bind(webServer)
      if (registerInterceptor) {
        webCtx.effect(
          () => registerInterceptor(createAuthInterceptor(() => this.activeToken)),
          'tunnel-cloudflared: global auth interceptor',
        )
      }
      const registerUpgradeInterceptor = webServer.registerUpgradeInterceptor?.bind(webServer)
      if (registerUpgradeInterceptor) {
        webCtx.effect(
          () => registerUpgradeInterceptor(createUpgradeAuthInterceptor(() => this.activeToken)),
          'tunnel-cloudflared: global upgrade auth interceptor',
        )
      }

      // Register dedicated /api/tunnel management endpoints
      const route = {
        kind: 'prefix' as const,
        path: '/api/tunnel',
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method === 'OPTIONS') {
            res.writeHead(204, {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-dsh-token',
            })
            res.end()
            return
          }

          // Double check authentication for non-loopback visitors
          const host = req.headers.host ?? ''
          if (!isLoopbackHost(host)) {
            const token = extractToken(req)
            if (!this.validateToken(token)) {
              sendJson(res, 401, { error: 'Unauthorized: invalid or missing tunnel authentication token' })
              return
            }
          }

          const rawUrl = new URL(req.url ?? '/', 'http://localhost')
          const pathname = rawUrl.pathname

          try {
            if (pathname === '/api/tunnel/status' && req.method === 'GET') {
              sendJson(res, 200, this.getStatus())
              return
            }

            if (pathname === '/api/tunnel/start' && req.method === 'POST') {
              const status = await this.start()
              sendJson(res, 200, status)
              return
            }

            if (pathname === '/api/tunnel/stop' && req.method === 'POST') {
              const status = await this.stop()
              sendJson(res, 200, status)
              return
            }

            if (pathname === '/api/tunnel/install' && req.method === 'POST') {
              const status = await this.install()
              sendJson(res, 200, status)
              return
            }

            if (pathname === '/api/tunnel/set-token' && req.method === 'POST') {
              let body = ''
              for await (const chunk of req) {
                body += chunk
              }
              const parsed = JSON.parse(body || '{}')
              if (typeof parsed.token !== 'string' || parsed.token.trim() === '') {
                sendJson(res, 400, { error: '参数 token 必须为非空字符串' })
                return
              }
              const status = await this.setAuthToken(parsed.token.trim())
              sendJson(res, 200, status)
              return
            }

            if (pathname === '/api/tunnel/reset-token' && req.method === 'POST') {
              this.activeToken = generateAuthToken()
              persistToken(this.activeToken)
              const status = this.getStatus()
              this.ctx.emit('tunnel/status', status)
              sendJson(res, 200, status)
              return
            }

            sendJson(res, 404, { error: 'Not found' })
          } catch (err) {
            sendJson(res, 500, { error: (err as Error).message })
          }
        },
      }

      webCtx.effect(() => webServer.register(route), 'tunnel-cloudflared: /api/tunnel route')
    })
  }

  async checkInstalled(): Promise<{ installed: boolean; version?: string }> {
    return checkInstalled()
  }

  async install(): Promise<TunnelStatus> {
    await installCloudflared()
    return this.getStatus()
  }

  async start(overrideConfig?: Partial<TunnelConfig>): Promise<TunnelStatus> {
    const merged: TunnelConfig = {
      ...this.currentConfig,
      ...overrideConfig,
    }
    if (this.activeToken !== undefined) {
      merged.authToken = this.activeToken
    }
    await this.runner.start(merged)
    return this.getStatus()
  }

  async stop(): Promise<TunnelStatus> {
    this.unregisterTrustedHost?.()
    this.unregisterTrustedHost = undefined
    await this.runner.stop()
    return this.getStatus()
  }

  getStatus(): TunnelStatus {
    const status = this.runner.getStatus()
    const result: TunnelStatus = { ...status }
    if (this.activeToken !== undefined) {
      result.authToken = this.activeToken
    }
    const actualPort = this.currentConfig.port ?? 3090
    result.lanAddresses = resolvePhysicalLanAddresses(actualPort)
    return result
  }

  async setAuthToken(token: string): Promise<TunnelStatus> {
    const trimmed = token.trim()
    if (!trimmed) {
      throw new Error('访问密码/口令不能为空')
    }
    this.activeToken = trimmed
    persistToken(this.activeToken)
    const status = this.getStatus()
    this.ctx.emit('tunnel/status', status)
    return status
  }

  validateToken(token: string | undefined): boolean {
    if (!this.activeToken) return true
    return token === this.activeToken
  }
}
