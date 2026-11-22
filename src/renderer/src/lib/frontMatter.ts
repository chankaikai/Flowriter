export interface FmField { key: string; kind: 'bool' | 'list' | 'text'; value: string | boolean; items?: string[] }

const unq = (s: string) => s.trim().replace(/^(['"])(.*)\1$/, '$2')

/** 極簡 front matter 解析：只看最上層 `key: value`、`key: [a, b]`、`- item` 清單。 */
export function parseFrontMatter(text: string): FmField[] {
  const out: FmField[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_一-龥][\w一-龥-]*)\s*:\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const [, key, rawVal] = m
    const v = rawVal.trim()
    if (v === 'true' || v === 'false') out.push({ key, kind: 'bool', value: v === 'true' })
    else if (/^\[.*\]$/.test(v)) {
      const items = v.slice(1, -1).split(',').map(unq).filter(Boolean)
      out.push({ key, kind: 'list', value: v, items })
    } else if (v === '') {
      const items: string[] = []
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(unq(lines[++i].replace(/^\s*-\s+/, '')))
      if (items.length) out.push({ key, kind: 'list', value: '', items })
    } else out.push({ key, kind: 'text', value: unq(v) })
  }
  return out
}

/** 切換布林欄位，其餘文字（含註解）原樣保留。找不到回傳 null。 */
export function toggleBool(text: string, key: string): string | null {
  const re = new RegExp(`^(${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*)(true|false)(\\s*)$`, 'm')
  if (!re.test(text)) return null
  return text.replace(re, (_m, a, b, c) => `${a}${b === 'true' ? 'false' : 'true'}${c}`)
}
