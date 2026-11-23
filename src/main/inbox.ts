import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { formatInboxLine } from '../shared/inbox'

const ACCEL = 'CommandOrControl+Alt+Space'
const MAX_LEN = 20_000
let win: BrowserWindow | null = null
let registered = false

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
  ipcMain.handle('inbox:setup', (_e, enabled: boolean) => {
    if (registered) {
      globalShortcut.unregister(ACCEL)
      registered = false
    }
    if (!enabled) return true
    registered = globalShortcut.register(ACCEL, showCapture)
    return registered
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
