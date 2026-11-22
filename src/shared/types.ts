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
}

export interface AiRequest {
  apiKey: string
  model: string
  instruction: string
  text: string
}

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
  setChrome(c: {
    color: string
    symbolColor: string
    themeSource?: 'system' | 'light' | 'dark'
  }): void
  getMaterialSupport(): Promise<MaterialSupport>
  setMaterial(o: { enabled: boolean; kind: 'acrylic' | 'mica' }): void
  toggleFullscreen(): void
  openExternal(url: string): void
  reveal(path: string): void
  /** 版本快照（時光機） */
  historySave(path: string, content: string): Promise<boolean>
  historyList(path: string): Promise<HistoryItem[]>
  historyRead(path: string, ts: number): Promise<string | null>
  /** 以 Claude API 改寫文字，錯誤時回傳 { error } */
  aiRewrite(req: AiRequest): Promise<{ text: string } | { error: string }>
  /** 把 HTML 渲染成長圖（PNG）並讓使用者選擇儲存位置 */
  exportImage(opts: { name: string; html: string; width: number }): Promise<string | null>
  onMenu(cb: (action: string) => void): () => void
}
