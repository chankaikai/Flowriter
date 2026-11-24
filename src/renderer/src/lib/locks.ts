/**
 * 段落上鎖：被鎖的段落在編輯器中唯讀，防止誤改。
 * 上鎖資訊存在文件旁的 .inkwell/locks.json（以段落的純文字比對），不會寫進 .md。
 */
export interface LocksFile {
  version: 1
  files: Record<string, string[]>
}
export const emptyLocks = (): LocksFile => ({ version: 1, files: {} })

/** 比對用：收掉多餘空白，避免排版差異讓上鎖失效 */
export const normLock = (t: string): string => t.replace(/\s+/g, ' ').trim()

export function parseLocks(raw: string): LocksFile {
  if (!raw.trim()) return emptyLocks()
  try {
    const j = JSON.parse(raw) as Partial<LocksFile>
    const files: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(j.files ?? {})) {
      if (Array.isArray(v)) files[k] = [...new Set(v.filter((x): x is string => typeof x === 'string' && !!normLock(x)).map(normLock))]
    }
    return { version: 1, files }
  } catch {
    return emptyLocks()
  }
}
export const serializeLocks = (f: LocksFile): string => JSON.stringify(f, null, 2)

export function setLocked(f: LocksFile, file: string, text: string, locked: boolean): LocksFile {
  const t = normLock(text)
  if (!t) return f
  const cur = new Set(f.files[file] ?? [])
  if (locked) cur.add(t)
  else cur.delete(t)
  const files = { ...f.files }
  if (cur.size) files[file] = [...cur]
  else delete files[file]
  return { ...f, files }
}

export interface Range {
  from: number
  to: number
}
/**
 * 一次修改的某一段範圍（舊文件座標）是否碰到上鎖範圍。
 * 嚴格在鎖定範圍內部才算（邊界上的插入，例如在鎖定段落前後按 Enter 新增段落，是允許的）。
 */
export function touchesLocked(start: number, end: number, locked: Range[]): boolean {
  for (const r of locked) {
    if (start === end) {
      if (start > r.from && start < r.to) return true
    } else if (start < r.to && end > r.from) return true
  }
  return false
}
