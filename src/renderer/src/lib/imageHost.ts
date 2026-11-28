import { DEFAULT_HOST, normalizeHost, type ImageHostCfg } from '../../../shared/imageHost'

const KEY = 'inkwell.imagehost.v1'

export function loadHost(): ImageHostCfg {
  try {
    return normalizeHost(JSON.parse(localStorage.getItem(KEY) || '{}'))
  } catch {
    return DEFAULT_HOST
  }
}

export function saveHost(c: ImageHostCfg): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

/** 上傳到圖床；回傳網址，失敗時回傳錯誤文字。未啟用圖床時回傳 null（呼叫端改存本機）。 */
export async function uploadToHost(name: string, data: ArrayBuffer): Promise<{ url: string } | { error: string } | null> {
  const cfg = loadHost()
  if (cfg.kind === 'local') return null
  const r = await window.api.imageHostUpload({ cfg, name, data })
  return r.ok ? { url: r.url } : { error: r.error }
}
