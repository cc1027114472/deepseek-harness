import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: '魔丸 - mowan-agent',
    short_name: '魔丸',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/favicon.png',
      sizes: '64x64',
      type: 'image/png',
      purpose: 'any',
    }],
  })
})

it('ships a favicon with mowan icon', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  expect(favicon).toContain('image')
})
