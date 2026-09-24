/**
 * Web application entry: thin bootstrap over the shell library. Everything —
 * module-table seeding, the boot page, and the UI-renderer handoff — lives
 * in @deepseek-ai/dsh-client-web; this file only finds the mount point.
 */
if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40)
    view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80)
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
  }
}

interface ImportedProviderData {
  name: string
  endpoint: string
  apiKey: string
  platform: string
  models: string[]
  timestamp: number
}

function showImportNotice(data: ImportedProviderData) {
  if (document.getElementById('mowan-import-banner')) return

  const banner = document.createElement('div')
  banner.id = 'mowan-import-banner'
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 99999;
    max-width: 420px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    padding: 18px 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1e293b;
    transition: all 0.3s ease;
  `

  const maskedKey = data.apiKey.length > 8
    ? `${data.apiKey.slice(0, 4)}••••••••${data.apiKey.slice(-4)}`
    : '••••••••'

  banner.innerHTML = `
    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 20px;">⚡</span>
        <span style="font-weight: 600; font-size: 15px; color: #0f172a;">已接收到 Sub2API 配置</span>
      </div>
      <button id="mowan-import-close" style="background: none; border: none; font-size: 18px; color: #94a3b8; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>
    </div>
    <div style="margin-top: 10px; font-size: 13px; line-height: 1.6; color: #475569; background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #f1f5f9;">
      <div><strong>提供商：</strong> ${data.name}</div>
      <div style="word-break: break-all;"><strong>接口地址：</strong> ${data.endpoint}</div>
      <div><strong>API 密钥：</strong> <code>${maskedKey}</code></div>
    </div>
    <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 8px;">
      <button id="mowan-import-confirm" style="background: #2563eb; color: #fff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">知道了</button>
    </div>
  `

  document.body.appendChild(banner)

  const closeBtn = document.getElementById('mowan-import-close')
  const confirmBtn = document.getElementById('mowan-import-confirm')

  const dismiss = () => {
    banner.style.opacity = '0'
    banner.style.transform = 'translateY(-10px)'
    setTimeout(() => banner.remove(), 300)
  }

  closeBtn?.addEventListener('click', dismiss)
  confirmBtn?.addEventListener('click', dismiss)

  // 15秒后自动淡出
  setTimeout(() => {
    if (document.body.contains(banner)) dismiss()
  }, 15000)
}

function handleMowanImportParams() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    let params = url.searchParams

    if (!params.get('action') && url.hash.includes('?')) {
      const hashQuery = url.hash.split('?')[1]
      if (hashQuery) params = new URLSearchParams(hashQuery)
    }

    if (params.get('action') === 'import-provider') {
      const providerData: ImportedProviderData = {
        name: params.get('name') || 'Sub2API Provider',
        endpoint: params.get('endpoint') || '',
        apiKey: params.get('apiKey') || '',
        platform: params.get('platform') || 'openai',
        models: (params.get('models') || '').split(',').filter(Boolean),
        timestamp: Date.now()
      }

      localStorage.setItem('mowan_pending_import_provider', JSON.stringify(providerData))

      const onReady = () => showImportNotice(providerData)
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(onReady, 200)
      } else {
        window.addEventListener('DOMContentLoaded', onReady)
      }

      // 清除敏感 URL query，保护 apiKey 不滞留地址栏
      const cleanUrl = window.location.pathname + (window.location.hash.split('?')[0] || '')
      window.history.replaceState({}, document.title, cleanUrl)
    }
  } catch (e) {
    console.error('Failed to parse mowan import params:', e)
  }
}

handleMowanImportParams()

import { AppWebEntry } from '@deepseek-ai/dsh-client-web'

const el = document.getElementById('root')
if (el === null) throw new Error('web app: missing #root')
void new AppWebEntry(el).run()
