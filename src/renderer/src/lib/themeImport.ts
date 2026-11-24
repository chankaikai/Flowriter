/**
 * 匯入 Typora／Obsidian 風格的主題 CSS，轉成本程式的選擇器。
 * Notion 沒有可匯入的主題格式，但它的 CSS 片段（snippet）可以直接貼進自訂 CSS。
 * 安全：移除 @import 與任何網路 URL（避免載入外部資源），單檔上限 300KB。
 */
export const MAX_THEME_CSS = 300_000

const EDITOR = '.editor-col .milkdown .ProseMirror'

/** 選擇器對照（由長到短，避免短的先吃掉長的） */
const MAP: [RegExp, string][] = [
  [/\.markdown-source-view\.mod-cm6\s+\.cm-content/g, EDITOR],
  [/\.markdown-preview-view/g, EDITOR],
  [/\.markdown-rendered/g, EDITOR],
  [/\.markdown-source-view/g, EDITOR],
  [/\.cm-s-obsidian/g, EDITOR],
  [/\.md-fences/g, '.milkdown .milkdown-code-block'],
  [/#write\s*>\s*/g, `${EDITOR} > `],
  [/#write/g, EDITOR],
  [/\bbody\.theme-dark\b|\.theme-dark\b/g, '[data-tone="dark"]'],
  [/\bbody\.theme-light\b|\.theme-light\b/g, '[data-tone="light"]'],
  [/html\.(?:os-windows|os-macos|os-linux)\b/g, 'html']
]

export interface ImportResult {
  css: string
  /** 被移除的外部載入（@import／網路 URL）數量 */
  removedExternal: number
  /** 被改寫的選擇器種類 */
  rewritten: number
}

export function importThemeCss(raw: string, name: string): ImportResult {
  let css = raw.slice(0, MAX_THEME_CSS).replace(/<\/?style[^>]*>/gi, '')
  let removed = 0
  css = css.replace(/@import[^;]*;?/gi, () => {
    removed++
    return ''
  })
  css = css.replace(/url\(\s*(['"]?)(?:https?:)?\/\/[^)]*\1\s*\)/gi, () => {
    removed++
    return 'none'
  })
  let rewritten = 0
  for (const [re, to] of MAP) {
    css = css.replace(re, () => {
      rewritten++
      return to
    })
  }
  const tag = name.replace(/[^\w\u4e00-\u9fa5.\- ]/g, '_').slice(0, 40) || 'theme'
  return { css: `/* >>> 導入主題：${tag} */\n${css.trim()}\n/* <<< 導入主題：${tag} */`, removedExternal: removed, rewritten }
}

/** 從自訂 CSS 中移除某個已導入的主題區塊 */
export function removeImported(all: string, name: string): string {
  const tag = name.replace(/[^\w\u4e00-\u9fa5.\- ]/g, '_').slice(0, 40)
  const re = new RegExp(`\\n?/\\* >>> 導入主題：${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\*/[\\s\\S]*?/\\* <<< 導入主題：${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\*/\\n?`, 'g')
  return all.replace(re, '\n').trim()
}

/** 列出已導入的主題名稱 */
export function listImported(all: string): string[] {
  return [...all.matchAll(/\/\* >>> 導入主題：(.+?) \*\//g)].map((m) => m[1])
}
