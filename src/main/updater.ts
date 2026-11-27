import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/update'

/**
 * 自動更新：從 GitHub Releases 檢查新版。
 * - 只有打包後的版本才會檢查（npm run dev 不會）。
 * - 不會自己下載：發現新版會先提示，使用者按「立即更新」才下載，下載完再按「重啟並安裝」。
 * - 背景檢查失敗（沒網路等）不打擾使用者；手動檢查失敗才會顯示原因。
 */
let status: UpdateStatus = { state: 'idle' }
let manual = false
let timer: NodeJS.Timeout | null = null

function push(s: UpdateStatus): void {
  status = s
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('update:status', s)
}

/** beforeInstall：安裝前的檢查（例如有未儲存內容）；回傳 false 就取消這次重啟安裝 */
export function setupUpdater(beforeInstall: () => boolean): void {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:status', () => status)

  if (!app.isPackaged) {
    status = { state: 'dev', message: '開發模式不檢查更新' }
    ipcMain.handle('update:check', () => status)
    ipcMain.handle('update:download', () => status)
    ipcMain.on('update:install', () => undefined)
    return
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => push({ state: 'checking' }))
  const notesOf = (info: { releaseNotes?: unknown }): string | undefined => {
    const n = info.releaseNotes
    const raw = typeof n === 'string' ? n : Array.isArray(n) ? n.map((x) => (x && typeof x === 'object' ? String((x as { note?: unknown }).note ?? '') : '')).join('\n') : ''
    const t = raw.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, 1500)
    return t || undefined
  }
  autoUpdater.on('update-available', (info) => push({ state: 'available', version: info.version, notes: notesOf(info) }))
  autoUpdater.on('update-not-available', () => push({ state: 'none' }))
  autoUpdater.on('download-progress', (p) => push({ state: 'downloading', percent: Math.round(p.percent), version: status.version }))
  autoUpdater.on('update-downloaded', (info) => push({ state: 'downloaded', version: info.version, notes: notesOf(info) }))
  autoUpdater.on('error', (e) => {
    // 背景檢查的錯誤只記錄，手動檢查或下載中才顯示
    if (manual || status.state === 'downloading') push({ state: 'error', message: String(e?.message ?? e).split('\n')[0].slice(0, 160) })
    else push({ state: 'idle' })
  })

  const check = (isManual: boolean): UpdateStatus => {
    manual = isManual
    if (status.state === 'checking' || status.state === 'downloading') return status
    autoUpdater.checkForUpdates().catch(() => undefined)
    return status
  }
  ipcMain.handle('update:check', () => check(true))
  ipcMain.handle('update:download', () => {
    if (status.state === 'available') {
      push({ state: 'downloading', percent: 0, version: status.version })
      autoUpdater.downloadUpdate().catch(() => undefined)
    }
    return status
  })
  ipcMain.on('update:install', () => {
    if (status.state === 'downloaded' && beforeInstall()) autoUpdater.quitAndInstall(false, true)
  })

  // 啟動 10 秒後檢查一次，之後每 6 小時一次
  setTimeout(() => check(false), 10_000)
  timer = setInterval(() => check(false), 6 * 60 * 60 * 1000)
  app.on('before-quit', () => {
    if (timer) clearInterval(timer)
  })
}
