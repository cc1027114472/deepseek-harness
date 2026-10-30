import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Resolves the current git branch name for a given directory.
 * Traverses up directory tree looking for .git.
 * Handles normal repositories, git worktrees, and detached HEADs.
 *
 * @param startDir - directory to inspect (defaults to process.cwd()).
 * @returns branch name (or short commit hash when detached), or null if not a git repository.
 */
export function resolveGitBranch(startDir?: string): string | null {
  const root = startDir && startDir.trim().length > 0 ? resolve(startDir) : process.cwd()
  let curr = root
  try {
    while (true) {
      const gitPath = join(curr, '.git')
      if (existsSync(gitPath)) {
        let finalGit = gitPath
        const stat = statSync(gitPath)
        if (stat.isFile()) {
          const match = readFileSync(gitPath, 'utf8').match(/gitdir:\s*(.+)/i)
          if (match && match[1]) {
            finalGit = resolve(curr, match[1].trim())
          }
        }
        const headPath = join(finalGit, 'HEAD')
        if (!existsSync(headPath)) return null
        const head = readFileSync(headPath, 'utf8').trim()
        if (head.startsWith('ref: refs/heads/')) {
          return head.slice('ref: refs/heads/'.length).trim()
        }
        // Detached HEAD or commit hash: return first 7 characters
        return head.slice(0, 7)
      }
      const parent = dirname(curr)
      if (parent === curr) break
      curr = parent
    }
  } catch {
    return null
  }
  return null
}
