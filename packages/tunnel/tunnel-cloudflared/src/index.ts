/**
 * Cloudflare Tunnel service provider for DeepSeek Harness.
 * Manages cloudflared binary lifecycle, starts/stops temporary or named tunnels,
 * and guards external requests via token validation.
 * @module @deepseek-ai/dsh-tunnel-cloudflared
 */

import z from '@deepseek-ai/schemastery'
import { TunnelServiceImpl } from './service.ts'
import type { TunnelConfig } from './types.ts'

export type { TunnelConfig, TunnelMode, TunnelService, TunnelStatus } from './types.ts'
export { TunnelServiceImpl } from './service.ts'
export { CloudflaredRunner, checkInstalled, installCloudflared, getBinaryPath } from './cloudflared-runner.ts'
export { createAuthMiddleware, extractToken, generateAuthToken, isLoopbackHost } from './auth-guard.ts'

/** Cordis plugin schema for tunnel-cloudflared. */
export const Config: z<TunnelConfig> = z.object({
  enabled: z.boolean().default(false).description('Whether to automatically start the tunnel on startup'),
  mode: z.union(['quick', 'auth']).default('quick').description('Tunnel mode: quick (temporary) or auth (token)'),
  port: z.number().default(3080).description('Local port to expose'),
  token: z.string().description('Cloudflare Named Tunnel token (when mode is auth)'),
  useHttp2: z.boolean().default(true).description('Use HTTP/2 protocol for better compatibility'),
  authToken: z.string().default('auto').description('Authentication token for remote access (auto generates a random token)'),
})

// Attach Config to Service class for Cordis loader reflection
;(TunnelServiceImpl as unknown as { Config: typeof Config }).Config = Config

export default TunnelServiceImpl
