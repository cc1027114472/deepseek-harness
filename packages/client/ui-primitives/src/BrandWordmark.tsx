// Mowan (魔丸) brand wordmark.

import type { IconProps } from './icons/props.ts'
import { FishLogo } from './FishLogo.tsx'

/** Display options for the official brand wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Whether to include the leading emblem mark; defaults to true. */
  includeMark?: boolean | undefined
}

/**
 * Render the full brand wordmark.
 * @param props.size - height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading emblem mark.
 * @returns the wordmark react element.
 */
export function BrandWordmark({ size = 24, className, includeMark = true }: BrandWordmarkProps) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        lineHeight: 1,
      }}
    >
      {includeMark && <FishLogo size={size} />}
      <span
        style={{
          fontSize: `${Math.round(size * 0.65)}px`,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color: 'var(--dsw-alias-label-primary, currentColor)',
          userSelect: 'none',
        }}
      >
        魔丸
      </span>
    </span>
  )
}
