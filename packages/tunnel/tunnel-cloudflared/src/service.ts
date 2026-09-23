/**
 * Cordis Service implementation for Cloudflare Tunnel.
 * @module @deepseek-ai/dsh-tunnel-cloudflared/service
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context, Service } from '@deepseek-ai/cordis'
import {
  checkInstalled,
  installCloudflared,
  CloudflaredRunner,
} from './cloudflared-runner.ts'
import {
  generateAuthToken,
  isLoopbackHost,
  extractToken,
} from './auth-guard.ts'
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
    const actualPort = (ctx as any).webStartup?.port ?? config.port ?? 3080
    this.currentConfig = {
      port: actualPort,
      mode: 'quick',
      useHttp2: true,
      ...config,
    }

    // Initialize or generate authentication token
    this.activeToken =
      config.authToken === 'auto' || !config.authToken
        ? generateAuthToken()
        : config.authToken

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

    // Register HTTP API endpoint if webServer service is available
    this.registerHttpRoutes()

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

  private registerHttpRoutes(): void {
    // Dynamically attach when webServer is present
    this.ctx.inject(['webServer'], (webCtx) => {
      const webServer = webCtx.get('webServer') as WebServerLike | undefined
      if (!webServer) return

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

          // Authenticate remote visitors
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

            if (pathname === '/api/tunnel/reset-token' && req.method === 'POST') {
              this.activeToken = generateAuthToken()
              sendJson(res, 200, this.getStatus())
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
    const info = await installCloudflared()
    const current = this.runner.getStatus()
    const result: TunnelStatus = {
      ...current,
      installed: info.installed,
    }
    if (info.version !== undefined) result.version = info.version
    if (this.activeToken !== undefined) result.authToken = this.activeToken
    return result
  }

  async start(overrideConfig?: Partial<TunnelConfig>): Promise<TunnelStatus> {
    const merged: TunnelConfig = {
      ...this.currentConfig,
      ...overrideConfig,
    }
    if (this.activeToken !== undefined) {
      merged.authToken = this.activeToken
    }
    return this.runner.start(merged)
  }

  async stop(): Promise<TunnelStatus> {
    this.unregisterTrustedHost?.()
    this.unregisterTrustedHost = undefined
    return this.runner.stop()
  }

  getStatus(): TunnelStatus {
    const status = this.runner.getStatus()
    const result: TunnelStatus = { ...status }
    if (this.activeToken !== undefined) {
      result.authToken = this.activeToken
    }
    return result
  }

  validateToken(token: string | undefined): boolean {
    if (!this.activeToken) return true
    return token === this.activeToken
  }
}
