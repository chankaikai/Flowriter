export function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i <= 0 ? p.slice(0, i + 1) || '/' : p.slice(0, i)
}

export function stripExt(name: string): string {
  return name.replace(/\.(md|markdown|mdown|txt)$/i, '')
}

const isAbs = (p: string) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')

/** 將相對路徑接到 baseDir 上並正規化（不依賴 Node path）。 */
export function joinPath(baseDir: string, rel: string): string {
  if (isAbs(rel)) return rel
  const sep = baseDir.includes('\\') && !baseDir.includes('/') ? '\\' : '/'
  const out: string[] = []
  for (const seg of (baseDir + '/' + rel).split(/[\\/]/)) {
    if (seg === '' && out.length > 0) continue
    if (seg === '.') continue
    if (seg === '..') {
      if (out.length > 1) out.pop()
      continue
    }
    out.push(seg)
  }
  return out.join(sep)
}

const REMOTE = /^(https?:|data:|blob:|inkwell:)/i

/** 將 Markdown 中的圖片位址轉為編輯器可載入的位址。 */
export function toDisplayUrl(docDir: string | null, src: string): string {
  if (!src || REMOTE.test(src)) return src
  let p = src
  try {
    p = decodeURI(src)
  } catch {
    /* keep raw */
  }
  if (p.startsWith('file://')) p = decodeURIComponent(p.replace(/^file:\/\/\/?/, isAbs(p.slice(7)) ? '' : '/'))
  if (!isAbs(p)) {
    if (!docDir) return src
    p = joinPath(docDir, p)
  }
  return 'inkwell://local/' + encodeURIComponent(p)
}

/** 給匯出使用：回傳絕對路徑，無法解析則為 null。 */
export function toAbsolutePath(docDir: string | null, src: string): string | null {
  if (!src || REMOTE.test(src)) return null
  let p = src
  try {
    p = decodeURI(src)
  } catch {
    /* keep raw */
  }
  p = p.replace(/^file:\/\//, '')
  if (isAbs(p)) return p
  return docDir ? joinPath(docDir, p) : null
}
