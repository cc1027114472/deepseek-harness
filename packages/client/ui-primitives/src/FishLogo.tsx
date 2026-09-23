// Mowan (魔丸) Agent official emblem.
// High-definition celestial flame & gold orbit symbol.

import type { IconProps } from './icons/props.ts'
import { MOWAN_LOGO_BASE64 } from './mowan-logo-base64.ts'

/**
 * Render the Mowan (魔丸) official emblem.
 * @param props.size - width/height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the emblem svg.
 */
export function FishLogo({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      className={className}
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <image href={MOWAN_LOGO_BASE64} width="128" height="128" />
    </svg>
  )
}
