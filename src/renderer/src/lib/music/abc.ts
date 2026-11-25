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

/* ------------------------------ %%abcjs_render_params（只放行六線譜） ------------------------------ */

export interface AbcTablature { instrument: 'guitar' | 'violin'; label?: string; tuning?: string[]; capo?: number }
export interface AbcRenderParams { tablature?: AbcTablature[] }

const PARAM_LINE = /^\s*%%abcjs_render_params\s+(.*)$/m

/**
 * 讀出 `%%abcjs_render_params {json}`。只放行 tablature（instrument 限 guitar／violin），
 * 其他鍵一律拒絕，避免文件內容改到渲染器的行為（例如 add_classes、clickListener）。
 */
export function extractAbcParams(source: string): { params: AbcRenderParams; error?: string } {
  const m = PARAM_LINE.exec(source)
  if (!m) return { params: {} }
  let raw: unknown
  try {
    raw = JSON.parse(m[1])
  } catch {
    return { params: {}, error: '%%abcjs_render_params 後面必須是合法的 JSON' }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { params: {}, error: '%%abcjs_render_params 必須是 JSON 物件' }
  const obj = raw as Record<string, unknown>
  for (const k of Object.keys(obj)) if (k !== 'tablature') return { params: {}, error: `%%abcjs_render_params 只支援 tablature，不支援「${k}」` }
  if (!Array.isArray(obj.tablature) || obj.tablature.length === 0 || obj.tablature.length > 4) return { params: {}, error: 'tablature 必須是 1–4 個項目的陣列' }
  const out: AbcTablature[] = []
  for (const t of obj.tablature as any[]) {
    if (!t || typeof t !== 'object' || (t.instrument !== 'guitar' && t.instrument !== 'violin')) return { params: {}, error: 'tablature.instrument 只能是 guitar 或 violin' }
    const item: AbcTablature = { instrument: t.instrument }
    if (t.label !== undefined) {
      if (typeof t.label !== 'string' || t.label.length > 60) return { params: {}, error: 'tablature.label 必須是 60 字以內的文字' }
      item.label = t.label
    }
    if (t.tuning !== undefined) {
      if (!Array.isArray(t.tuning) || t.tuning.length < 3 || t.tuning.length > 8 || !t.tuning.every((x: unknown) => typeof x === 'string' && /^[A-Ga-g][,']*$/.test(x))) return { params: {}, error: 'tablature.tuning 必須是 3–8 個 ABC 音名，例如 ["E,","A,","D","G","B","e"]' }
      item.tuning = t.tuning
    }
    if (t.capo !== undefined) {
      if (!Number.isInteger(t.capo) || t.capo < 0 || t.capo > 12) return { params: {}, error: 'tablature.capo 必須是 0–12 的整數' }
      item.capo = t.capo
    }
    out.push(item)
  }
  return { params: { tablature: out } }
}
