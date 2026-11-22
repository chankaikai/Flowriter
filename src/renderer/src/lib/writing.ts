/** 寫作統計：每日新增字數、連續寫作天數，存在 localStorage。 */
const KEY = 'inkwell.writing.v1'

export interface WritingData {
  days: Record<string, number>
}

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function loadWriting(): WritingData {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { days: j.days && typeof j.days === 'object' ? j.days : {} }
  } catch {
    return { days: {} }
  }
}

export function addWords(n: number): WritingData {
  const d = loadWriting()
  const k = dayKey()
  d.days[k] = (d.days[k] || 0) + n
  // 只保留最近 400 天
  const keys = Object.keys(d.days).sort()
  while (keys.length > 400) delete d.days[keys.shift()!]
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    /* ignore */
  }
  return d
}

/** 連續寫作天數：今天還沒寫不會中斷（從昨天往回算）。 */
export function streak(d: WritingData): number {
  let n = 0
  const cur = new Date()
  if (!(d.days[dayKey(cur)] > 0)) cur.setDate(cur.getDate() - 1)
  while (d.days[dayKey(cur)] > 0) {
    n++
    cur.setDate(cur.getDate() - 1)
  }
  return n
}

/** 最近 n 天（含今天）由舊到新。 */
export function lastDays(d: WritingData, n: number): { key: string; words: number }[] {
  const out: { key: string; words: number }[] = []
  const cur = new Date()
  cur.setDate(cur.getDate() - (n - 1))
  for (let i = 0; i < n; i++) {
    const k = dayKey(cur)
    out.push({ key: k, words: d.days[k] || 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return out
}
