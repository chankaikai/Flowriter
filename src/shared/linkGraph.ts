/** 筆記之間的連結關係圖（純函式，主程序與前端共用）。 */
export interface GNode { id: string; label: string; path: string | null; ghost: boolean }
export interface GEdge { s: string; t: string }
export interface LinkGraph { nodes: GNode[]; edges: GEdge[]; truncated: boolean }

const norm = (p: string) => p.replace(/\\/g, '/')
const stemOf = (p: string) => norm(p).split('/').pop()!.replace(/\.(md|markdown|mdx)$/i, '')

const stripCode = (md: string) => md.replace(/^(\s*)(`{3,}|~{3,})[\s\S]*?^\1\2[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '')

export function extractWikiLinks(md: string): string[] {
  const set = new Set<string>()
  for (const m of stripCode(md).matchAll(/\[\[([^[\]\n]{1,120})\]\]/g)) {
    const n = m[1].split('|')[0].split('#')[0].trim()
    if (n) set.add(n)
  }
  return [...set]
}

/** [文字](相對路徑.md)：只取指向 Markdown 檔的相對連結 */
export function extractMdLinks(md: string): string[] {
  const set = new Set<string>()
  for (const m of stripCode(md).matchAll(/(?<!!)\[[^\]]*\]\(\s*<?([^)\s>#]+\.(?:md|markdown|mdx))(?:#[^)\s>]*)?>?(?:\s+"[^"]*")?\s*\)/gi)) {
    let u = m[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^file:/i.test(u)) continue
    try {
      u = decodeURI(u)
    } catch {
      /* 保持原樣 */
    }
    set.add(u)
  }
  return [...set]
}

/** 以 fromPath 所在資料夾為基準解析相對路徑，回傳正規化（斜線、不含 . 與 ..）路徑 */
export function resolveRel(fromPath: string, rel: string): string {
  const parts = norm(fromPath).split('/')
  parts.pop()
  for (const seg of norm(rel).replace(/^file:\/\/\/?/i, '').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

export function buildGraph(files: { path: string; content: string }[], maxNodes = 800): LinkGraph {
  const byPath = new Map<string, string>() // 小寫正規路徑 → 原路徑
  const byStem = new Map<string, string>() // 小寫檔名 → 路徑（同名時取較短路徑）
  for (const f of files) {
    byPath.set(norm(f.path).toLowerCase(), f.path)
    const k = stemOf(f.path).toLowerCase()
    const cur = byStem.get(k)
    if (!cur || norm(f.path).length < norm(cur).length) byStem.set(k, f.path)
  }
  const nodes = new Map<string, GNode>()
  const ensure = (path: string): GNode => {
    let n = nodes.get(path)
    if (!n) nodes.set(path, (n = { id: path, label: stemOf(path), path, ghost: false }))
    return n
  }
  const edgeSet = new Set<string>()
  const edges: GEdge[] = []
  const add = (s: string, t: string) => {
    if (s === t) return
    const k = `${s}\0${t}`
    if (edgeSet.has(k)) return
    edgeSet.add(k)
    edges.push({ s, t })
  }
  for (const f of files) {
    ensure(f.path)
    for (const name of extractWikiLinks(f.content)) {
      const last = name.split('/').pop()!.replace(/\.(md|markdown|mdx)$/i, '')
      const hit = byStem.get(last.toLowerCase())
      if (hit) {
        ensure(hit)
        add(f.path, hit)
      } else {
        const id = `ghost:${last.toLowerCase()}`
        if (!nodes.has(id)) nodes.set(id, { id, label: last, path: null, ghost: true })
        add(f.path, id)
      }
    }
    for (const rel of extractMdLinks(f.content)) {
      const hit = byPath.get(resolveRel(f.path, rel).toLowerCase())
      if (hit) {
        ensure(hit)
        add(f.path, hit)
      }
    }
  }
  let list = [...nodes.values()]
  let truncated = false
  if (list.length > maxNodes) {
    // 太多時保留連結最多的節點
    const deg = new Map<string, number>()
    for (const e of edges) {
      deg.set(e.s, (deg.get(e.s) ?? 0) + 1)
      deg.set(e.t, (deg.get(e.t) ?? 0) + 1)
    }
    list = list.sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0)).slice(0, maxNodes)
    truncated = true
  }
  const keep = new Set(list.map((n) => n.id))
  return { nodes: list, edges: edges.filter((e) => keep.has(e.s) && keep.has(e.t)), truncated }
}

/** 以某節點為中心、沿連結（不分方向）往外 depth 層的子圖 */
export function localSubgraph(g: LinkGraph, center: string, depth: number): LinkGraph {
  if (!g.nodes.some((n) => n.id === center)) return { nodes: [], edges: [], truncated: false }
  const seen = new Set([center])
  let frontier = [center]
  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    for (const e of g.edges) {
      if (frontier.includes(e.s) && !seen.has(e.t)) (seen.add(e.t), next.push(e.t))
      if (frontier.includes(e.t) && !seen.has(e.s)) (seen.add(e.s), next.push(e.s))
    }
    frontier = next
  }
  return { nodes: g.nodes.filter((n) => seen.has(n.id)), edges: g.edges.filter((e) => seen.has(e.s) && seen.has(e.t)), truncated: false }
}
