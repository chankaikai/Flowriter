/** 本地知識雷達：自建的關鍵字索引（BM25），中文用雙字詞、英文用單字，全程在本機計算。 */
export interface RadarDoc {
  path: string
  name: string
  rel: string
  content: string
}
interface Indexed {
  doc: RadarDoc
  paras: string[]
  tf: Map<string, number>
  len: number
}
export interface RadarIndex {
  docs: Indexed[]
  df: Map<string, number>
  avg: number
}
export interface RadarHit {
  path: string
  name: string
  rel: string
  score: number
  snippet: string
  /** 命中的詞（最多 5 個），讓使用者看出為什麼相關 */
  terms: string[]
}

const STOP = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'are', 'was', 'you', 'not', 'but', 'have', 'from'])

export function tokenize(text: string): string[] {
  const out: string[] = []
  const t = text.toLowerCase()
  for (const m of t.matchAll(/[a-z0-9]{2,}|[㐀-鿿]+/g)) {
    const w = m[0]
    if (/^[a-z0-9]/.test(w)) {
      if (!STOP.has(w)) out.push(w)
    } else if (w.length === 1) {
      continue
    } else {
      for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2))
    }
  }
  return out
}

const count = (tokens: string[]) => {
  const m = new Map<string, number>()
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1)
  return m
}

export function buildIndex(docs: RadarDoc[]): RadarIndex {
  const df = new Map<string, number>()
  const indexed: Indexed[] = docs.map((doc) => {
    const toks = tokenize(doc.content)
    const tf = count(toks)
    for (const k of tf.keys()) df.set(k, (df.get(k) ?? 0) + 1)
    return { doc, paras: doc.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean), tf, len: toks.length }
  })
  const avg = indexed.reduce((a, d) => a + d.len, 0) / Math.max(1, indexed.length)
  return { docs: indexed, df, avg: avg || 1 }
}

export function queryIndex(idx: RadarIndex, text: string, opts: { exclude?: string; limit?: number } = {}): RadarHit[] {
  const q = count(tokenize(text))
  if (!q.size) return []
  const N = idx.docs.length
  const k1 = 1.2
  const b = 0.75
  const hits: RadarHit[] = []
  for (const d of idx.docs) {
    if (d.doc.path === opts.exclude) continue
    let score = 0
    const matched: [string, number][] = []
    for (const [term] of q) {
      const f = d.tf.get(term)
      if (!f) continue
      const n = idx.df.get(term) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      const s = idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / idx.avg)))
      score += s
      matched.push([term, s])
    }
    if (score <= 0) continue
    matched.sort((a, b2) => b2[1] - a[1])
    const terms = matched.slice(0, 5).map((m) => m[0])
    hits.push({ path: d.doc.path, name: d.doc.name, rel: d.doc.rel, score, snippet: bestParagraph(d.paras, new Set(terms)), terms })
  }
  return hits.sort((a, b2) => b2.score - a.score).slice(0, opts.limit ?? 8)
}

function bestParagraph(paras: string[], terms: Set<string>): string {
  let best = ''
  let bestN = -1
  for (const p of paras) {
    const toks = new Set(tokenize(p))
    let n = 0
    for (const t of terms) if (toks.has(t)) n++
    if (n > bestN) {
      bestN = n
      best = p
    }
  }
  return best.replace(/\s+/g, ' ').slice(0, 140)
}
