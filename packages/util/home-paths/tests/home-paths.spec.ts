import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DSH_HOME_DISPLAY,
  DSH_HOME_DIR_NAME,
  canonicalizeWatchPath,
  defaultDshHome,
  dshHomeDisplay,
  dshHomePath,
  expandHomePath,
  resolveDshHome,
} from '@deepseek-ai/dsh-home-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('dsh path helpers', () => {
  it('owns the shared default DSH home directory name', () => {
    expect(DSH_HOME_DIR_NAME).toBe('.mowan')
    expect(DEFAULT_DSH_HOME_DISPLAY).toBe('~/.mowan')
    expect(defaultDshHome()).toBe(join(homedir(), '.mowan'))
  })

  it('expands tilde paths without changing non-tilde paths', () => {
    expect(expandHomePath('~')).toBe(homedir())
    expect(expandHomePath('~/.mowan')).toBe(join(homedir(), '.mowan'))
    expect(expandHomePath('~\\.mowan')).toBe(join(homedir(), '.mowan'))
    expect(expandHomePath('/tmp/.mowan')).toBe('/tmp/.mowan')
    expect(expandHomePath('~other/.mowan')).toBe('~other/.mowan')
  })

  it('resolves explicit path before MOWAN_HOME and the default', () => {
    const mowanHome = join(homedir(), 'env-mowan')

    expect(resolveDshHome('/tmp/explicit-mowan', { MOWAN_HOME: '~/env-mowan' })).toBe(resolve('/tmp/explicit-mowan'))
    expect(resolveDshHome(undefined, { MOWAN_HOME: '~/env-mowan' })).toBe(mowanHome)
    expect(resolveDshHome(undefined, { DSH_HOME: '~/env-dsh' })).toBe(defaultDshHome())
    expect(resolveDshHome(undefined, {})).toBe(defaultDshHome())
  })

  it('treats an empty or whitespace-only MOWAN_HOME as unset', () => {
    expect(resolveDshHome(undefined, { MOWAN_HOME: '' })).toBe(defaultDshHome())
    expect(resolveDshHome(undefined, { MOWAN_HOME: '   ' })).toBe(defaultDshHome())
  })

  it('joins child segments onto the resolved MOWAN_HOME', () => {
    vi.stubEnv('MOWAN_HOME', '~/env-mowan')
    expect(dshHomePath()).toBe(join(homedir(), 'env-mowan'))
    expect(dshHomePath('storages', 'cache')).toBe(join(homedir(), 'env-mowan', 'storages', 'cache'))
  })

  it('labels a resolved home by whether it is the default root', () => {
    expect(dshHomeDisplay(resolve(defaultDshHome()))).toBe('~/.mowan')
    expect(dshHomeDisplay('/some/other/root')).toBe('$MOWAN_HOME')
  })

  it('canonicalizes a watcher ancestor while preserving a missing suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-watch-path-'))
    const target = join(root, 'target')
    const alias = join(root, 'alias')
    try {
      await mkdir(target)
      await symlink(target, alias, process.platform === 'win32' ? 'junction' : 'dir')
      await expect(canonicalizeWatchPath(join(alias, 'later', 'config.yml'))).resolves.toBe(
        join(await realpath(target), 'later', 'config.yml'),
      )
      const file = join(root, 'file')
      await writeFile(file, 'not a directory')
      await expect(canonicalizeWatchPath(join(file, 'child'))).rejects.toMatchObject({ code: 'ENOTDIR' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
