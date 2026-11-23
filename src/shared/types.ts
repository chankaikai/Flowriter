export interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

export interface FileResult {
  path: string
  content: string
}

export interface FileListItem {
  name: string
  path: string
  rel: string
}

export interface SearchHit {
  path: string
  name: string
  line: number
  text: string
}

/** vibrancy = macOS；win = Windows 11 22H2+ 的 acrylic/mica；none = 不支援（Linux、Win10） */
export type MaterialSupport = 'vibrancy' | 'win' | 'none'

export interface HistoryItem {
  ts: number
  size: number
  /** 里程碑名稱（沒有標籤就是一般快照） */
  tag?: string
}

export interface CapsuleMeta {
  id: string
  title: string
  createdAt: number
  unlockAt: number
}

export type CapsuleOpen = { ok: true; title: string; text: string } | { ok: false; unlockAt?: number }

export interface AiRequest {
  /** anthropic = Claude 原生介面；openai = OpenAI 相容的 /chat/completions */
  kind: 'anthropic' | 'openai'
  baseUrl: string
  apiKey: string
  model: string
  instruction: string
  text: string
  /** 回覆長度上限（推理模型需要較大的值）；預設 4096 */
  maxTokens?: number
}

export type AiBalance =
  | { ok: true; lines: string[] }
  | { ok: false; unsupported: true }
  | { ok: false; error: string; unsupported?: undefined }

export interface InkwellApi {
  platform: string
  openFile(): Promise<FileResult | null>
  readFile(path: string): Promise<FileResult | null>
  saveFile(path: string, content: string): Promise<boolean>
  saveFileAs(suggested: string, content: string): Promise<string | null>
  openFolder(): Promise<string | null>
  readDir(path: string): Promise<DirEntry[]>
  /** 回傳修改時間（毫秒），檔案不存在則為 null */
  statFile(path: string): Promise<number | null>
  createFile(dir: string, name: string): Promise<string | null>
  renamePath(path: string, newName: string): Promise<string | null>
  trashPath(path: string): Promise<boolean>
  listAll(root: string): Promise<FileListItem[]>
  searchFolder(root: string, query: string): Promise<SearchHit[]>
  saveImage(docPath: string, fileName: string, data: ArrayBuffer): Promise<string | null>
  readDataUrl(path: string): Promise<string | null>
  exportFile(opts: {
    name: string
    ext: string
    filterName: string
    data: Uint8Array | string
  }): Promise<string | null>
  exportPdf(opts: { name: string; html: string }): Promise<string | null>
  getLaunchFile(): Promise<string | null>
  pathForFile(file: File): string
  setDirty(dirty: boolean): void
  /** 迷你置頂便籤：縮小視窗並置頂；關閉時還原原本的大小與位置 */
  setSticky(on: boolean): Promise<void>
  setChrome(c: {
    color: string
    symbolColor: string
    themeSource?: 'system' | 'light' | 'dark'
  }): void
  getMaterialSupport(): Promise<MaterialSupport>
  setMaterial(o: { enabled: boolean; kind: 'acrylic' | 'mica' }): void
  toggleFullscreen(): void
  notesRead(docPath: string): Promise<string>
  notesWrite(docPath: string, json: string): Promise<boolean>
  /** 全域快捷鍵 Ctrl/⌘+Alt+Space 叫出收件匣小視窗；回傳是否註冊成功（可能被其他程式占用） */
  inboxSetup(enabled: boolean): Promise<boolean>
  inboxShow(): Promise<void>
  inboxPath(): Promise<string>
  inboxAppend(text: string): Promise<boolean>
  inboxClose(): void
  editRole(role: 'cut' | 'copy' | 'paste' | 'selectAll'): void
  closeWindow(): void
  openExternal(url: string): void
  reveal(path: string): void
  /** 版本快照（時光機） */
  historySave(path: string, content: string): Promise<boolean>
  historyList(path: string): Promise<HistoryItem[]>
  historyRead(path: string, ts: number): Promise<string | null>
  historyMilestone(path: string, content: string, tag: string): Promise<boolean>
  historyReadAll(path: string, limit: number): Promise<{ ts: number; md: string }[]>
  historyIndex(): Promise<{ key: string; name: string; ts: number; size: number }[]>
  historyReadKey(key: string, ts: number): Promise<string | null>
  capsuleCreate(title: string, text: string, unlockAt: number): Promise<string | null>
  capsuleList(): Promise<CapsuleMeta[]>
  capsuleOpen(id: string): Promise<CapsuleOpen>
  capsuleDelete(id: string): Promise<boolean>
  drawerRead(): Promise<string | null>
  drawerWrite(blob: string): Promise<boolean>
  /** 以 Claude API 改寫文字，錯誤時回傳 { error } */
  aiRewrite(req: AiRequest): Promise<{ text: string; usage?: { in: number; out: number } } | { error: string }>
  aiBalance(req: { baseUrl: string; apiKey: string }): Promise<AiBalance>
  aiTest(req: AiRequest): Promise<{ ok: true; reply: string; ms: number } | { ok: false; error: string; ms: number }>
  /** 把 HTML 渲染成長圖（PNG）並讓使用者選擇儲存位置 */
  exportImage(opts: { name: string; html: string; width: number }): Promise<string | null>
  clipWatch(on: boolean): Promise<boolean>
  onClip(cb: (text: string) => void): () => void
  onMenu(cb: (action: string) => void): () => void
}
