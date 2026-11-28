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

export interface MusicTrack { id: string; file: string; title: string; added: number; missing?: boolean }
export interface MusicPlaylist { id: string; name: string; icon: string; cover?: string; trackIds: string[] }
export interface MusicLibState { dir: string; isDefault: boolean; tracks: MusicTrack[]; playlists: MusicPlaylist[] }

import type { ImageHostCfg } from './imageHost'
import type { GitStatus } from './gitSync'
import type { LinkGraph } from './linkGraph'

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
  graphBuild(folder: string): Promise<LinkGraph & { files: number }>
  gitStatus(dir: string): Promise<GitStatus>
  gitInit(dir: string): Promise<{ ok: boolean; out: string }>
  gitRemote(root: string, url: string): Promise<{ ok: boolean; out: string }>
  gitPull(root: string): Promise<{ ok: boolean; out: string }>
  gitSync(root: string, message: string, onlyDocs: boolean): Promise<{ ok: boolean; out: string }>
  imageHostUpload(o: { cfg: ImageHostCfg; name: string; data: ArrayBuffer }): Promise<{ ok: true; url: string } | { ok: false; error: string }>
  readDataUrl(path: string): Promise<string | null>
  exportFile(opts: {
    name: string
    ext: string
    filterName: string
    data: Uint8Array | string
  }): Promise<string | null>
  exportPdf(opts: { name: string; html: string; header?: string; footer?: string }): Promise<string | null>
  exportPrint(opts: { html: string }): Promise<{ ok: boolean; reason: string }>
  getLaunchFile(): Promise<string | null>
  takeExternalOpen(): Promise<string[]>
  onExternalOpen(cb: (path: string) => void): () => void
  /** 這個視窗是由「分頁拖出」建立的：領取要帶過來的文件（只會領到一次） */
  getInitialDoc(): Promise<{ path: string | null; name: string; md: string; saved: string } | null>
  /** 把分頁內容交給新視窗；回傳是否成功 */
  detachTab(doc: { path: string | null; name: string; md: string; saved: string }, pos?: { x: number; y: number }): Promise<boolean>
  newWindow(): void
  pathForFile(file: File): string
  setDirty(dirty: boolean): void
  /** 在本機以編譯器／直譯器執行原生語言代碼塊（暫存資料夾、逾時、輸出上限；無沙盒） */
  nativeRun(req: import('./native').NativeRunRequest): Promise<import('./native').NativeRunResult>
  nativeStop(id: string): void
  /** 氛圍音錄音檔：種類 → 來源 */
  /** 備份使用者資料（歷史版本、膠囊、抽屜、環境音）與前端設定到一個檔 */
  dataBackup(local: Record<string, string>): Promise<{ ok: true; path: string; count: number; bytes: number } | { ok: false; reason: string }>
  /** 從備份檔還原；成功時回傳要寫回 localStorage 的設定 */
  dataRestore(): Promise<{ ok: true; count: number; local: Record<string, string>; name: string } | { ok: false; reason: string }>
  cacheSize(): Promise<number>
  dataLocation(): Promise<{ dir: string }>
  dataMoveDir(): Promise<{ ok: true; path: string } | { ok: false; reason: string }>
  appRelaunch(): Promise<void>
  cacheClear(): Promise<{ ok: boolean; freed: number; before: number; reason?: string }>
  ambientList(): Promise<Record<string, 'user' | 'bundled'>>
  ambientRead(kind: string): Promise<Uint8Array | null>
  ambientImport(kind: string): Promise<boolean>
  ambientRemove(kind: string): Promise<boolean>
  musicState(): Promise<MusicLibState>
  musicSetDir(): Promise<MusicLibState | null>
  musicImport(): Promise<MusicLibState | null>
  musicScan(): Promise<MusicLibState & { added: number; removed: number }>
  musicRead(id: string): Promise<Uint8Array | null>
  musicSavePlaylists(p: MusicPlaylist[]): Promise<MusicLibState>
  musicRemoveTrack(id: string): Promise<MusicLibState>
  musicCover(): Promise<string | null>
  musicCoverData(rel: string): Promise<string | null>
  /** 略過未儲存提示，直接關閉視窗（儲存完成後使用） */
  forceClose(): void
  /** 原生確認對話框（不要用 window.confirm，它會讓編輯器失去焦點） */
  confirm(o: { message: string; detail?: string; ok?: string; cancel?: string }): Promise<boolean>
  appVersion(): Promise<string>
  updateStatus(): Promise<import('./update').UpdateStatus>
  updateCheck(): Promise<import('./update').UpdateStatus>
  updateDownload(): Promise<import('./update').UpdateStatus>
  updateInstall(): void
  onUpdate(cb: (s: import('./update').UpdateStatus) => void): () => void
  /** 歡迎畫面顯示期間：隱藏／停用視窗的最小化與關閉按鈕 */
  setSplash(on: boolean): void
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
  /** 註冊／取消全域快捷鍵；accel 為實際註冊成功的組合（主要組合被占用時會退而求其次） */
  inboxSetup(enabled: boolean): Promise<{ ok: boolean; accel: string }>
  inboxShow(): Promise<void>
  inboxPath(): Promise<string>
  inboxAppend(text: string): Promise<boolean>
  inboxClose(): void
  refsRead(docPath: string): Promise<string>
  refsWrite(docPath: string, json: string): Promise<boolean>
  /** 截取視窗某區域，回傳 PNG 位元組 */
  captureRegion(r: { x: number; y: number; width: number; height: number }): Promise<ArrayBuffer | null>
  /** 把 PNG 位元組放進剪貼簿（透明底保留） */
  clipboardPng(data: ArrayBuffer): Promise<boolean>
  /** 回報本視窗目前開著的檔案路徑（跨視窗防重複開啟用） */
  reportPaths(list: string[]): void
  /** 別的視窗已開著這個檔案就切過去並回傳 true */
  focusIfOpen(path: string): Promise<boolean>
  voiceRead(docPath: string): Promise<string>
  voiceWrite(docPath: string, json: string): Promise<boolean>
  voiceSave(docPath: string, id: string, data: ArrayBuffer): Promise<boolean>
  voiceLoad(docPath: string, id: string): Promise<ArrayBuffer | null>
  voiceDelete(docPath: string, id: string): Promise<boolean>
  locksRead(docPath: string): Promise<string>
  locksWrite(docPath: string, json: string): Promise<boolean>
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
  /** 把目前視窗的某個區域（CSS px）截圖放進剪貼簿 */
  /** 輪播圖：每張卡片一份完整 HTML，主程序逐張截圖；zip 打包成單檔，png 寫進所選資料夾 */
  exportCards(opts: { name: string; cards: { html: string }[]; width: number; height: number; mode: 'zip' | 'png' }): Promise<{ path: string; count: number; overflow: number[] } | null>
  copyRegionImage(rect: { x: number; y: number; width: number; height: number }): Promise<boolean>
  clipWatch(on: boolean): Promise<boolean>
  onClip(cb: (text: string) => void): () => void
  onMenu(cb: (action: string) => void): () => void
}
