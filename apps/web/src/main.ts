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
        timestamp: Date.now(),
      }

      localStorage.setItem('mowan_pending_import_provider', JSON.stringify(providerData))

      const triggerOpenSettings = () => {
        window.dispatchEvent(new CustomEvent('dsh:open-settings', { detail: { section: 'models' } }))
      }

      setTimeout(triggerOpenSettings, 200)
      setTimeout(triggerOpenSettings, 800)
      setTimeout(triggerOpenSettings, 1500)

      // 清除敏感 URL query，保护 apiKey 不滞留地址栏
      const cleanUrl = window.location.pathname + '#/settings'
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
