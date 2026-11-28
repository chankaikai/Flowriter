/** 知識庫：段落檢索、問答提示詞、本機查重（字元 5-gram 重疊）、自動大綱。純函式，不碰檔案與網路。 */
import { tokenize, type RadarIndex } from './radar'

export interface ParaHit {
  path: string
  name: string
  text: string
  score: number
}

/** 以 BM25 風格在所有段落裡找最相關的幾段（只看每篇前 400 段，避免巨檔拖慢） */
export function queryParas(idx: RadarIndex, question: string, opts: { exclude?: string; limit?: number } = {}): ParaHit[] {
  const q = new Set(tokenize(question))
  if (!q.size) return []
  const N = idx.docs.length
  const out: ParaHit[] = []
  for (const d of idx.docs) {
    if (d.doc.path === opts.exclude) continue
    for (const p of d.paras.slice(0, 400)) {
      if (p.length < 12 || /^```/.test(p)) continue
      const toks = new Set(tokenize(p))
      let s = 0
      for (const t of q) {
        if (!toks.has(t)) continue
        const n = idx.df.get(t) ?? 0
        s += Math.log(1 + (N - n + 0.5) / (n + 0.5))
      }
      if (s > 0) out.push({ path: d.doc.path, name: d.doc.name.replace(/\.[^.]+$/, ''), text: p, score: s / Math.sqrt(toks.size + 8) })
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 6)
}

/** 問知識庫：只允許根據提供的資料作答，並標註來源編號 */
export function buildAskPrompt(question: string, hits: ParaHit[]): { instruction: string; text: string } {
  const ctx = hits.map((h, i) => `[${i + 1}]（${h.name}）${h.text.slice(0, 700)}`).join('\n\n')
  return {
    instruction: [
      '你是使用者的個人知識庫助理。下面是從他的筆記裡檢索到的資料片段，每段有編號。',
      '請只根據這些片段回答問題；片段沒有提到的，直接說「筆記裡沒有找到相關內容」，不要憑空補充。',
      '回答時在引用處標註來源編號，例如 [1]、[2]。用繁體中文，簡潔。'
    ].join('\n'),
    text: `資料片段：\n${ctx}\n\n問題：${question}`
  }
}

/* ------------------------------ 本機查重 ------------------------------ */

const norm = (s: string) => s.toLowerCase().replace(/[`*_>#~\[\]()!|\-]/g, '').replace(/[\s\p{P}\p{S}]+/gu, '')
const N_GRAM = 5

function grams(s: string): Set<string> {
  const t = norm(s)
  const g = new Set<string>()
  for (let i = 0; i + N_GRAM <= t.length; i++) g.add(t.slice(i, i + N_GRAM))
  return g
}

export interface OverlapFlag {
  /** 對應 blockTexts() 的編號 */
  block: number
  ratio: number
  from: string
  path: string
  /** 原文開頭，列表顯示 */
  head: string
  len: number
}
export interface OverlapReport {
  flags: OverlapFlag[]
  /** 已檢查的字數與其中疑似重複的比例 */
  checked: number
  ratio: number
}

/** 把目前文件的每個段落，與資料夾內其他筆記比對。比例 = 該段 5-gram 有多少出現在同一篇別的筆記裡。 */
export function checkOverlap(
  blocks: { index: number; text: string }[],
  idx: RadarIndex,
  opts: { exclude?: string; threshold?: number } = {}
): OverlapReport {
  const threshold = opts.threshold ?? 0.35
  const inv = new Map<string, number[]>()
  const docs = idx.docs.filter((d) => d.doc.path !== opts.exclude)
  docs.forEach((d, di) => {
    for (const g of grams(d.doc.content)) {
      const l = inv.get(g)
      if (l) l.push(di)
      else inv.set(g, [di])
    }
  })
  const flags: OverlapFlag[] = []
  let checked = 0
  let dup = 0
  for (const b of blocks) {
    const g = grams(b.text)
    if (g.size < 12) continue
    checked += b.text.length
    const hit = new Map<number, number>()
    for (const x of g) for (const di of inv.get(x) ?? []) hit.set(di, (hit.get(di) ?? 0) + 1)
    let best = -1
    let bestN = 0
    for (const [di, n] of hit) if (n > bestN) ((best = di), (bestN = n))
    const ratio = bestN / g.size
    if (best >= 0 && ratio >= threshold) {
      dup += b.text.length * ratio
      flags.push({ block: b.index, ratio, from: docs[best].doc.rel, path: docs[best].doc.path, head: b.text.replace(/\s+/g, ' ').trim().slice(0, 28), len: b.text.length })
    }
  }
  flags.sort((a, b) => b.ratio - a.ratio)
  return { flags, checked, ratio: checked ? dup / checked : 0 }
}

/* ------------------------------ 自動大綱 ------------------------------ */

export function buildOutlinePrompt(topicOrText: string, hasDoc: boolean): { instruction: string; text: string } {
  return {
    instruction: [
      hasDoc ? '下面是一篇還在寫的文章。請替它擬一份更清楚的大綱。' : '請依使用者給的主題擬一份文章大綱。',
      '只輸出 Markdown 標題行（# 到 ####），每行一個，不要任何說明、不要程式碼圍欄、不要內文。',
      '層次分明、同層並列、不重複；一般 6 到 20 行。用繁體中文。'
    ].join('\n'),
    text: topicOrText
  }
}

/** 只保留標題行，避免模型多話把說明寫進文件 */
export function parseOutline(raw: string): string[] {
  const out: string[] = []
  for (const line of raw.replace(/^```\w*\s*/m, '').split(/\r?\n/)) {
    const m = /^(#{1,4})\s+(\S.*)$/.exec(line.trim())
    if (m) out.push(`${m[1]} ${m[2].trim().slice(0, 80)}`)
    if (out.length >= 60) break
  }
  return out
}
