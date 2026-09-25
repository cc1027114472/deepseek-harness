import { useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { useUpdateManager } from './update-manager.ts'
import css from './AboutUpdateRow.module.css'

export type AboutUpdateRowProps = PropsRuntime<'settings.general.item'>

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function AboutUpdateRow(_props: AboutUpdateRowProps) {
  const { updateInfo, progress, isChecking, check, download, apply } = useUpdateManager()
  const [applying, setApplying] = useState(false)
  const [applyMsg, setApplyMsg] = useState('')

  const handleApply = async () => {
    setApplying(true)
    setApplyMsg('正在启动安装升级程序，魔丸即将重启...')
    const res = await apply()
    if (!res.success) {
      setApplying(false)
      setApplyMsg(res.error || '执行更新升级失败')
    }
  }

  const renderChangelog = () => {
    if (!updateInfo.changelog) return null
    const items = Array.isArray(updateInfo.changelog)
      ? updateInfo.changelog
      : updateInfo.changelog.split('\n').filter(Boolean)

    return (
      <div className={css.changelogCard}>
        <div className={css.changelogTitle}>
          版本更新日志 (v{updateInfo.latestVersion})：
        </div>
        <ul className={css.changelogList}>
          {items.map((item, idx) => (
            <li key={idx}>{item.replace(/^[-*]\s*/, '')}</li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className={css.group}>
      <div className={css.headerRow}>
        <div className={css.titleArea}>
          <span className={css.title}>魔丸 AI 智能助手</span>
          <span className={css.versionTag}>v{updateInfo.currentVersion}</span>
          {updateInfo.hasUpdate && (
            <span className={css.newVersionBadge}>
              发现新版本 v{updateInfo.latestVersion}
            </span>
          )}
        </div>

        <div className={css.btnGroup}>
          <button
            type="button"
            className={css.btnSecondary}
            disabled={isChecking || progress.status === 'downloading' || applying}
            onClick={() => void check(true)}
          >
            {isChecking ? '正在检查...' : '检查更新'}
          </button>

          {updateInfo.hasUpdate && progress.status === 'idle' && (
            <>
              {updateInfo.downloadUrl && (
                <button
                  type="button"
                  className={css.btnSecondary}
                  onClick={() => {
                    if (updateInfo.downloadUrl) {
                      window.open(updateInfo.downloadUrl, '_blank')
                    }
                  }}
                >
                  浏览器下载
                </button>
              )}
              <button
                type="button"
                className={css.btnPrimary}
                onClick={() => void download(updateInfo.downloadUrl)}
              >
                立即下载并更新
              </button>
            </>
          )}
        </div>
      </div>

      {updateInfo.hasUpdate && renderChangelog()}

      {progress.status === 'downloading' && (
        <div className={css.progressContainer}>
          <div className={css.progressBarBg}>
            <div
              className={css.progressBarFill}
              style={{ width: `${progress.pct}%` }}
            />
          </div>
          <div className={css.progressText}>
            <span>正在高速下载安装包...</span>
            <span>
              {progress.pct}% ({formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)})
            </span>
          </div>
        </div>
      )}

      {progress.status === 'downloaded' && (
        <div className={css.readyNotice}>
          <span>
            {applyMsg || '新版本已下载完毕并通过 SHA-256 完整性校验，随时可以重启完成升级。'}
          </span>
          <button
            type="button"
            className={css.btnPrimary}
            disabled={applying}
            onClick={() => void handleApply()}
          >
            {applying ? '正在启动升级程序...' : '立即重启并安装'}
          </button>
        </div>
      )}

      {progress.status === 'error' && (
        <div className={css.errorMessage}>
          下载更新失败: {progress.error}
          <button
            type="button"
            className={css.btnSecondary}
            style={{ marginLeft: 8 }}
            onClick={() => void download(updateInfo.downloadUrl)}
          >
            重试
          </button>
        </div>
      )}
    </div>
  )
}
