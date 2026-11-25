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

/** 接續提示：每個檔案可以有多筆，依時間由新到舊；重新打開時用最新的一筆。 */
const RKEY = 'inkwell.resumes.v1'
const RMAX_PER_FILE = 30

export interface Resume {
  id: string
  pos: number
  hint: string
  ts: number
}

function loadResumes(): Record<string, Resume[]> {
  try {
    const j = JSON.parse(localStorage.getItem(RKEY) || '{}')
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {}
  } catch {
    return {}
  }
}

function saveResumes(all: Record<string, Resume[]>): void {
  try {
    localStorage.setItem(RKEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

/** 由新到舊 */
export function getResumes(path: string): Resume[] {
  const list = loadResumes()[path]
  return Array.isArray(list) ? [...list].sort((a, b) => b.ts - a.ts) : []
}

export function addResume(path: string, pos: number, hint: string, now = Date.now()): Resume {
  const all = loadResumes()
  const r: Resume = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, pos, hint: hint.trim(), ts: now }
  all[path] = [r, ...(all[path] ?? [])].sort((a, b) => b.ts - a.ts).slice(0, RMAX_PER_FILE)
  saveResumes(all)
  return r
}

export function removeResume(path: string, id: string): void {
  const all = loadResumes()
  const left = (all[path] ?? []).filter((r) => r.id !== id)
  if (left.length) all[path] = left
  else delete all[path]
  saveResumes(all)
}
