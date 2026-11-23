/** 參考資料抽屜：每份文件各自收一組參考片段，存在 .inkwell/refs.json，不進 .md。 */
export interface Ref {
  id: string
  title: string
  /** 來源網址或自由文字（書名、頁碼…） */
  source: string
  body: string
  ts: number
}
export interface RefsFile {
  version: 1
  files: Record<string, Ref[]>
}

export const emptyRefs = (): RefsFile => ({ version: 1, files: {} })

export function parseRefs(raw: string): RefsFile {
  if (!raw.trim()) return emptyRefs()
  try {
    const j = JSON.parse(raw) as Partial<RefsFile>
    const files: Record<string, Ref[]> = {}
    for (const [k, v] of Object.entries(j.files ?? {})) {
      if (!Array.isArray(v)) continue
      files[k] = v
        .filter((r) => r && typeof r.id === 'string' && typeof r.body === 'string')
        .map((r) => ({ id: r.id, title: String(r.title ?? ''), source: String(r.source ?? ''), body: r.body, ts: Number(r.ts) || 0 }))
    }
    return { version: 1, files }
  } catch {
    return emptyRefs()
  }
}

export const serializeRefs = (f: RefsFile): string => JSON.stringify(f, null, 2)

export function addRef(f: RefsFile, file: string, r: { title: string; source: string; body: string }, ts = Date.now()): RefsFile {
  const ref: Ref = {
    id: Math.random().toString(36).slice(2, 9) + ts.toString(36),
    title: r.title.trim(),
    source: r.source.trim(),
    body: r.body.trim().slice(0, 20_000),
    ts
  }
  return { ...f, files: { ...f.files, [file]: [...(f.files[file] ?? []), ref] } }
}

export function removeRef(f: RefsFile, file: string, id: string): RefsFile {
  const rest = (f.files[file] ?? []).filter((r) => r.id !== id)
  const files = { ...f.files }
  if (rest.length) files[file] = rest
  else delete files[file]
  return { ...f, files }
}

export const isUrl = (s: string): boolean => /^https?:\/\/\S+$/i.test(s.trim())

/** 轉成 Markdown 引用區塊，落款帶來源（網址會做成連結）。 */
export function formatRefQuote(r: Pick<Ref, 'title' | 'source' | 'body'>): string {
  const body = r.body.trim().split('\n').map((l) => `> ${l}`.trimEnd()).join('\n')
  const label = r.title.trim() || r.source.trim()
  if (!label) return body + '\n'
  const cite = isUrl(r.source) ? `[${label.replace(/[[\]]/g, '')}](${r.source.trim()})` : r.source.trim() && r.title.trim() ? `${r.title.trim()}，${r.source.trim()}` : label
  return `${body}\n>\n> — ${cite}\n`
}
