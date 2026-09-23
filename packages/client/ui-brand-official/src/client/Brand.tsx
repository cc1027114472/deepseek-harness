import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

type OfficialBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official whale mark.
 */
export function OfficialBrandMark({ size, className }: OfficialBrandMarkProps) {
  return <FishLogo size={size} className={className} />
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return (
    <span
      style={{
        fontSize: '15px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: 'var(--dsw-alias-label-primary, currentColor)',
        lineHeight: 1,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      魔丸
    </span>
  )
}
