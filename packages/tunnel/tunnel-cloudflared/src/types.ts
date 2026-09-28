/**
 * Public types for the Cloudflare Tunnel service and Cordis plugin.
 * @module @deepseek-ai/dsh-tunnel-cloudflared/types
 */

export type TunnelMode = 'quick' | 'auth'

/** Real accessible LAN address information on physical network interfaces. */
export interface LanAddressInfo {
  /** Name of the network interface (e.g. "WLAN 3", "Ethernet"). */
  name: string
  /** IPv4 address literal (e.g. "192.168.1.104"). */
  ip: string
  /** Ready-to-use HTTP URL with port (e.g. "http://192.168.1.104:3090"). */
  url: string
}

/** Current runtime status of the Cloudflared tunnel. */
export interface TunnelStatus {
  /** Whether the cloudflared executable is present locally. */
  installed: boolean
  /** Version string reported by cloudflared --version if installed. */
  version?: string
  /** Whether the tunnel process is currently running. */
  running: boolean
  /** Public HTTPS URL captured from cloudflared output. */
  url?: string
  /** Last error message encountered, if any. */
  error?: string
  /** Generated or configured authentication token required for remote access. */
  authToken?: string
  /** Physical LAN addresses accessible by devices on the local network. */
  lanAddresses?: LanAddressInfo[]
}

/** Configuration options for the tunnel plugin. */
export interface TunnelConfig {
  /** Whether to automatically start the tunnel on harness startup. Default is false. */
  enabled?: boolean
  /** Tunnel mode: quick (auto temporary URL) or auth (Cloudflare Named Tunnel with token). */
  mode?: TunnelMode
  /** Target local port to expose. Default is 3090. */
  port?: number
  /** Named tunnel token when mode is 'auth'. */
  token?: string
  /** Use HTTP/2 protocol for better compatibility in restrictive networks. Default true. */
  useHttp2?: boolean
  /** Custom auth token for remote visitors. 'auto' generates a random token. */
  authToken?: string
}

/** Tunnel service interface exposed on Cordis Context (`ctx.tunnel`). */
export interface TunnelService {
  /** Check if cloudflared binary is installed and its version. */
  checkInstalled(): Promise<{ installed: boolean; version?: string }>
  /** Download and install cloudflared binary for current platform/architecture. */
  install(): Promise<TunnelStatus>
  /** Start the cloudflared tunnel process. */
  start(config?: Partial<TunnelConfig>): Promise<TunnelStatus>
  /** Stop the cloudflared tunnel process. */
  stop(): Promise<TunnelStatus>
  /** Get current tunnel status. */
  getStatus(): TunnelStatus
  /** Set and persist a custom authentication token/password. */
  setAuthToken(token: string): Promise<TunnelStatus>
  /** Validate an access token from an external visitor. */
  validateToken(token: string | undefined): boolean
}
