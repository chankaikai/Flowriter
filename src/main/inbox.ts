import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { formatInboxLine } from '../shared/inbox'

/** 依序嘗試：第一個被其他程式（例如輸入法）占用時，退而使用後面的 */
const ACCELS = ['CommandOrControl+Alt+Space', 'CommandOrControl+Shift+Alt+Space', 'CommandOrControl+Alt+J']
const MAX_LEN = 20_000
let win: BrowserWindow | null = null
let current = ''
let queue: Promise<unknown> = Promise.resolve()

export const inboxPath = (): string => join(app.getPath('documents'), 'Flowiter', 'Inbox.md')

function showCapture(): void {
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return
  }
  win = new BrowserWindow({
    width: 460,
    height: 168,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    title: 'Flowiter 收件匣',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, spellcheck: false }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('blur', () => win?.close())
  win.on('closed', () => (win = null))
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}#inbox`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'inbox' })
}

export function setupInbox(): void {
  // 設定會連續觸發（開發模式重複執行、快速點擊）；排成佇列依序處理，避免註冊／解除互相踩到
  ipcMain.handle('inbox:setup', (_e, enabled: boolean) => {
    const job = queue.then((): { ok: boolean; accel: string } => {
      if (current) {
        globalShortcut.unregister(current)
        current = ''
      }
      if (!enabled) return { ok: true, accel: '' }
      for (const a of ACCELS) {
        let ok = false
        try {
          ok = globalShortcut.register(a, showCapture)
        } catch {
          ok = false
        }
        if (ok) {
          current = a
          return { ok: true, accel: a }
        }
      }
      return { ok: false, accel: '' }
    })
    queue = job.catch(() => undefined)
    return job
  })
  ipcMain.handle('inbox:show', () => showCapture())
  ipcMain.handle('inbox:path', () => inboxPath())
  ipcMain.handle('inbox:append', async (_e, text: string) => {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_LEN) return false
    try {
      const f = inboxPath()
      await fs.mkdir(dirname(f), { recursive: true })
      await fs.appendFile(f, formatInboxLine(text), 'utf8')
      return true
    } catch {
      return false
    }
  })
  ipcMain.on('inbox:close', () => win?.close())
  app.on('will-quit', () => globalShortcut.unregisterAll())
}
