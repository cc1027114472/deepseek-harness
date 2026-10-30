/**
 * Cloudflare Tunnel client UI package (Node half).
 * The UI is contributed entirely in the browser half (`./client`).
 * @module @deepseek-ai/dsh-client-ui-tunnel
 */

import type { Context } from '@deepseek-ai/cordis'

/** Plugin name. */
export const name = 'client-ui-tunnel'

/** Node half apply is a no-op; all contributions register in browser runtime. */
export function apply(_ctx: Context): void {}
