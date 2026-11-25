/**
 * 簡譜解析器（純函式，不碰 DOM）。語法以任務規格為準：
 *   第一行  1=<調> <拍號>
 *   func:   功能和聲標記（按 | 拆成每小節一個），套用在「下一行旋律」上方
 *   旋律    0 休止；1–7 唱名；八度只能寫在數字後面（' 高、, 低）；. 附點；/ 或 _ 減時線（最多兩條）
 *           ( … ) 連音線；(3: … ) 連音符；[1 3 5] 柱式和弦；單獨的 - 是延時線
 *           | 小節線，|| 雙小節線，|] 終止線
 * 沒有寫的記號一律是錯誤（指出行、列），不會靜默丟掉。
 */

export interface JianpuKey { tonic: string; label: string }
export interface JianpuNote { deg: number; oct: number }

export type JianpuItem =
  | { t: 'note'; deg: number; oct: number; dot: boolean; under: 0 | 1 | 2 }
  | { t: 'chord'; notes: JianpuNote[]; dot: boolean; under: 0 | 1 | 2 }
  | { t: 'dash' }
  | { t: 'bar'; kind: 'single' | 'double' | 'end' }
  | { t: 'open'; kind: 'slur' | 'tuplet'; n?: number }
  | { t: 'close'; kind: 'slur' | 'tuplet' }

export interface JianpuRow {
  /** 原始碼的行號（1 起算，相對於圍欄內文） */
  line: number
  func?: string[]
  items: JianpuItem[]
  /** 這一行有幾個小節 */
  bars: number
}

export interface JianpuError { line: number; col: number; message: string }

export interface JianpuScore {
  key: string
  meter: { n: number; d: number }
  rows: JianpuRow[]
  warnings: string[]
}

export type JianpuResult = { ok: true; score: JianpuScore } | { ok: false; errors: JianpuError[] }

const HEADER = /^1=(b?)([A-G])([#b]?)\s+(\d{1,2})\/(\d{1,2})\s*$/

export function parseJianpu(source: string): JianpuResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const errors: JianpuError[] = []
  const warnings: string[] = []
  const rows: JianpuRow[] = []
  let key = ''
  let meter = { n: 4, d: 4 }
  let headerDone = false
  let pendingFunc: { bars: string[]; line: number } | null = null
  const stack: { kind: 'slur' | 'tuplet'; line: number; col: number }[] = []

  for (let li = 0; li < lines.length; li++) {
    const text = lines[li]
    const lineNo = li + 1
    if (!text.trim()) continue

    if (!headerDone) {
      const m = HEADER.exec(text.trim())
      if (!m) {
        errors.push({ line: lineNo, col: 1, message: '第一行必須是「1=<調> <拍號>」，例如 1=C 4/4' })
        return { ok: false, errors }
      }
      // 「bB」寫法規範成 Bb
      key = m[1] ? `${m[2]}b` : `${m[2]}${m[3]}`
      meter = { n: +m[4], d: +m[5] }
      if (meter.n < 1 || meter.d < 1 || (meter.d & (meter.d - 1)) !== 0) {
        errors.push({ line: lineNo, col: text.indexOf(m[4]) + 1, message: `拍號 ${m[4]}/${m[5]} 不合理` })
        return { ok: false, errors }
      }
      headerDone = true
      continue
    }

    if (/^\s*func:/.test(text)) {
      const body = text.slice(text.indexOf('func:') + 5)
      const parts = body.split('|').map((s) => s.trim())
      while (parts.length && parts[parts.length - 1] === '') parts.pop()
      while (parts.length && parts[0] === '') parts.shift()
      if (pendingFunc) warnings.push(`第 ${pendingFunc.line} 行的 func: 後面沒有旋律行`)
      pendingFunc = { bars: parts, line: lineNo }
      continue
    }

    const items = scanLine(text, lineNo, errors, stack)
    const bars = countBars(items)
    const row: JianpuRow = { line: lineNo, items, bars }
    if (pendingFunc) {
      row.func = pendingFunc.bars
      if (pendingFunc.bars.length !== bars) warnings.push(`功能標記有 ${pendingFunc.bars.length} 小節，旋律有 ${bars} 小節`)
      pendingFunc = null
    }
    rows.push(row)
  }

  if (!headerDone) return { ok: false, errors: [{ line: 1, col: 1, message: '第一行必須是「1=<調> <拍號>」，例如 1=C 4/4' }] }
  for (const g of stack) errors.push({ line: g.line, col: g.col, message: g.kind === 'tuplet' ? '連音符的括號沒有關閉' : '連音線的括號沒有關閉' })
  if (pendingFunc) warnings.push(`第 ${pendingFunc.line} 行的 func: 後面沒有旋律行`)
  if (errors.length) return { ok: false, errors }
  return { ok: true, score: { key, meter, rows, warnings } }
}

function countBars(items: JianpuItem[]): number {
  let bars = 0
  let open = false
  for (const it of items) {
    if (it.t === 'bar') {
      bars++
      open = false
    } else if (it.t === 'note' || it.t === 'chord' || it.t === 'dash') open = true
  }
  return bars + (open ? 1 : 0)
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '　'
/** 一個 token 結束後允許接什麼 */
const endsToken = (c: string | undefined) => c === undefined || isSpace(c) || c === '|' || c === ')' || c === ']'

function scanLine(text: string, lineNo: number, errors: JianpuError[], stack: { kind: 'slur' | 'tuplet'; line: number; col: number }[]): JianpuItem[] {
  const items: JianpuItem[] = []
  const err = (i: number, message: string) => errors.push({ line: lineNo, col: i + 1, message })
  let i = 0

  /** 讀 數字後的八度、附點、減時線；回傳 null 表示出錯（已記錄） */
  const suffix = (allowOct: boolean, deg: number): { oct: number; dot: boolean; under: 0 | 1 | 2 } | null => {
    let oct = 0
    let hi = 0
    let lo = 0
    while (text[i] === "'" || text[i] === ',') {
      if (text[i] === "'") hi++
      else lo++
      i++
    }
    if (hi && lo) {
      err(i - 1, '同一個音不能同時有高八度和低八度記號')
      return null
    }
    if ((hi || lo) && (!allowOct || deg === 0)) {
      err(i - 1, deg === 0 ? '休止符不能加八度記號' : '這裡不能加八度記號')
      return null
    }
    oct = hi - lo
    let dot = false
    if (text[i] === '.') {
      dot = true
      i++
    }
    let under = 0
    while ((text[i] === '/' || text[i] === '_') && under < 2) {
      under++
      i++
    }
    return { oct, dot, under: under as 0 | 1 | 2 }
  }

  while (i < text.length) {
    const c = text[i]
    if (isSpace(c)) {
      i++
      continue
    }
    if (c === '|') {
      if (text[i + 1] === ']') {
        items.push({ t: 'bar', kind: 'end' })
        i += 2
      } else if (text[i + 1] === '|') {
        items.push({ t: 'bar', kind: 'double' })
        i += 2
      } else {
        items.push({ t: 'bar', kind: 'single' })
        i++
      }
      continue
    }
    if (c === '-') {
      if (!endsToken(text[i + 1])) {
        err(i + 1, '延時線 - 要單獨寫，前後用空白隔開')
        i++
        continue
      }
      items.push({ t: 'dash' })
      i++
      continue
    }
    if (c === '(') {
      const m = /^\((\d+):/.exec(text.slice(i))
      if (m) {
        const n = +m[1]
        if (n < 2) err(i, '連音符的數字至少是 2')
        stack.push({ kind: 'tuplet', line: lineNo, col: i + 1 })
        items.push({ t: 'open', kind: 'tuplet', n })
        i += m[0].length
      } else {
        stack.push({ kind: 'slur', line: lineNo, col: i + 1 })
        items.push({ t: 'open', kind: 'slur' })
        i++
      }
      continue
    }
    if (c === ')') {
      const g = stack.pop()
      if (!g) err(i, '多出一個 )，前面沒有對應的 (')
      else items.push({ t: 'close', kind: g.kind })
      i++
      continue
    }
    if (c === '[') {
      const start = i
      i++
      const notes: JianpuNote[] = []
      let closed = false
      while (i < text.length) {
        if (isSpace(text[i])) {
          i++
          continue
        }
        if (text[i] === ']') {
          closed = true
          i++
          break
        }
        if (text[i] >= '1' && text[i] <= '7') {
          const deg = +text[i]
          i++
          const oct = suffixOctOnly()
          if (oct === null) return finishBad()
          notes.push({ deg, oct })
          continue
        }
        err(i, `和弦裡只能寫 1–7 和八度記號，不認得「${text[i]}」`)
        return finishBad()
      }
      if (!closed) {
        err(start, '和弦的 [ 沒有對應的 ]')
        return finishBad()
      }
      if (!notes.length) {
        err(start, '和弦裡至少要有一個音')
        return finishBad()
      }
      const s = suffix(false, 1)
      if (!s) return finishBad()
      if (!endsToken(text[i])) {
        err(i, '記號之間要用空白分開')
        return finishBad()
      }
      items.push({ t: 'chord', notes, dot: s.dot, under: s.under })
      continue
    }
    if (c >= '0' && c <= '7') {
      const deg = +c
      i++
      const s = suffix(true, deg)
      if (!s) return finishBad()
      if (!endsToken(text[i]) && text[i] !== '(') {
        err(i, text[i] >= '0' && text[i] <= '9' ? '音符之間要用空白分開' : `不認得的記號「${text[i]}」`)
        return finishBad()
      }
      items.push({ t: 'note', deg, oct: s.oct, dot: s.dot, under: s.under })
      continue
    }
    if (c === "'" || c === ',') {
      err(i, '八度記號只能寫在數字後面，例如 1\' 或 1,')
    } else if (c >= '8' && c <= '9') {
      err(i, `簡譜只有 0–7，不認得「${c}」`)
    } else {
      err(i, `不認得的記號「${c}」`)
    }
    return finishBad()
  }
  return items

  // 和弦裡的八度（不允許附點／減時）
  function suffixOctOnly(): number | null {
    let hi = 0
    let lo = 0
    while (text[i] === "'" || text[i] === ',') {
      if (text[i] === "'") hi++
      else lo++
      i++
    }
    if (hi && lo) {
      err(i - 1, '同一個音不能同時有高八度和低八度記號')
      return null
    }
    return hi - lo
  }
  // 出錯就放棄這一行的其餘部分（錯誤已記錄）
  function finishBad(): JianpuItem[] {
    i = text.length
    return items
  }
}
