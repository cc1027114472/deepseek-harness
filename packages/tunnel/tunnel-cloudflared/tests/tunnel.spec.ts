import { describe, it, expect, vi } from 'vitest'
import {
  generateAuthToken,
  isLoopbackHost,
  isLoopbackRequest,
  extractToken,
  createAuthMiddleware,
  createAuthInterceptor,
} from '../src/auth-guard.ts'
import { CloudflaredRunner } from '../src/cloudflared-runner.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'

describe('tunnel-cloudflared: auth-guard', () => {
  it('generates a 32-character hex authentication token', () => {
    const token1 = generateAuthToken()
    const token2 = generateAuthToken()
    expect(token1).toHaveLength(32)
    expect(token2).toHaveLength(32)
    expect(token1).not.toBe(token2)
  })

  it('correctly identifies loopback hostnames', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('localhost:3090')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('127.0.0.1:8080')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('[::1]:3090')).toBe(true)

    expect(isLoopbackHost('192.168.1.100:3090')).toBe(false)
    expect(isLoopbackHost('abc.trycloudflare.com')).toBe(false)
    expect(isLoopbackHost('example.com')).toBe(false)
    expect(isLoopbackHost(undefined)).toBe(false)
  })

  it('distinguishes local loopback requests from LAN and remote tunnel requests', () => {
    expect(
      isLoopbackRequest({
        headers: { host: '127.0.0.1:3090' },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as IncomingMessage),
    ).toBe(true)

    expect(
      isLoopbackRequest({
        headers: { host: '192.168.1.100:3090' },
        socket: { remoteAddress: '192.168.1.50' },
      } as unknown as IncomingMessage),
    ).toBe(false)

    expect(
      isLoopbackRequest({
        headers: { host: 'subdomain.trycloudflare.com' },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as IncomingMessage),
    ).toBe(false)
  })

  it('extracts token from query, headers, and cookie', () => {
    expect(
      extractToken({
        url: '/?token=test_token_123',
        headers: { host: 'abc.trycloudflare.com' },
      } as unknown as IncomingMessage),
    ).toBe('test_token_123')

    expect(
      extractToken({
        url: '/',
        headers: {
          host: '192.168.1.100:3090',
          cookie: 'other=1; dsh_token=my_lan_password; theme=dark',
        },
      } as unknown as IncomingMessage),
    ).toBe('my_lan_password')
  })

  it('interceptor blocks LAN requests without password and allows after cookie auth', async () => {
    const interceptor = createAuthInterceptor(() => 'lan_secret_123')

    // 1. Unauthenticated LAN visit -> blocked with 401
    const unauthRes = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse
    const allowed1 = await interceptor(
      {
        method: 'GET',
        url: '/',
        headers: { host: '192.168.1.100:3090' },
        socket: { remoteAddress: '192.168.1.55' },
      } as unknown as IncomingMessage,
      unauthRes,
    )
    expect(allowed1).toBe(false)
    expect(unauthRes.statusCode).toBe(401)

    // 2. LAN visit with Cookie -> permitted
    const authRes = {} as unknown as ServerResponse
    const allowed2 = await interceptor(
      {
        method: 'GET',
        url: '/api/tunnel/status',
        headers: {
          host: '192.168.1.100:3090',
          cookie: 'dsh_token=lan_secret_123',
        },
        socket: { remoteAddress: '192.168.1.55' },
      } as unknown as IncomingMessage,
      authRes,
    )
    expect(allowed2).toBe(true)
  })

  it('extracts token from Authorization Bearer header', () => {
    const req = {
      url: '/',
      headers: {
        host: 'abc.trycloudflare.com',
        authorization: 'Bearer secret_bearer_token',
      },
    } as unknown as IncomingMessage
    expect(extractToken(req)).toBe('secret_bearer_token')
  })

  it('extracts token from x-dsh-token header', () => {
    const req = {
      url: '/',
      headers: {
        host: 'abc.trycloudflare.com',
        'x-dsh-token': 'custom_header_token',
      },
    } as unknown as IncomingMessage
    expect(extractToken(req)).toBe('custom_header_token')
  })

  it('middleware passes loopback requests without token', () => {
    const middleware = createAuthMiddleware(() => 'expected_token')
    const req = {
      headers: { host: '127.0.0.1:3090' },
      url: '/',
    } as unknown as IncomingMessage
    const res = {} as unknown as ServerResponse
    const next = vi.fn()

    middleware(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('middleware blocks unauthorized remote requests with 401', () => {
    const middleware = createAuthMiddleware(() => 'expected_token')
    const req = {
      headers: { host: 'subdomain.trycloudflare.com' },
      url: '/',
    } as unknown as IncomingMessage

    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse
    const next = vi.fn()

    middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.end).toHaveBeenCalled()
  })

  it('middleware allows remote request when valid token is provided', () => {
    const middleware = createAuthMiddleware(() => 'expected_token')
    const req = {
      headers: { host: 'subdomain.trycloudflare.com' },
      url: '/?token=expected_token',
    } as unknown as IncomingMessage

    const res = {
      statusCode: 200,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse
    const next = vi.fn()

    middleware(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})

describe('tunnel-cloudflared: runner', () => {
  it('instantiates with stopped initial status', () => {
    const runner = new CloudflaredRunner()
    const status = runner.getStatus()
    expect(status.running).toBe(false)
    expect(status.url).toBeUndefined()
  })
})
