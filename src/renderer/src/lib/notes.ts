/** 頁邊便條：以「引文」錨定在文字上，文字被改動時便條不會消失，只標為失聯。 */
export interface Note {
  id: string
  /** 被標註的原文（取選取文字的前 120 字） */
  quote: string
  text: string
  ts: number
  done?: boolean
}
export interface NotesFile {
  version: 1
  /** 以檔名為鍵，同一資料夾的檔案共用一份 notes.json */
  files: Record<string, Note[]>
}

export const emptyNotes = (): NotesFile => ({ version: 1, files: {} })

export function parseNotes(raw: string): NotesFile {
  if (!raw.trim()) return emptyNotes()
  try {
    const j = JSON.parse(raw) as Partial<NotesFile>
    const files: Record<string, Note[]> = {}
    for (const [k, v] of Object.entries(j.files ?? {})) {
      if (!Array.isArray(v)) continue
      files[k] = v
        .filter((n) => n && typeof n.id === 'string' && typeof n.text === 'string')
        .map((n) => ({ id: n.id, quote: String(n.quote ?? ''), text: n.text, ts: Number(n.ts) || 0, done: !!n.done }))
    }
    return { version: 1, files }
  } catch {
    return emptyNotes()
  }
}

export const serializeNotes = (f: NotesFile): string => JSON.stringify(f, null, 2)

export const noteId = (): string => Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

export function addNote(f: NotesFile, file: string, quote: string, text: string, ts = Date.now()): NotesFile {
  const n: Note = { id: noteId(), quote: quote.trim().slice(0, 120), text: text.trim(), ts }
  return { ...f, files: { ...f.files, [file]: [...(f.files[file] ?? []), n] } }
}

export function updateNote(f: NotesFile, file: string, id: string, patch: Partial<Pick<Note, 'text' | 'done'>>): NotesFile {
  return { ...f, files: { ...f.files, [file]: (f.files[file] ?? []).map((n) => (n.id === id ? { ...n, ...patch } : n)) } }
}

export function removeNote(f: NotesFile, file: string, id: string): NotesFile {
  const rest = (f.files[file] ?? []).filter((n) => n.id !== id)
  const files = { ...f.files }
  if (rest.length) files[file] = rest
  else delete files[file]
  return { ...f, files }
}

/** 內容被改到找不到引文時視為失聯（只比對純文字，忽略 Markdown 符號） */
export function isOrphan(md: string, quote: string): boolean {
  if (!quote) return false
  const plain = (t: string) => t.replace(/[*_`~#>\[\]()!|\\-]/g, '').replace(/\s+/g, ' ')
  return !plain(md).includes(plain(quote).trim())
}
