/**
 * Tunnel remote access client plugin, browser half.
 * Registers the 'tunnel' section on the Settings page.
 * @module @deepseek-ai/dsh-client-ui-tunnel/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TunnelSection } from './TunnelSection.tsx'
import { zh, en, type TunnelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Tunnel settings section copy. */
    'settings.tunnel': TunnelKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.tunnel'

/** Required services: slots for UI composition, locale for dictionary. */
export const inject = ['slots', 'locale']

/**
 * Register the Tunnel section once the `settings.section` declaration is available on the ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-tunnel: dictionaries')

  const t = ctx.locale.bind(NS)

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'tunnel',
      order: 40,
      label: () => t('nav'),
      inject: () => ({ t }),
    }, TunnelSection)
  )
}
