# @deepseek-ai/dsh-client-ui-tunnel

Browser-side UI plugin for DeepSeek Harness remote access. Mounts a dedicated "Remote Access" section inside the Web GUI settings panel, exposing Cloudflare Tunnel lifecycle controls, status, URL copying, and QR code pairing for mobile browsers.

## Capabilities

- **Status & Control Card**: Displays whether the tunnel is running, installed, or stopped, and allows one-click start/stop.
- **Auto Binary Install**: Detects missing `cloudflared` binary and provides a one-click installation action.
- **Secure Token Pairing**: Shows the external authentication token with quick copy and token regeneration actions.
- **Mobile QR Code Pairing**: Generates a pairing QR code embedding the URL and token for mobile camera connection.

## Model Experience

This plugin contains only presentation components and user-interface state. It contributes nothing to model prompts, context tokens, or session event streams.

## Known Limitations and Deferred Work

- QR code rendering currently relies on the standard QR code generator image service; offline environments will display the raw URL and token text instead.
