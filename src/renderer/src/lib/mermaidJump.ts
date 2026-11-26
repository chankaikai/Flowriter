/** 點 Mermaid 圖上的節點／文字，找出代碼裡對應的那一行（純函式）。 */
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

export interface CodeHit { line: number; offset: number }

/** 回傳第一個含有該文字的行（0 起算）與該行在代碼裡的字元偏移；找不到回傳 null。 */
export function findLineForLabel(code: string, label: string): CodeHit | null {
  const want = norm(label)
  if (!want || want.length > 200) return null
  const lines = code.split('\n')
  let offset = 0
  let loose: CodeHit | null = null
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const n = norm(raw)
    if (n.includes(want)) {
      // 優先：整個詞出現（避免 "A" 命中 "Alpha"）
      const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}_])`, 'u')
      if (re.test(n)) return { line: i, offset }
      loose ??= { line: i, offset }
    }
    offset += raw.length + 1
  }
  return loose
}
