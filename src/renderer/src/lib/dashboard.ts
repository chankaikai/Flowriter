/** 寫作儀表盤用的純函式：只看 Markdown 文字，不碰編輯器。 */
import { computeStats, parseOutline } from './markdown'
import { maskedLines } from './lint'

/* ---------- 1. 目標字數（YAML front matter 的 target） ---------- */

function fmRange(md: string): [number, number] | null {
  const lines = md.split('\n')
  if (lines[0]?.trim() !== '---') return null
  for (let j = 1; j < lines.length; j++) {
    if (lines[j].trim() === '---' || lines[j].trim() === '...') return [1, j]
  }
  return null
}

/** 讀出 front matter 的 `target: 5000`；沒有或不是正整數回傳 null。 */
export function parseTarget(md: string): number | null {
  const r = fmRange(md)
  if (!r) return null
  const lines = md.split('\n')
  for (let i = r[0]; i < r[1]; i++) {
    const m = /^target\s*:\s*["']?(\d{1,9})["']?\s*(?:#.*)?$/.exec(lines[i].trim())
    if (m && +m[1] > 0) return +m[1]
  }
  return null
}

/** 寫入（或更新、或移除 n=null 時）front matter 的 target，其餘文字原樣保留。 */
export function withTarget(md: string, n: number | null): string {
  const r = fmRange(md)
  const lines = md.split('\n')
  if (!r) {
    return n == null ? md : `---\ntarget: ${n}\n---\n\n${md}`
  }
  for (let i = r[0]; i < r[1]; i++) {
    if (/^target\s*:/.test(lines[i].trim())) {
      if (n == null) lines.splice(i, 1)
      else lines[i] = `target: ${n}`
      return lines.join('\n')
    }
  }
  if (n != null) lines.splice(r[1], 0, `target: ${n}`)
  return lines.join('\n')
}

/** 不含 front matter 的正文字數（目標字數比的是正文）。 */
export function bodyWords(md: string): number {
  const r = fmRange(md)
  const body = r ? md.split('\n').slice(r[1] + 1).join('\n') : md
  return computeStats(body).words
}

/* ---------- 2. 章節平衡 ---------- */

export interface Chapter { title: string; line: number; words: number; level: number }

/** 以最上層有出現的標題層級切章（H1 優先；沒有 H1 用 H2）。 */
export function chapters(md: string): Chapter[] {
  const heads = parseOutline(md)
  if (!heads.length) return []
  const lvl = heads.some((h) => h.level === 1) ? 1 : Math.min(...heads.map((h) => h.level))
  const tops = heads.filter((h) => h.level === lvl)
  const lines = md.split('\n')
  return tops.map((h, i) => {
    const end = i + 1 < tops.length ? tops[i + 1].line : lines.length
    return { title: h.text, line: h.line, level: lvl, words: computeStats(lines.slice(h.line + 1, end).join('\n')).words }
  })
}

/** 回傳失衡的章節標題（比平均長 2.5 倍以上、或短到不到平均 25%；至少 3 章才判斷）。 */
export function imbalanced(ch: Chapter[]): { title: string; kind: 'long' | 'short' }[] {
  if (ch.length < 3) return []
  const avg = ch.reduce((a, c) => a + c.words, 0) / ch.length
  if (avg < 50) return []
  const out: { title: string; kind: 'long' | 'short' }[] = []
  for (const c of ch) {
    if (c.words > avg * 2.5) out.push({ title: c.title, kind: 'long' })
    else if (c.words < avg * 0.25) out.push({ title: c.title, kind: 'short' })
  }
  return out
}

/* ---------- 3. 未完成事項 ---------- */

export interface Todo { kind: 'task' | 'mark' | 'link'; line: number; text: string; /** 第幾個任務（kind=task 時，供雙向同步） */ index?: number }

const MARK_RE = /(TODO|FIXME|待補|待補充|\?\?\?|？？？)/

/** `- [ ]` 任務、TODO/FIXME/待補/??? 標記、空連結。略過程式碼與 front matter。 */
export function scanTodos(md: string): Todo[] {
  const body = maskedLines(md)
  const out: Todo[] = []
  let ti = 0
  body.forEach((b, i) => {
    if (b.text == null) return
    const raw = b.raw
    const t = /^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s+(.*\S)\s*$/.exec(raw)
    if (t) {
      if (t[1] === ' ') out.push({ kind: 'task', line: i, text: t[2], index: ti })
      ti++
      return
    }
    const m = MARK_RE.exec(b.text)
    if (m) out.push({ kind: 'mark', line: i, text: raw.trim().slice(0, 60) })
    for (const l of raw.matchAll(/(?<!!)\[([^\]]*)\]\(\s*\)/g)) out.push({ kind: 'link', line: i, text: `空連結：${l[0]}` })
  })
  return out
}

/** 已完成任務總數與全部任務總數（進度用）。 */
export function taskCounts(md: string): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const b of maskedLines(md)) {
    if (b.text == null) continue
    const t = /^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s+\S/.exec(b.raw)
    if (t) {
      total++
      if (t[1] !== ' ') done++
    }
  }
  return { done, total }
}

/* ---------- 4. 內容徽章與版面檢查 ---------- */

export interface Badges { images: number; tables: number; code: number; math: number; links: number; footnotes: number }

export function badges(md: string): Badges {
  const b: Badges = { images: 0, tables: 0, code: 0, math: 0, links: 0, footnotes: 0 }
  let fence: string | null = null
  let math = false
  let prevPipe = false
  for (const raw of md.split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(raw)
    if (f) {
      if (!fence) {
        fence = f[1][0]
        b.code++
      } else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    if (/^\s*\$\$\s*$/.test(raw)) {
      if (!math) b.math++
      math = !math
      continue
    }
    if (math) continue
    b.images += (raw.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length
    b.links += (raw.match(/(?<!!)\[[^\]]+\]\([^)]+\)/g) || []).length
    b.footnotes += (raw.match(/\[\^[^\]\s]+\](?!:)/g) || []).length
    b.math += (raw.match(/(?<!\$)\$[^$\n]+\$(?!\$)/g) || []).length
    const isSep = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(raw) && raw.includes('|')
    if (isSep && prevPipe) b.tables++
    prevPipe = raw.includes('|') && !isSep
  }
  return b
}

export interface LayoutIssue { rule: 'heading-skip' | 'long-para'; line: number; message: string; /** 供跳轉的文字 */ snippet: string }

/** 本機版面檢查（純文字部分）：標題跳級、段落超過 500 字。缺圖由呼叫端另外用 IPC 檢查。 */
export function layoutIssues(md: string, maxPara = 500): LayoutIssue[] {
  const out: LayoutIssue[] = []
  let prev = 0
  for (const h of parseOutline(md)) {
    if (prev && h.level > prev + 1) out.push({ rule: 'heading-skip', line: h.line, message: `標題從 H${prev} 直接跳到 H${h.level}：${h.text}`, snippet: h.text })
    prev = h.level
  }
  const body = maskedLines(md)
  let buf: string[] = []
  let start = 0
  const flush = () => {
    const text = buf.join('')
    if (text.replace(/\s/g, '').length > maxPara && !/^(\s*(#|>|[-*+]|\d+[.)]|\||```|~~~))/.test(buf[0] ?? '')) {
      out.push({ rule: 'long-para', line: start, message: `第 ${start + 1} 行的段落有 ${text.replace(/\s/g, '').length} 字，建議拆開`, snippet: text.replace(/[*_`~]/g, '').trim().slice(0, 30) })
    }
    buf = []
  }
  body.forEach((b, i) => {
    if (b.text == null || b.raw.trim() === '') {
      flush()
      return
    }
    if (!buf.length) start = i
    buf.push(b.raw)
  })
  flush()
  return out
}

/* ---------- 5. 乾淨 Markdown ---------- */

/** 複製用：去掉 front matter、HTML 註解、行尾空白、多餘空行。 */
export function cleanMarkdown(md: string): string {
  const r = fmRange(md)
  let s = r ? md.split('\n').slice(r[1] + 1).join('\n') : md
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n')
  return s.trim() + '\n'
}
