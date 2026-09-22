# @deepseek-ai/dsh-tunnel-cloudflared

Cloudflare Tunnel (`cloudflared`) provider for DeepSeek Harness. Exposes the local Web GUI and API Gateway to remote devices (such as mobile phones, tablets, or remote laptops) securely without requiring a public IP address or port forwarding.

## Capabilities

- **Zero-Configuration Quick Tunnels**: Generates temporary `https://*.trycloudflare.com` URLs with automatic TLS encryption.
- **Named Tunnels**: Supports Cloudflare Tunnel Token for persistent custom domain binding.
- **Cross-Platform Automatic Binary Lifecycle**: Automatically downloads and installs the platform-specific `cloudflared` binary into `$DSH_HOME/bin`.
- **Remote Access Token Fence**: Seamless access from loopback origins while requiring token authentication for visitors arriving over the public tunnel.

## Configuration

In `cordis.yml` or bundle configuration:

```yaml
plugins:
  tunnel-cloudflared:
    enabled: false         # Auto-start on boot
    mode: quick            # 'quick' or 'auth'
    port: 3080             # Target local port
    useHttp2: true         # HTTP/2 protocol for network compatibility
    authToken: auto        # 'auto' generates a secure random token
```

## Model Experience

This package manages child process networking and HTTP authentication. It has zero impact on model system prompts, context windows, token consumption, or KV cache.

## Known Limitations and Deferred Work

- Remote mobile browser interaction currently relies on standard Web GUI responsive layout.
- Quick tunnels (`trycloudflare.com`) are temporary and will change whenever the tunnel process restarts.
