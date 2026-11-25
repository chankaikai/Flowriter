/**
 * MEI / MusicXML 的檢查、聲部列表與聲部過濾。純字串處理，不碰 DOM，過濾只回傳「副本」，不動原文。
 * MusicXML 只收未壓縮的 .musicxml／.xml 內容，不收 .mxl（那是 zip）。
 */
export type ScoreLang = 'mei' | 'xml'
export interface ScorePart { id: string; name: string }

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const clean = (s: string) => decode(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()

/** 回傳錯誤訊息；null 表示格式可以交給 Verovio。 */
export function checkScoreSource(lang: ScoreLang, source: string): string | null {
  const t = source.replace(/^﻿/, '').trim()
  if (!t) return `這個 ${lang} 圍欄是空的`
  if (t.startsWith('PK') || /[\u0000-\u0008]/.test(t.slice(0, 200))) return '看起來是壓縮檔（.mxl）。這裡只支援未壓縮的 MusicXML 文字，請先解壓縮再貼上'
  if (t[0] !== '<') return lang === 'mei' ? 'MEI 必須是 XML，內容要從 < 開始' : 'MusicXML 必須是 XML，內容要從 < 開始'
  if (lang === 'mei' && !/<mei[\s>]/.test(t)) return '找不到 <mei> 根元素'
  if (lang === 'xml' && !/<score-(partwise|timewise)[\s>]/.test(t)) return '找不到 <score-partwise> 或 <score-timewise>（只支援未壓縮的 MusicXML）'
  return null
}

export function listScoreParts(lang: ScoreLang, source: string): ScorePart[] {
  const out: ScorePart[] = []
  if (lang === 'xml') {
    const re = /<score-part\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/score-part>/g
    for (let m; (m = re.exec(source)); ) {
      const name = /<part-name\b[^>]*>([\s\S]*?)<\/part-name>/.exec(m[2])
      out.push({ id: m[1], name: (name && clean(name[1])) || m[1] })
    }
    return out
  }
  // MEI：第一個 <scoreDef> 裡的 <staffDef n=…>；名稱取 label 屬性或子元素 <label>
  const sd = /<scoreDef\b[\s\S]*?<\/scoreDef>/.exec(source)
  const scope = sd ? sd[0] : source
  const re = /<staffDef\b([^>]*?)(\/>|>([\s\S]*?)<\/staffDef>)/g
  for (let m; (m = re.exec(scope)); ) {
    const n = /\bn\s*=\s*["']([^"']+)["']/.exec(m[1])
    if (!n) continue
    const attr = /\blabel\s*=\s*["']([^"']*)["']/.exec(m[1])
    const child = m[3] ? /<label\b[^>]*>([\s\S]*?)<\/label>/.exec(m[3]) : null
    out.push({ id: n[1], name: decode((attr && attr[1]) || (child && clean(child[1])) || `聲部 ${n[1]}`) })
  }
  return out
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 只保留某一個聲部（副本）。id 不存在就原樣回傳。 */
export function filterScoreParts(lang: ScoreLang, source: string, part: string): string {
  if (part === 'all') return source
  const parts = listScoreParts(lang, source)
  if (!parts.some((p) => p.id === part)) return source
  let s = source
  for (const p of parts) {
    if (p.id === part) continue
    const id = esc(p.id)
    if (lang === 'xml') {
      s = s.replace(new RegExp(`<score-part\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>[\\s\\S]*?<\\/score-part>`, 'g'), '')
      s = s.replace(new RegExp(`<part\\b[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>[\\s\\S]*?<\\/part>`, 'g'), '')
    } else {
      const n = `\\bn\\s*=\\s*["']${id}["']`
      s = s.replace(new RegExp(`<staffDef\\b[^>]*${n}[^>]*?(?:\\/>|>[\\s\\S]*?<\\/staffDef>)`, 'g'), '')
      s = s.replace(new RegExp(`<staff\\b[^>]*${n}[^>]*?(?:\\/>|>[\\s\\S]*?<\\/staff>)`, 'g'), '')
    }
  }
  return s
}
