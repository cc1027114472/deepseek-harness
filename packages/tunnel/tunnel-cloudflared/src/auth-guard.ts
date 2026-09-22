/**
 * Security authentication guard for remote tunnel traffic.
 * Grants transparent access to loopback origins while requiring
 * a valid access token for requests arriving over the public tunnel.
 * @module @deepseek-ai/dsh-tunnel-cloudflared/auth-guard
 */

import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

/** Generate a cryptographically secure random token. */
export function generateAuthToken(): string {
  return randomBytes(16).toString('hex')
}

/** Check whether a hostname is a local loopback address. */
export function isLoopbackHost(hostname: string | undefined): boolean {
  if (!hostname) return false
  const clean = hostname.split(':')[0]?.toLowerCase() ?? ''
  return clean === '127.0.0.1' || clean === 'localhost' || clean === '::1'
}

/**
 * Extract token from request Query (?token=...) or Authorization header.
 */
export function extractToken(req: IncomingMessage): string | undefined {
  const url = req.url ? new URL(req.url, `http://${req.headers.host || 'localhost'}`) : null
  const queryToken = url?.searchParams.get('token')
  if (queryToken) return queryToken

  const authHeader = req.headers['authorization']
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }

  const customHeader = req.headers['x-dsh-token']
  if (typeof customHeader === 'string') {
    return customHeader.trim()
  }

  return undefined
}

/**
 * Create a simple HTTP middleware function to protect endpoints from unauthenticated remote visitors.
 */
export function createAuthMiddleware(getValidToken: () => string | undefined) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const host = req.headers['host']
    // Local loopback requests are always authorized
    if (isLoopbackHost(host)) {
      return next()
    }

    const expectedToken = getValidToken()
    // If no token is enforced, pass through
    if (!expectedToken) {
      return next()
    }

    const providedToken = extractToken(req)
    if (providedToken && providedToken === expectedToken) {
      return next()
    }

    // Unauthorized remote request
    res.statusCode = 401
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>DeepSeek Harness - 访问受限</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
          .card { background: #1e293b; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); max-width: 400px; text-align: center; }
          h2 { margin-top: 0; color: #38bdf8; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
          input { width: 100%; box-sizing: border-box; padding: 10px; margin: 16px 0; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #fff; font-size: 14px; }
          button { width: 100%; padding: 10px; background: #0284c7; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: bold; cursor: pointer; }
          button:hover { background: #0369a1; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>🔒 远程安全认证</h2>
          <p>当前请求来自外部公网隧道，请输入电脑端显示的访问口令 (Token)。</p>
          <form method="GET" action="/">
            <input type="text" name="token" placeholder="输入访问 Token" autofocus required />
            <button type="submit">验证并进入</button>
          </form>
        </div>
      </body>
      </html>
    `)
  }
}
