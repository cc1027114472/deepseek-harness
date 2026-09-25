import { useState, useEffect, useCallback } from 'react'

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  releaseDate?: string
  downloadUrl?: string
  changelog?: string[] | string
  mandatory?: boolean
  fileSize?: number
  error?: string
}

export interface DownloadProgress {
  status: 'idle' | 'downloading' | 'downloaded' | 'error'
  pct: number
  downloadedBytes: number
  totalBytes: number
  error?: string
  filePath?: string
}

let globalUpdateInfo: UpdateInfo = {
  hasUpdate: false,
  currentVersion: '2.0.3',
}

let globalProgress: DownloadProgress = {
  status: 'idle',
  pct: 0,
  downloadedBytes: 0,
  totalBytes: 0,
}

const listeners = new Set<() => void>()

function notifyListeners() {
  listeners.forEach(fn => fn())
}

let isChecking = false

export async function fetchUpdateCheck(force = false): Promise<UpdateInfo> {
  if (isChecking) return globalUpdateInfo
  isChecking = true
  notifyListeners()
  try {
    const res = await fetch(`/api/system/update/check?force=${force}`)
    if (res.ok) {
      const data = (await res.json()) as UpdateInfo
      globalUpdateInfo = data
    }
  } catch (err) {
    globalUpdateInfo = {
      ...globalUpdateInfo,
      error: String(err),
    }
  } finally {
    isChecking = false
    notifyListeners()
  }
  return globalUpdateInfo
}

export async function pollDownloadStatus(): Promise<DownloadProgress> {
  try {
    const res = await fetch('/api/system/update/status')
    if (res.ok) {
      const data = (await res.json()) as { currentVersion: string; progress: DownloadProgress }
      globalProgress = data.progress
      notifyListeners()
    }
  } catch {
    // ignore
  }
  return globalProgress
}

export async function triggerDownload(downloadUrl?: string, sha256?: string): Promise<boolean> {
  try {
    const res = await fetch('/api/system/update/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ downloadUrl, sha256 }),
    })
    if (res.ok) {
      globalProgress = { ...globalProgress, status: 'downloading', pct: 0 }
      notifyListeners()
      return true
    }
  } catch {
    // ignore
  }
  return false
}

export async function triggerApply(): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/system/update/apply', { method: 'POST' })
    if (res.ok) {
      return (await res.json()) as { success: boolean; error?: string }
    }
    return { success: false, error: '请求升级失败' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// Auto check after app start
if (typeof window !== 'undefined') {
  setTimeout(() => {
    void fetchUpdateCheck(false)
  }, 3000)
}

export function useUpdateManager() {
  const [, setTick] = useState(0)

  useEffect(() => {
    const onUpdate = () => {
      setTick(t => t + 1)
    }
    listeners.add(onUpdate)
    return () => {
      listeners.delete(onUpdate)
    }
  }, [])

  // Poll progress when downloading
  useEffect(() => {
    if (globalProgress.status === 'downloading') {
      const timer = setInterval(() => {
        void pollDownloadStatus()
      }, 800)
      return () => clearInterval(timer)
    }
  }, [])

  const check = useCallback((force = true) => {
    return fetchUpdateCheck(force)
  }, [])

  const download = useCallback((url?: string, sha256?: string) => {
    return triggerDownload(url, sha256)
  }, [])

  const apply = useCallback(() => {
    return triggerApply()
  }, [])

  return {
    updateInfo: globalUpdateInfo,
    progress: globalProgress,
    isChecking,
    check,
    download,
    apply,
  }
}
