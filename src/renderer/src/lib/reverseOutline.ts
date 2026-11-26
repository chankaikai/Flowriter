/** 逆向大綱：把全文的文字段落編號送給 AI，要它回傳觀點大綱樹與重複／離題段落（JSON）。 */
export interface BlockText {
  /** 編輯器中第幾個文字區塊（從 0 起算），跳轉用 */
  index: number
  text: string
  /** 程式碼區塊、front matter 等不送給 AI */
  skip?: boolean
}
export interface OutlineNode {
  point: string
  /** 對應的段落編號（BlockText.index） */
  blocks: number[]
  children: OutlineNode[]
}
export interface Flag {
  block: number
  reason: string
  /** 重複時，和哪一段重複 */
  of?: number
}
export interface ReverseResult {
  thesis: string
  outline: OutlineNode[]
  redundant: Flag[]
  offtopic: Flag[]
}

export const MAX_PARAS = 150
export const MAX_CHARS = 24_000
export const PER_PARA = 400
export const MIN_PARA_LEN = 8

export interface Prepared {
  /** 送出去的段落，id 就是 BlockText.index */
  items: { id: number; text: string }[]
  /** 因為長度上限被略過的段落數 */
  dropped: number
  truncated: number
}

const clean = (t: string) => t.replace(/\s+/g, ' ').trim()

export function prepare(blocks: BlockText[]): Prepared {
  const items: { id: number; text: string }[] = []
  let chars = 0
  let dropped = 0
  let truncated = 0
  for (const b of blocks) {
    if (b.skip) continue
    let t = clean(b.text)
    if (t.length < MIN_PARA_LEN) continue
    if (items.length >= MAX_PARAS || chars + Math.min(t.length, PER_PARA) > MAX_CHARS) {
      dropped++
      continue
    }
    if (t.length > PER_PARA) {
      t = t.slice(0, PER_PARA) + '…'
      truncated++
    }
    chars += t.length
    items.push({ id: b.index, text: t })
  }
  return { items, dropped, truncated }
}

export function buildPrompt(p: Prepared): { instruction: string; text: string } {
  const instruction = [
    '你是結構編輯。下面是一篇文章，每段前面有編號【編號】。請逆向分析它的結構，只輸出一個 JSON 物件，不要任何說明、不要程式碼圍欄。格式：',
    '{"thesis":"全文核心觀點，一句話","outline":[{"point":"這一部分的論點，一句話","blocks":[段落編號…],"children":[同樣結構，最多再兩層]}],"redundant":[{"block":重複的段落編號,"of":它重複的較早段落編號,"reason":"一句話"}],"offtopic":[{"block":偏離主題的段落編號,"reason":"一句話"}]}',
    '規則：用原文的語言；point 要寫成「觀點」而不是「這段在講什麼」；block／of／blocks 只能使用下面出現過的編號；沒有重複或離題就給空陣列；不要為了湊數而硬標。'
  ].join('\n')
  return { instruction, text: p.items.map((i) => `【${i.id}】${i.text}`).join('\n\n') }
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? clean(v).slice(0, max) : '')

/** 從模型回覆中取出 JSON 並驗證；編號不在 valid 裡的一律丟掉。失敗回 null。 */
export function parseReply(raw: string, valid: Set<number>): ReverseResult | null {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  s = s.slice(a, b + 1)
  let j: any
  try {
    j = JSON.parse(s)
  } catch {
    return null
  }
  if (!j || typeof j !== 'object') return null
  let budget = 120
  const node = (n: any, depth: number): OutlineNode | null => {
    if (!n || typeof n !== 'object' || budget <= 0) return null
    const point = str(n.point, 200)
    if (!point) return null
    budget--
    const blocks = (Array.isArray(n.blocks) ? n.blocks : []).map(Number).filter((x: number) => Number.isInteger(x) && valid.has(x))
    const children: OutlineNode[] = []
    if (depth < 3 && Array.isArray(n.children)) {
      for (const c of n.children) {
        const k = node(c, depth + 1)
        if (k) children.push(k)
      }
    }
    return { point, blocks: [...new Set<number>(blocks)], children }
  }
  const outline: OutlineNode[] = []
  for (const n of Array.isArray(j.outline) ? j.outline : []) {
    const k = node(n, 1)
    if (k) outline.push(k)
  }
  const flags = (arr: unknown, withOf: boolean): Flag[] => {
    const out: Flag[] = []
    const seen = new Set<number>()
    for (const f of Array.isArray(arr) ? arr : []) {
      const block = Number(f?.block)
      if (!Number.isInteger(block) || !valid.has(block) || seen.has(block)) continue
      seen.add(block)
      const of = Number(f?.of)
      out.push({ block, reason: str(f?.reason, 200), ...(withOf && Number.isInteger(of) && valid.has(of) && of !== block ? { of } : {}) })
      if (out.length >= 40) break
    }
    return out
  }
  const res: ReverseResult = { thesis: str(j.thesis, 300), outline, redundant: flags(j.redundant, true), offtopic: flags(j.offtopic, false) }
  if (!res.thesis && !res.outline.length) return null
  return res
}

/** 給「文件是否在分析後被改過」用的簽名。 */
export function signature(blocks: BlockText[]): string {
  let h = 5381
  for (const b of blocks) for (let i = 0; i < b.text.length; i++) h = ((h * 33) ^ b.text.charCodeAt(i)) >>> 0
  return `${blocks.length}:${h.toString(36)}`
}

/** 把大綱攤平成 Markdown 清單（複製用）。 */
export function outlineToMarkdown(r: ReverseResult): string {
  const lines: string[] = []
  if (r.thesis) lines.push(`**核心觀點**：${r.thesis}`, '')
  const walk = (ns: OutlineNode[], d: number) => {
    for (const n of ns) {
      lines.push(`${'  '.repeat(d)}- ${n.point}`)
      walk(n.children, d + 1)
    }
  }
  walk(r.outline, 0)
  return lines.join('\n') + '\n'
}
