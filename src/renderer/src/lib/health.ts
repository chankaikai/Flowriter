import { parseOutline } from './markdown'
import { collectVars, evaluate } from './calc'
import { maskedLines } from './lint'

export interface HealthIssue {
  level: 'error' | 'warn' | 'info'
  rule: string
  line: number
  message: string
  snippet: string
}

export interface ImageRef { line: number; src: string }

const slug = (t: string) =>
  t.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-')

/** 匯出前的文件健檢：只看文字。本機圖片是否存在由 checkImages 另外問檔案系統。 */
export function healthCheck(md: string): { issues: HealthIssue[]; images: ImageRef[] } {
  const issues: HealthIssue[] = []
  const images: ImageRef[] = []
  const add = (level: HealthIssue['level'], rule: string, line: number, message: string, snippet = '') =>
    issues.push({ level, rule, line, message, snippet: snippet.slice(0, 30) })

  const body = maskedLines(md)
  const raws = body.map((b) => b.raw)

  // 標題
  const heads = parseOutline(md)
  let prev = 0
  const seen = new Map<string, number>()
  for (const h of heads) {
    if (!h.text.trim()) add('warn', 'empty-heading', h.line, '標題是空的')
    if (prev && h.level > prev + 1) add('warn', 'heading-jump', h.line, `標題從 H${prev} 直接跳到 H${h.level}`, h.text)
    prev = h.level
    const key = `${h.level}:${h.text.trim()}`
    if (seen.has(key)) add('info', 'dup-heading', h.line, `標題「${h.text}」重複（第 ${seen.get(key)! + 1} 行也有）`, h.text)
    else seen.set(key, h.line)
  }
  const anchors = new Set(heads.map((h) => slug(h.text)))

  // 腳註
  const refs = new Map<string, number>()
  const defs = new Map<string, number>()
  raws.forEach((raw, i) => {
    if (body[i].text == null) return
    const d = /^\[\^([^\]\s]+)\]:/.exec(raw)
    if (d) defs.set(d[1], i)
    for (const m of raw.matchAll(/\[\^([^\]\s]+)\](?!:)/g)) if (!refs.has(m[1])) refs.set(m[1], i)
  })
  for (const [k, ln] of refs) if (!defs.has(k)) add('error', 'fn-missing', ln, `腳註 [^${k}] 沒有對應的內容`, `[^${k}]`)
  for (const [k, ln] of defs) if (!refs.has(k)) add('warn', 'fn-unused', ln, `腳註 [^${k}] 定義了但文中沒有引用`, `[^${k}]`)

  // 連結、圖片、標記
  const vars = collectVars(raws)
  let tasksOpen = 0
  let hasToc = false
  raws.forEach((raw, i) => {
    if (body[i].text == null) return
    if (/^\s*\[TOC\]\s*$/i.test(raw)) hasToc = true
    if (/^\s*[-*+]\s+\[ \]/.test(raw)) tasksOpen++
    for (const m of raw.matchAll(/(!?)\[([^\]]*)\]\(([^)]*)\)/g)) {
      const [whole, bang, text, urlRaw] = m
      const url = urlRaw.trim().split(/\s+/)[0]
      if (!url) add('error', 'empty-link', i, bang ? '圖片沒有路徑' : '連結沒有網址', whole)
      else if (bang) {
        if (!text.trim()) add('info', 'img-alt', i, '圖片沒有替代文字（alt）', whole)
        if (!/^(https?:|data:|inkwell:)/i.test(url)) images.push({ line: i, src: decodeURI(url.replace(/^<|>$/g, '')) })
      } else if (url.startsWith('#') && !anchors.has(slug(decodeURIComponent(url.slice(1))))) {
        add('warn', 'bad-anchor', i, `連結指向的標題不存在：${url}`, whole)
      }
    }
    if (/\b(TODO|FIXME|XXX)\b/.test(raw)) add('warn', 'todo', i, '還有 TODO / FIXME 標記', raw.trim())
    for (const m of raw.matchAll(/\{\{([^{}\n]+)\}\}/g)) {
      if (evaluate(m[1], vars) == null) add('warn', 'bad-calc', i, `算式算不出來：${m[0]}`, m[0])
    }
  })
  if (hasToc && !heads.length) add('warn', 'toc-empty', 0, '有 [TOC] 但文件沒有標題')
  if (tasksOpen) add('info', 'tasks', 0, `還有 ${tasksOpen} 個未完成的任務`)
  const order = { error: 0, warn: 1, info: 2 }
  issues.sort((a, b) => order[a.level] - order[b.level] || a.line - b.line)
  return { issues, images }
}

/** 逐一確認本機圖片存在。exists 由呼叫端提供（問主程序的檔案系統）。 */
export async function checkImages(
  images: ImageRef[],
  resolve: (src: string) => string | null,
  exists: (abs: string) => Promise<boolean>
): Promise<HealthIssue[]> {
  const out: HealthIssue[] = []
  for (const im of images) {
    const abs = resolve(im.src)
    if (!abs || !(await exists(abs))) {
      out.push({ level: 'error', rule: 'img-missing', line: im.line, message: `找不到圖片：${im.src}`, snippet: im.src })
    }
  }
  return out
}
