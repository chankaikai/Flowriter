/** 圖床設定與純函式（主程序與前端共用，不依賴 electron / DOM）。 */
export type HostKind = 'local' | 'picgo' | 'custom'

export interface ImageHostCfg {
  kind: HostKind
  /** PicGo / PicList 的本機上傳介面 */
  picgoUrl: string
  customUrl: string
  /** multipart 欄位名 */
  customField: string
  /** 額外標頭，每行一個「Name: value」 */
  customHeaders: string
  /** 回應 JSON 中圖片網址的路徑，例如 data.url；回應本身就是網址時留空 */
  customPath: string
}

export const DEFAULT_HOST: ImageHostCfg = {
  kind: 'local',
  picgoUrl: 'http://127.0.0.1:36677/upload',
  customUrl: '',
  customField: 'file',
  customHeaders: '',
  customPath: 'data.url'
}

export const normalizeHost = (raw: unknown): ImageHostCfg => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const s = (k: keyof ImageHostCfg, d: string) => (typeof r[k] === 'string' ? (r[k] as string).slice(0, 2000) : d)
  return {
    kind: r.kind === 'picgo' || r.kind === 'custom' ? r.kind : 'local',
    picgoUrl: s('picgoUrl', DEFAULT_HOST.picgoUrl),
    customUrl: s('customUrl', ''),
    customField: s('customField', 'file') || 'file',
    customHeaders: s('customHeaders', ''),
    customPath: s('customPath', 'data.url')
  }
}

export const isHttpUrl = (u: string): boolean => /^https?:\/\/[^\s]+$/i.test(u.trim())

/** 「Name: value」逐行解析；格式不對的行略過，名稱只允許標準標頭字元 */
export function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9-]+)\s*:\s*(.+?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** 以 a.b.0.c 路徑取 JSON 值；取不到回傳 undefined */
export function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const part of path.split('.').filter(Boolean)) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

/** 從自訂圖床的回應取網址：先照路徑，再退到整段文字就是網址的情況 */
export function pickUrl(bodyText: string, path: string): string | null {
  const t = bodyText.trim()
  if (isHttpUrl(t)) return t
  try {
    const j = JSON.parse(t)
    const v = path ? getByPath(j, path) : undefined
    if (typeof v === 'string' && isHttpUrl(v)) return v
  } catch {
    /* 不是 JSON */
  }
  return null
}

export interface LocalImage { url: string }

/** 找出文件中指向本機檔案的圖片（相對路徑或 file://），略過網址、base64 與程式碼區塊 */
export function findLocalImages(md: string): LocalImage[] {
  const seen = new Set<string>()
  const out: LocalImage[] = []
  let fence = ''
  for (const line of md.split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = ''
      continue
    }
    if (fence) continue
    for (const m of line.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s>]+))(?:\s+"[^"]*")?\s*\)/g)) {
      const url = m[1] ?? m[2]
      if (/^(https?:|data:|blob:|inkwell:|#)/i.test(url) || seen.has(url)) continue
      seen.add(url)
      out.push({ url })
    }
  }
  return out
}

/** 把圖片連結換成新網址（只改 ![](…) 裡完全相等的連結，不動其他文字） */
export function replaceImageUrls(md: string, map: Map<string, string>): string {
  return md.replace(/(!\[[^\]]*\]\(\s*)(?:<([^>]+)>|([^)\s>]+))((?:\s+"[^"]*")?\s*\))/g, (all, a: string, u1: string | undefined, u2: string | undefined, z: string) => {
    const url = u1 ?? u2 ?? ''
    const to = map.get(url)
    if (!to) return all
    return `${a}${/\s/.test(to) ? `<${to}>` : to}${z}`
  })
}
