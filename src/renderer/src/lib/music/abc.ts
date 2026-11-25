/** ABC 記譜的聲部偵測與分譜過濾。純函式；分譜只是「交給渲染器的副本」，不寫回文件。 */

export interface AbcPart { id: string; name: string }

const HEADER_V = /^V:\s*([^\s\]]+)(.*)$/
const INLINE_V = /\[V:\s*([^\s\]]+)[^\]]*\]/g
const NAME_RE = /\b(?:name|nm)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/

/** 聲部來自 `V:` 欄位（標頭或正文）。顯示名取 name="…"，沒有就用 id。 */
export function listAbcParts(source: string): AbcPart[] {
  const parts = new Map<string, string>()
  const add = (id: string, name?: string) => {
    if (!parts.has(id)) parts.set(id, name || id)
    else if (name && parts.get(id) === id) parts.set(id, name)
  }
  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('%')) continue
    const h = HEADER_V.exec(line)
    if (h) {
      const m = NAME_RE.exec(h[2])
      add(h[1], m ? (m[1] ?? m[2] ?? m[3]) : undefined)
    }
    for (const m of line.matchAll(INLINE_V)) add(m[1])
  }
  return [...parts].map(([id, name]) => ({ id, name }))
}

/**
 * 只畫某個聲部：把 `%%score` 改成只含這個 id；原文沒有就在標頭的 `K:` 後插入一行。
 * 正文其他聲部的音符保留（ABC 靠它們對齊），只靠 %%score 決定畫哪幾行。
 */
export function filterAbcPart(source: string, partId: 'all' | string): string {
  if (partId === 'all') return source
  if (!listAbcParts(source).some((p) => p.id === partId)) return source
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const out: string[] = []
  let replaced = false
  for (const l of lines) {
    if (/^\s*%%(score|staves)\b/.test(l)) {
      if (!replaced) out.push(`%%score ${partId}`)
      replaced = true
      continue
    }
    out.push(l)
  }
  if (!replaced) {
    const k = out.findIndex((l) => /^K:/.test(l))
    if (k < 0) return source
    out.splice(k + 1, 0, `%%score ${partId}`)
  }
  return out.join(eol)
}
