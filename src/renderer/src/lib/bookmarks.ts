/** 冷啟動書籤：每個檔案記住上次落筆位置與使用者寫給「明天的自己」的接續提示。 */
const KEY = 'inkwell.bookmarks.v1'
const MAX = 200

export interface Bookmark {
  pos: number
  hint?: string
  ts: number
}

function loadAll(): Record<string, Bookmark> {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '{}')
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {}
  } catch {
    return {}
  }
}

export function getBookmark(path: string): Bookmark | null {
  return loadAll()[path] ?? null
}

function writeAll(all: Record<string, Bookmark>): void {
  // 只保留最近 MAX 筆
  const keys = Object.keys(all).sort((a, b) => all[b].ts - all[a].ts)
  for (const k of keys.slice(MAX)) delete all[k]
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function saveCaret(path: string, pos: number): void {
  const all = loadAll()
  all[path] = { ...all[path], pos, ts: Date.now() }
  writeAll(all)
}

export function setHint(path: string, hint: string): void {
  const all = loadAll()
  all[path] = { pos: all[path]?.pos ?? 0, ...all[path], hint: hint.trim() || undefined, ts: Date.now() }
  writeAll(all)
}
