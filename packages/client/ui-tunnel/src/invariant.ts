/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-tunnel`.
 * @module @deepseek-ai/dsh-client-ui-tunnel/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-tunnel'

/** Cordis companion plugin name. */
export const name = 'client-ui-tunnel-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this client-side UI plugin registers presentation slots into the
 * settings shell. Slot presence and DOM rendering are tested in frontend component suites.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
