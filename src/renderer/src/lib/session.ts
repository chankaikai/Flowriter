export interface SavedTab {
  path: string | null
  name: string
  /** 只有未命名分頁才保存內容；有路徑的分頁重開時從磁碟讀取 */
  md?: string
  /** 有路徑的分頁若有未儲存的更改，這裡保留一份（約每 5 秒更新），崩潰後可恢復 */
  dirtyMd?: string
  /** 保存當時磁碟檔案的修改時間，恢復時用來判斷檔案是否在這之後被外部改過 */
  base?: number
  scroll: number
}
export interface SavedSession {
  tabs: SavedTab[]
  active: number
}

const SESSION_KEY = 'inkwell.session.v1'
const RECENT_KEY = 'inkwell.recent.v1'
const MAX_RECENT = 15

export function loadSession(): SavedSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as SavedSession | null
    return s && Array.isArray(s.tabs) ? s : null
  } catch {
    return null
  }
}

export function saveSession(s: SavedSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    /* 空間不足時忽略 */
  }
}

export function loadRecent(): string[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(r) ? r.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function pushRecent(path: string): string[] {
  const next = [path, ...loadRecent().filter((p) => p !== path)].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}
