/**
 * TunnelSection: Settings page view for LAN & Cloudflare Tunnel access configuration,
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

interface LanAddressInfo {
  name: string
  ip: string
  url: string
}

interface TunnelStatus {
  installed: boolean
  version?: string
  running: boolean
  url?: string
  error?: string
  authToken?: string
  lanAddresses?: LanAddressInfo[]
}

interface QrModalData {
  title: string
  tip: string
  url: string
}

export function TunnelSection({ t }: TunnelSectionProps) {
  const [status, setStatus] = useState<TunnelStatus>({
    installed: false,
    running: false,
  })
  const [loading, setLoading] = useState<boolean>(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [qrModal, setQrModal] = useState<QrModalData | null>(null)

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
    // Poll status periodically
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
        const err = (await res.json()) as { error?: string }
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

  const publicPairingUrl = status.url && status.authToken
    ? `${status.url}/?token=${encodeURIComponent(status.authToken)}`
    : status.url ?? ''

  return (
    <div className={css.container}>
      <div className={css.header}>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.description}>{t('description')}</p>
      </div>

      {/* Card 1: Real Physical LAN Addresses */}
      <div className={css.card}>
        <div className={css.field}>
          <div className={css.row}>
            <label className={css.fieldLabel}>{t('lanTitle')}</label>
          </div>
          <p className={css.tip}>{t('lanTip')}</p>

          <div className={css.lanList} style={{ marginTop: '8px' }}>
            {status.lanAddresses && status.lanAddresses.length > 0 ? (
              status.lanAddresses.map((lan, idx) => {
                const lanPairingUrl = status.authToken
                  ? `${lan.url}/?token=${encodeURIComponent(status.authToken)}`
                  : lan.url
                return (
                  <div key={idx} className={css.lanItem}>
                    <div className={css.lanHeader}>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>
                        {lan.name}
                      </span>
                      <span className={css.lanBadge}>物理网卡 ({lan.ip})</span>
                    </div>
                    <div className={css.inputGroup}>
                      <input
                        className={css.input}
                        readOnly
                        value={lan.url}
                      />
                      <button
                        className={css.btnSecondary}
                        onClick={() => copyToClipboard(lan.url, `lan_${idx}`)}
                      >
                        {copiedKey === `lan_${idx}` ? t('copied') : t('actionCopyLan')}
                      </button>
                      <button
                        className={css.btnPrimary}
                        onClick={() =>
                          setQrModal({
                            title: `${lan.name} - ${t('lanPairingQrTitle')}`,
                            tip: t('lanPairingQrDesc'),
                            url: lanPairingUrl,
                          })
                        }
                      >
                        {t('lanScanQr')}
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <p className={css.tip}>{t('noLanFound')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Card 2: LAN & Remote Access Password/Token Control */}
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

      {/* Card 3: Cloudflare Tunnel Process Control */}
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
                    onClick={() =>
                      setQrModal({
                        title: t('qrModalTitle'),
                        tip: t('qrModalTip'),
                        url: publicPairingUrl,
                      })
                    }
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

      {/* Unified QR Code Pairing Modal */}
      {qrModal && (
        <div className={css.qrOverlay} onClick={() => setQrModal(null)}>
          <div className={css.qrCard} onClick={e => e.stopPropagation()}>
            <h3 className={css.title}>{qrModal.title}</h3>
            <p className={css.tip}>{qrModal.tip}</p>
            <img
              className={css.qrImage}
              alt="Scan QR"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                qrModal.url,
              )}`}
            />
            <button
              className={css.btnSecondary}
              onClick={() => setQrModal(null)}
            >
              {t('qrModalClose')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
