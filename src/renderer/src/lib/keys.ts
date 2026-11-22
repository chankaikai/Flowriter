export const isMac = /mac/i.test(navigator.platform)

/**
 * 快捷鍵規格："Mod+Shift+K"
 *  - Mod = ⌘（macOS）/ Ctrl（其他）
 *  - 單一大寫字母 → 依實體按鍵 KeyX 比對（輸入法開啟時也能運作）
 *  - 單一數字     → DigitN
 *  - 其他         → KeyboardEvent.code（Slash、Backslash、BracketLeft、F8…）
 */
export function matchKey(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.split('+')
  const key = parts.pop() as string
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (mod !== parts.includes('Mod')) return false
  if (e.altKey !== parts.includes('Alt')) return false
  if (e.shiftKey !== parts.includes('Shift')) return false
  if (isMac && e.ctrlKey) return false
  if (/^[A-Z]$/.test(key)) return e.code === 'Key' + key
  if (/^\d$/.test(key)) return e.code === 'Digit' + key
  return e.code === key
}

const SYMBOL: Record<string, string> = {
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Comma: ',',
  Equal: '=',
  Minus: '-',
  Escape: 'Esc'
}

export function formatKeys(spec: string): string[] {
  return spec.split('+').map((p) => {
    if (p === 'Mod') return isMac ? '⌘' : 'Ctrl'
    if (p === 'Alt') return isMac ? '⌥' : 'Alt'
    if (p === 'Shift') return isMac ? '⇧' : 'Shift'
    if (/^Digit\d$/.test(p)) return p.slice(5)
    return SYMBOL[p] ?? p
  })
}
