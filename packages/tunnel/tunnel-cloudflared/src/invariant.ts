/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-tunnel-cloudflared`.
 * @module @deepseek-ai/dsh-tunnel-cloudflared/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-tunnel-cloudflared'

/** Cordis companion plugin name. */
export const name = 'tunnel-cloudflared-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the tunnel-cloudflared provider manages local child processes and
 * optional HTTP auth headers; its lifecycle contracts are verified in integration suites.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
