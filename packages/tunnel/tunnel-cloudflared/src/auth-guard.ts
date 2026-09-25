/**
 * Security authentication guard for remote and LAN traffic.
 * Grants transparent access to loopback origins while requiring
 * a valid access token/password for non-loopback requests.
 * @module @deepseek-ai/dsh-tunnel-cloudflared/auth-guard
 */

import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'

/** Generate a cryptographically secure random token. */
export function generateAuthToken(): string {
  return randomBytes(16).toString('hex')
}

/** Check whether a hostname is a local loopback address. */
export function isLoopbackHost(hostname: string | undefined): boolean {
  if (!hostname) return false
  const lower = hostname.trim().toLowerCase()
  if (lower === '::1' || lower.startsWith('[::1]')) return true
  const clean = lower.split(':')[0] ?? ''
  return clean === '127.0.0.1' || clean === 'localhost'
}

/** Check whether a client remote address is a local loopback address. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * Determine whether a request originates from the local host without going
 * through a remote tunnel or non-loopback network interface.
 */
export function isLoopbackRequest(req: IncomingMessage): boolean {
  const host = req.headers['host']
  const remoteAddr = req.socket?.remoteAddress

  // If host is explicitly a tunnel or non-loopback hostname, it's remote
  if (!isLoopbackHost(host)) {
    return false
  }

  // If remote address is available and not loopback, it's from another machine
  if (remoteAddr && !isLoopbackAddress(remoteAddr)) {
    return false
  }

  return true
}

/** Parse Cookie header into a key-value dictionary. */
export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {}
  const cookies: Record<string, string> = {}
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const equalIndex = trimmed.indexOf('=')
    if (equalIndex > 0) {
      const key = trimmed.slice(0, equalIndex).trim()
      const val = trimmed.slice(equalIndex + 1).trim()
      cookies[key] = decodeURIComponent(val)
    }
  }
  return cookies
}

/**
 * Extract token from Query (?token=...), Authorization header, custom header, or Cookie.
 */
export function extractToken(req: IncomingMessage): string | undefined {
  const rawUrl = req.url ?? '/'
  try {
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
    const queryToken = url.searchParams.get('token')
    if (queryToken) return queryToken.trim()
  } catch {
    // Ignore malformed URL
  }

  const authHeader = req.headers['authorization']
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim()
  }

  const customHeader = req.headers['x-dsh-token']
  if (typeof customHeader === 'string') {
    return customHeader.trim()
  }

  const cookieHeader = req.headers['cookie']
  if (typeof cookieHeader === 'string') {
    const cookies = parseCookies(cookieHeader)
    if (cookies['dsh_token']) {
      return cookies['dsh_token'].trim()
    }
  }

  return undefined
}

/**
 * Render standard responsive HTML login/access card.
 */
export function renderAuthCardHtml(errorMsg?: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>魔丸 (Mowan) - 访问口令验证</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 100%);
      color: #f8fafc;
      padding: 16px;
    }
    .card {
      background: rgba(30, 41, 59, 0.85);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 2.2rem;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    .icon {
      font-size: 42px;
      margin-bottom: 12px;
      display: inline-block;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      color: #38bdf8;
      margin-bottom: 8px;
    }
    p {
      color: #94a3b8;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .input-wrap {
      margin-bottom: 16px;
      text-align: left;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #090d16;
      color: #fff;
      font-size: 15px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
    }
    button {
      width: 100%;
      padding: 12px;
      background: #0284c7;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }
    button:hover { background: #0369a1; }
    button:active { transform: scale(0.99); }
    .error {
      color: #f87171;
      font-size: 13px;
      margin-bottom: 12px;
      text-align: left;
    }
    .footer-tip {
      margin-top: 18px;
      font-size: 12px;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h2>安全访问口令验证</h2>
    <p>当前连接来自局域网或外部远程网络，请输入电脑端「设置 -> 远程访问」中设置的访问密码或口令。</p>
    ${errorMsg ? `<div class="error">⚠️ ${errorMsg}</div>` : ''}
    <form id="authForm" method="GET" action="/">
      <div class="input-wrap">
        <input type="password" id="tokenInput" name="token" placeholder="输入访问密码 / 口令" autofocus required />
      </div>
      <button type="submit">验证并进入</button>
    </form>
    <div class="footer-tip">本机 (127.0.0.1) 访问无需输入密码</div>
  </div>
  <script>
    document.getElementById('authForm').addEventListener('submit', function(e) {
      var val = document.getElementById('tokenInput').value.trim();
      if (val) {
        document.cookie = "dsh_token=" + encodeURIComponent(val) + "; path=/; max-age=2592000; SameSite=Lax";
      }
    });
  </script>
</body>
</html>`
}

/**
 * Create a WebInterceptor function to protect endpoints from unauthenticated remote or LAN visitors.
 * Returns true if the request is permitted to proceed, or false if it was handled/blocked.
 */
export function createAuthInterceptor(getValidToken: () => string | undefined) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    // Local loopback requests are always authorized
    if (isLoopbackRequest(req)) {
      return true
    }

    const expectedToken = getValidToken()
    // If no token is enforced, pass through
    if (!expectedToken) {
      return true
    }

    // CORS preflight requests pass through
    if (req.method === 'OPTIONS') {
      return true
    }

    const providedToken = extractToken(req)
    const isAuthenticated = Boolean(providedToken && providedToken === expectedToken)

    if (isAuthenticated) {
      // If user passed token via query, set Cookie and redirect to clean URL
      const rawUrl = req.url ?? '/'
      let hasQueryToken = false
      try {
        const parsed = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
        hasQueryToken = parsed.searchParams.has('token')
        if (hasQueryToken && req.method === 'GET' && !parsed.pathname.startsWith('/api')) {
          parsed.searchParams.delete('token')
          const cleanPath = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/'
          res.writeHead(302, {
            'Location': cleanPath,
            'Set-Cookie': `dsh_token=${encodeURIComponent(expectedToken)}; Path=/; Max-Age=2592000; SameSite=Lax`,
          })
          res.end()
          return false
        }
      } catch {
        // Fall through
      }
      return true
    }

    // Unauthorized request
    const rawUrl = req.url ?? '/'
    let isApi = false
    try {
      const parsed = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`)
      isApi = parsed.pathname.startsWith('/api')
    } catch {
      isApi = rawUrl.startsWith('/api')
    }

    if (isApi) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Unauthorized: access token/password required for remote and LAN visitors' }))
      return false
    }

    // Render HTML card for browser navigation
    res.statusCode = 401
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(renderAuthCardHtml(providedToken ? '口令错误，请重新输入' : undefined))
    return false
  }
}

/**
 * Create a WebUpgradeInterceptor for WebSocket upgrade handshakes.
 * Returns true if permitted, false if rejected.
 */
export function createUpgradeAuthInterceptor(getValidToken: () => string | undefined) {
  return (req: IncomingMessage, socket: Duplex, _head: Buffer): boolean => {
    if (isLoopbackRequest(req)) {
      return true
    }

    const expectedToken = getValidToken()
    if (!expectedToken) {
      return true
    }

    const providedToken = extractToken(req)
    if (providedToken && providedToken === expectedToken) {
      return true
    }

    // Reject unauthenticated upgrade
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return false
  }
}

/**
 * Connect-style middleware wrapper over createAuthInterceptor.
 */
export function createAuthMiddleware(getValidToken: () => string | undefined) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    if (isLoopbackRequest(req)) {
      next()
      return
    }

    const expectedToken = getValidToken()
    if (!expectedToken) {
      next()
      return
    }

    const providedToken = extractToken(req)
    if (providedToken && providedToken === expectedToken) {
      next()
      return
    }

    res.statusCode = 401
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(renderAuthCardHtml())
  }
}
