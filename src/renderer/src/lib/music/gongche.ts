/**
 * 工尺譜解析器（純函式，不碰 DOM）。語法以任務規格為準：
 *   可選頭兩行（只能是這兩種）  調: 小工調    板: 一板一眼
 *   譜字  合 四 一 上 尺 工 凡 六 五 乙
 *   後綴（依序）  八度 ' 或 ,（可重複，不能混用）→ 可選一個 .（附點）→ 可選 / 或 //（減時）
 *   | || |] 小節線；單獨的 - 是增時線
 * 掃描器逐字元走，不先按空白切 token：「工.尺」= 附點工 + 尺。
 * 不認識的字一律是錯誤並標出位置；簡譜數字不能放進來。
 */
export const GONGCHE_CHARS = ['合', '四', '一', '上', '尺', '工', '凡', '六', '五', '乙'] as const
export const GONGCHE_KEYS = ['小工調', '凡字調', '六字調', '正宮調', '乙字調', '上字調', '尺字調'] as const
export const GONGCHE_BANS = ['一板一眼', '一板三眼', '流水板', '散板'] as const

export type GongcheItem =
  | { t: 'note'; ch: string; oct: number; dot: boolean; under: 0 | 1 | 2; col: number }
  | { t: 'dash' }
  | { t: 'bar'; kind: 'single' | 'double' | 'end' }

export interface GongcheRow { line: number; items: GongcheItem[] }
export interface GongcheError { line: number; col: number; message: string }
export interface GongcheScore { key?: string; ban?: string; rows: GongcheRow[] }
export type GongcheResult = { ok: true; score: GongcheScore } | { ok: false; errors: GongcheError[] }

const CHARS = new Set<string>(GONGCHE_CHARS)
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '　'
/** 簡體寫法（调、宫）規範成繁體後再比對 */
const norm = (s: string) => s.replace(/调/g, '調').replace(/宫/g, '宮')
const HEAD = /^\s*(調|调|板)\s*[:：]\s*(.*?)\s*$/

export function parseGongche(source: string): GongcheResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const errors: GongcheError[] = []
  const rows: GongcheRow[] = []
  let key: string | undefined
  let ban: string | undefined
  let musicStarted = false

  for (let li = 0; li < lines.length; li++) {
    const text = lines[li]
    const lineNo = li + 1
    if (!text.trim()) continue

    if (!musicStarted) {
      const m = HEAD.exec(text)
      if (m) {
        const isKey = m[1] !== '板'
        const val = norm(m[2])
        const col = text.indexOf(m[2]) + 1 || 1
        if (isKey) {
          if (key !== undefined) errors.push({ line: lineNo, col: 1, message: '「調:」只能寫一次' })
          else if (!(GONGCHE_KEYS as readonly string[]).includes(val)) errors.push({ line: lineNo, col, message: `調名只能是：${GONGCHE_KEYS.join('、')}` })
          else key = val
        } else {
          if (ban !== undefined) errors.push({ line: lineNo, col: 1, message: '「板:」只能寫一次' })
          else if (!(GONGCHE_BANS as readonly string[]).includes(val)) errors.push({ line: lineNo, col, message: `板式只能是：${GONGCHE_BANS.join('、')}` })
          else ban = val
        }
        continue
      }
    }
    musicStarted = true
    rows.push({ line: lineNo, items: scanLine(text, lineNo, errors) })
  }

  if (!errors.length && !rows.some((r) => r.items.some((i) => i.t === 'note'))) errors.push({ line: 1, col: 1, message: '沒有任何譜字（合 四 一 上 尺 工 凡 六 五 乙）' })
  if (errors.length) return { ok: false, errors }
  return { ok: true, score: { key, ban, rows } }
}

function scanLine(text: string, lineNo: number, errors: GongcheError[]): GongcheItem[] {
  const items: GongcheItem[] = []
  const err = (i: number, message: string) => errors.push({ line: lineNo, col: i + 1, message })
  const chars = [...text] // 以字元（非 UTF-16 單元）為單位，欄號才對得上
  let i = 0
  while (i < chars.length) {
    const c = chars[i]
    if (isSpace(c)) {
      i++
      continue
    }
    if (c === '|') {
      if (chars[i + 1] === ']') {
        items.push({ t: 'bar', kind: 'end' })
        i += 2
      } else if (chars[i + 1] === '|') {
        items.push({ t: 'bar', kind: 'double' })
        i += 2
      } else {
        items.push({ t: 'bar', kind: 'single' })
        i++
      }
      continue
    }
    if (c === '-') {
      const n = chars[i + 1]
      const pv = chars[i - 1]
      if ((n !== undefined && !isSpace(n) && n !== '|') || (pv !== undefined && !isSpace(pv) && pv !== '|')) err(i, '增時線 - 要單獨寫，前後用空白隔開')
      else items.push({ t: 'dash' })
      i++
      continue
    }
    if (CHARS.has(c)) {
      const start = i
      i++
      let hi = 0
      let lo = 0
      while (chars[i] === "'" || chars[i] === ',') {
        if (chars[i] === "'") hi++
        else lo++
        i++
      }
      if (hi && lo) err(i - 1, '同一個字不能同時有高八度和低八度記號')
      let dot = false
      if (chars[i] === '.') {
        dot = true
        i++
      }
      let under = 0
      while (chars[i] === '/' && under < 2) {
        under++
        i++
      }
      items.push({ t: 'note', ch: c, oct: hi - lo, dot, under: under as 0 | 1 | 2, col: start + 1 })
      continue
    }
    if (c >= '0' && c <= '9') err(i, `工尺譜不使用簡譜數字「${c}」`)
    else err(i, `不認得的字「${c}」（譜字只有 ${GONGCHE_CHARS.join(' ')}）`)
    i++
  }
  return items
}
