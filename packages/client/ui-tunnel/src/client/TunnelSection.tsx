/**
 * TunnelSection: Settings page view for Cloudflare Tunnel configuration,
 * connection status, secure token/password management, and mobile QR code pairing.
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

  // Password editing states
  const [isEditingPassword, setIsEditingPassword] = useState<boolean>(false)
  const [passwordInput, setPasswordInput] = useState<string>('')
  const [showPlainPassword, setShowPlainPassword] = useState<boolean>(false)
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; isError?: boolean } | null>(null)

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
        setFeedbackMsg({ text: t('actionResetToken') + '成功' })
        setTimeout(() => setFeedbackMsg(null), 3000)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSavePassword = async () => {
    const trimmed = passwordInput.trim()
    if (!trimmed) {
      setFeedbackMsg({ text: t('passwordEmpty'), isError: true })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/tunnel/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: trimmed }),
      })
      if (res.ok) {
        const data = (await res.json()) as TunnelStatus
        setStatus(data)
        setIsEditingPassword(false)
        setPasswordInput('')
        setFeedbackMsg({ text: t('passwordSaved') })
        setTimeout(() => setFeedbackMsg(null), 3000)
      } else {
        const err = await res.json()
        setFeedbackMsg({ text: err.error || '保存失败', isError: true })
      }
    } catch {
      setFeedbackMsg({ text: '网络异常，保存失败', isError: true })
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

      {/* Card 1: LAN & Remote Access Password/Token Control */}
      <div className={css.card}>
        <div className={css.field}>
          <div className={css.row}>
            <label className={css.fieldLabel}>{t('tokenLabel')}</label>
            {feedbackMsg && (
              <span
                style={{
                  fontSize: '12px',
                  color: feedbackMsg.isError ? '#ef4444' : '#10b981',
                  fontWeight: 500,
                }}
              >
                {feedbackMsg.text}
              </span>
            )}
          </div>
          <p className={css.tip}>{t('tokenTip')}</p>

          {isEditingPassword ? (
            <div className={css.inputGroup} style={{ marginTop: '8px' }}>
              <input
                className={css.input}
                type="text"
                placeholder={t('passwordPlaceholder')}
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                autoFocus
              />
              <button
                className={css.btnPrimary}
                onClick={handleSavePassword}
                disabled={loading}
              >
                {t('actionSavePassword')}
              </button>
              <button
                className={css.btnSecondary}
                onClick={() => {
                  setIsEditingPassword(false)
                  setPasswordInput('')
                  setFeedbackMsg(null)
                }}
                disabled={loading}
              >
                {t('actionCancel')}
              </button>
            </div>
          ) : (
            <div className={css.inputGroup} style={{ marginTop: '8px' }}>
              <input
                className={css.input}
                type={showPlainPassword ? 'text' : 'password'}
                readOnly
                value={status.authToken ?? ''}
              />
              <button
                className={css.btnSecondary}
                onClick={() => setShowPlainPassword(!showPlainPassword)}
              >
                {showPlainPassword ? t('hidePassword') : t('showPassword')}
              </button>
              <button
                className={css.btnSecondary}
                onClick={() => {
                  setPasswordInput(status.authToken ?? '')
                  setIsEditingPassword(true)
                  setFeedbackMsg(null)
                }}
              >
                {t('actionEditPassword')}
              </button>
              <button
                className={css.btnSecondary}
                onClick={() => copyToClipboard(status.authToken ?? '', 'token')}
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
          )}
        </div>
      </div>

      {/* Card 2: Cloudflare Tunnel Process Control */}
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
                    onClick={() => copyToClipboard(status.url ?? '', 'url')}
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
        )}

        {status.error && (
          <p className={`${css.tip} ${css.btnDanger}`} style={{ padding: '8px', borderRadius: '4px' }}>
            {status.error}
          </p>
        )}
      </div>

      {showQr && fullPairingUrl && (
        <div className={css.qrOverlay} onClick={() => setShowQr(false)}>
          <div className={css.qrCard} onClick={e => e.stopPropagation()}>
            <h3 className={css.title}>{t('qrModalTitle')}</h3>
            <p className={css.tip}>{t('qrModalTip')}</p>
            <img
              className={css.qrImage}
              alt="Scan QR"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                fullPairingUrl,
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
