/**
 * TunnelSection: Settings page view for Cloudflare Tunnel configuration,
 * connection status, secure token management, and mobile QR code pairing.
 * @module @deepseek-ai/dsh-client-ui-tunnel/client/TunnelSection
 */

import { useState, useEffect, useCallback } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TunnelKey } from './locales.ts'
import css from './TunnelSection.module.css'

export interface TunnelSectionProps extends PropsRuntime<'settings.section'> {
  t: (key: TunnelKey) => string
}

interface TunnelStatus {
  installed: boolean
  version?: string
  running: boolean
  url?: string
  error?: string
  authToken?: string
}

export function TunnelSection({ t }: TunnelSectionProps) {
  const [status, setStatus] = useState<TunnelStatus>({
    installed: false,
    running: false,
  })
  const [loading, setLoading] = useState<boolean>(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showQr, setShowQr] = useState<boolean>(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tunnel/status')
      if (res.ok) {
        const data = (await res.json()) as TunnelStatus
        setStatus(data)
      }
    } catch {
      // Offline or service not ready
    }
  }, [])

  useEffect(() => {
    void fetchStatus()
    // Poll status when starting or running
    const interval = setInterval(() => {
      void fetchStatus()
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleStart = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' })
      if (res.ok) {
        const data = (await res.json()) as TunnelStatus
        setStatus(data)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tunnel/stop', { method: 'POST' })
      if (res.ok) {
        const data = (await res.json()) as TunnelStatus
        setStatus(data)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tunnel/install', { method: 'POST' })
      if (res.ok) {
        const data = (await res.json()) as TunnelStatus
        setStatus(data)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResetToken = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tunnel/reset-token', { method: 'POST' })
      if (res.ok) {
        const data = (await res.json()) as TunnelStatus
        setStatus(data)
      }
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    }).catch(() => {})
  }

  const fullPairingUrl = status.url && status.authToken
    ? `${status.url}/?token=${status.authToken}`
    : status.url ?? ''

  return (
    <div className={css.container}>
      <div className={css.header}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.description}>{t('description')}</p>
      </div>

      <div className={css.card}>
        <div className={css.row}>
          <div className={css.statusIndicator}>
            <span
              className={`${css.badge} ${
                status.running ? css.badgeRunning : css.badgeStopped
              }`}
            />
            <span>
              {status.running ? t('statusRunning') : t('statusStopped')}
            </span>
            {status.version && (
              <span className={css.tip}>({status.version})</span>
            )}
          </div>

          <div className={css.row}>
            {!status.installed ? (
              <button
                className={css.btnPrimary}
                onClick={handleInstall}
                disabled={loading}
              >
                {loading ? t('statusInstalling') : t('actionInstall')}
              </button>
            ) : status.running ? (
              <button
                className={`${css.btnSecondary} ${css.btnDanger}`}
                onClick={handleStop}
                disabled={loading}
              >
                {t('actionStop')}
              </button>
            ) : (
              <button
                className={css.btnPrimary}
                onClick={handleStart}
                disabled={loading}
              >
                {t('actionStart')}
              </button>
            )}
          </div>
        </div>

        {!status.installed && (
          <p className={css.tip}>{t('notInstalledTip')}</p>
        )}

        {status.running && (
          <>
            <div className={css.field}>
              <label className={css.fieldLabel}>{t('urlLabel')}</label>
              <div className={css.inputGroup}>
                <input
                  className={css.input}
                  readOnly
                  value={status.url ?? 'Allocating public URL...'}
                />
                {status.url && (
                  <>
                    <button
                      className={css.btnSecondary}
                      onClick={() => copyToClipboard(status.url!, 'url')}
                    >
                      {copiedKey === 'url' ? t('copied') : t('actionCopyUrl')}
                    </button>
                    <button
                      className={css.btnPrimary}
                      onClick={() => setShowQr(true)}
                    >
                      {t('actionShowQr')}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className={css.field}>
              <label className={css.fieldLabel}>{t('tokenLabel')}</label>
              <div className={css.inputGroup}>
                <input
                  className={css.input}
                  readOnly
                  value={status.authToken ?? ''}
                />
                <button
                  className={css.btnSecondary}
                  onClick={() => copyToClipboard(status.authToken!, 'token')}
                >
                  {copiedKey === 'token' ? t('copied') : t('actionCopyToken')}
                </button>
                <button
                  className={css.btnSecondary}
                  onClick={handleResetToken}
                  disabled={loading}
                >
                  {t('actionResetToken')}
                </button>
              </div>
              <p className={css.tip}>{t('tokenTip')}</p>
            </div>
          </>
        )}

        {status.error && (
          <p className={css.tip} style={{ color: 'var(--dsw-interactive-danger, #ef4444)' }}>
            Error: {status.error}
          </p>
        )}
      </div>

      {showQr && fullPairingUrl && (
        <div className={css.qrOverlay} onClick={() => setShowQr(false)}>
          <div className={css.qrCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={css.title}>{t('qrModalTitle')}</h3>
            <p className={css.tip}>{t('qrModalTip')}</p>
            <img
              className={css.qrImage}
              alt="Scan QR"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                fullPairingUrl
              )}`}
            />
            <button
              className={css.btnSecondary}
              onClick={() => setShowQr(false)}
            >
              {t('qrModalClose')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
