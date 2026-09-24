import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './HeroShell.module.css'

export interface GitBranchChipProps {
  /** Directory path to inspect; falls back to host cwd if absent. */
  cwd?: string | undefined
  className?: string | undefined
}

/**
 * Chip displaying the active Git branch of the workspace.
 * Clicking the chip manually refreshes the branch detection.
 */
export function GitBranchChip({ cwd, className }: GitBranchChipProps) {
  const [branch, setBranch] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchBranch = useCallback(async () => {
    try {
      setLoading(true)
      const url = cwd && cwd.trim().length > 0
        ? `/api/git-branch?path=${encodeURIComponent(cwd)}`
        : '/api/git-branch'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json() as { branch: string | null }
        setBranch(data.branch)
      } else {
        setBranch(null)
      }
    } catch {
      setBranch(null)
    } finally {
      setLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    void fetchBranch()
  }, [fetchBranch])

  if (!branch) return null

  return (
    <button
      type="button"
      className={clsx(css.gitBranchChip, loading && css.gitBranchLoading, className)}
      title={`当前 Git 分支: ${branch} (点击刷新)`}
      aria-label={`当前 Git 分支: ${branch}`}
      onClick={() => { void fetchBranch() }}
    >
      <IconBranchOutline16 className={css.branchIcon} size={14} />
      <span className={css.branchLabel}>{branch}</span>
    </button>
  )
}
