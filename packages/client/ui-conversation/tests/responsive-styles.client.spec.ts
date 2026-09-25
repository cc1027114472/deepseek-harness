/**
 * Responsive stylesheet contract for mobile viewports, asserted against CSS files on disk.
 *
 * Confirms that mobile optimizations use isolated @media (max-width: 768px) queries,
 * preserve desktop rules intact, prevent tree-breaking word wraps, compact the settings modal,
 * and provide a compact 44px rail for mobile interactions.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readSheet = (relPath: string) =>
  readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8')

const codeBlockCss = readSheet('../../ui-primitives/src/markdown/CodeBlock.module.css')
const markdownTextCss = readSheet('../../ui-primitives/src/markdown/MarkdownText.module.css')
const appFrameCss = readSheet('../../ui-layout/src/client/AppFrame.module.css')
const sidebarRootCss = readSheet('../../ui-sidebar/src/client/SidebarRoot.module.css')
const conversationRootCss = readSheet('../src/client/skeleton/ConversationRoot.module.css')
const chatViewCss = readSheet('../src/client/chat/ChatView.module.css')
const messageItemCss = readSheet('../src/client/chat/MessageItem.module.css')
const inputBarCss = readSheet('../src/client/skeleton/InputBar.module.css')
const settingsRootCss = readSheet('../../ui-settings-general/src/client/SettingsRoot.module.css')
const tunnelSectionCss = readSheet('../../ui-tunnel/src/client/TunnelSection.module.css')

describe('Mobile responsive stylesheet contract', () => {
  const allSheets = [
    { name: 'CodeBlock', css: codeBlockCss },
    { name: 'MarkdownText', css: markdownTextCss },
    { name: 'AppFrame', css: appFrameCss },
    { name: 'SidebarRoot', css: sidebarRootCss },
    { name: 'ConversationRoot', css: conversationRootCss },
    { name: 'ChatView', css: chatViewCss },
    { name: 'MessageItem', css: messageItemCss },
    { name: 'InputBar', css: inputBarCss },
    { name: 'SettingsRoot', css: settingsRootCss },
    { name: 'TunnelSection', css: tunnelSectionCss },
  ]

  it('closes every block across all modified sheets with balanced braces', () => {
    for (const { name, css } of allSheets) {
      const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
      const openCount = (bare.match(/\{/g) ?? []).length
      const closeCount = (bare.match(/\}/g) ?? []).length
      expect(closeCount, `${name} has unbalanced braces`).toBe(openCount)
    }
  })

  it('contains mobile breakpoint queries (@media (max-width: 768px)) in all target sheets', () => {
    for (const { name, css } of allSheets) {
      expect(css, `${name} should include max-width 768px query`).toContain('@media (max-width: 768px)')
    }
  })

  it('protects code blocks and directory trees from breaking words on mobile', () => {
    expect(codeBlockCss).toMatch(/white-space:\s*pre\s*!important/)
    expect(codeBlockCss).toMatch(/word-break:\s*normal\s*!important/)
    expect(codeBlockCss).toMatch(/overflow-x:\s*auto\s*!important/)
  })

  it('compacts the sidebar rail to 44px on mobile, converts expanded sidebar to drawer, and hides details column', () => {
    expect(appFrameCss).toMatch(/44px/)
    expect(appFrameCss).toMatch(/overflow:\s*hidden\s*!important/)
    expect(appFrameCss).toMatch(/\.frame:not\(\[data-sidebar-collapsed\]\)\s+\.sidebarCol[\s\S]*position:\s*fixed\s*!important/)
    expect(appFrameCss).toMatch(/\.detailsCol\s*\{[^}]*display:\s*none\s*!important/)
    expect(sidebarRootCss).toMatch(/\.root\.collapsed\s*\{[^}]*padding:\s*12px 4px 6px;/)
  })

  it('optimizes settings modal for mobile viewports with full-width panel and scrollable tabs', () => {
    expect(settingsRootCss).toMatch(/width:\s*100vw\s*!important/)
    expect(settingsRootCss).toMatch(/flex-direction:\s*column\s*!important/)
    expect(settingsRootCss).toMatch(/overflow-x:\s*auto\s*!important/)
  })

  it('compacts typography and margins in MarkdownText for mobile', () => {
    expect(markdownTextCss).toMatch(/font-size:\s*14px/)
    expect(markdownTextCss).toMatch(/line-height:\s*1\.6/)
  })

  it('compacts input card paddings and border-radius in InputBar for mobile', () => {
    expect(inputBarCss).toMatch(/border-radius:\s*14px/)
    expect(inputBarCss).toMatch(/font-size:\s*14px/)
  })

  it('never uses literal colors for tokens', () => {
    for (const { name, css } of allSheets) {
      expect(css, `${name} should not use literal color fallbacks`).not.toMatch(/var\(--dsw-[a-z0-9-]+\s*,\s*(?:#|rgb|rgba|hsl|hsla)/)
    }
  })
})
