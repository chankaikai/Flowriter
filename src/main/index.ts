import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } from 'electron'
import { balanceKind } from '../shared/aiHosts'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { existsSync, promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { release, tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { setupInbox } from './inbox'
import { setupUpdater } from './updater'
import { setupAmbient } from './ambient'
import { runNative, stopNative } from './nativeRun'
import type { DirEntry, FileListItem, MaterialSupport, SearchHit } from '../shared/types'

// 改名 Inkwell → Flowiter：沿用舊的使用者資料夾，設定、歷史版本、加密抽屜才不會「不見」
app.setName('Flowiter')
{
  const legacy = ['inkwell', 'Inkwell'].map((n) => join(app.getPath('appData'), n)).find((p) => existsSync(p))
  if (legacy) app.setPath('userData', legacy)
}

// 自訂協議：讓編輯器能顯示相對路徑的本機圖片（開發模式下 http 頁面無法直接載入 file://）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'inkwell',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
])

const isMac = process.platform === 'darwin'
const MD_RE = /\.(md|markdown|mdown|txt)$/i
const IMG_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif'
}

// 系統級毛玻璃：macOS vibrancy；Windows 11 22H2（build 22621）以上的 acrylic / mica
const winBuild = process.platform === 'win32' ? Number(release().split('.')[2] ?? 0) : 0
const MATERIAL: MaterialSupport = isMac ? 'vibrancy' : winBuild >= 22621 ? 'win' : 'none'

let dirty = false
let forceClose = false
let closing = false
let lastChrome: { color: string; symbolColor: string } | null = null

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 860,
    minHeight: 420,
    show: false,
    title: 'Flowiter',
    icon: join(app.getAppPath(), 'build', 'icon.png'),
    // 支援系統材質時視窗先設為透明，由渲染進程決定要不要鋪實色
    backgroundColor: MATERIAL === 'none' ? '#fbfaf7' : '#00000000',
    titleBarStyle: 'hidden',
    ...(isMac
      ? {
          trafficLightPosition: { x: 18, y: 14 },
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const // 失去焦點時也保持毛玻璃
        }
      : {
          titleBarOverlay: {
            color: MATERIAL === 'none' ? '#fbfaf7' : '#00000000',
            symbolColor: '#26241f',
            height: 34
          },
          ...(MATERIAL === 'win' ? { backgroundMaterial: 'acrylic' as const } : {})
        }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.on('close', (e) => {
    if (forceClose) return
    e.preventDefault()
    if (closing) return
    closing = true
    const done = () => {
      closing = false
    }
    if (!dirty) {
      // 沒有未儲存內容：只確認是否退出
      dialog
        .showMessageBox(win, { type: 'question', buttons: ['退出', '取消'], defaultId: 0, cancelId: 1, message: '要退出 Flowiter 嗎？' })
        .then((r) => {
          done()
          if (r.response === 0) {
            forceClose = true
            win.close()
          }
        })
      return
    }
    dialog
      .showMessageBox(win, {
        type: 'warning',
        buttons: ['儲存', '不儲存', '取消'],
        defaultId: 0,
        cancelId: 2,
        message: '有尚未儲存的更改，要先儲存嗎？',
        detail: '選「不儲存」會捨棄這些更改。'
      })
      .then((r) => {
        done()
        if (r.response === 0) win.webContents.send('menu', 'app.saveAllAndQuit')
        else if (r.response === 1) {
          forceClose = true
          win.close()
        }
      })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      openExternalSafe(url)
    }
  })

  // 開發時把渲染程序的錯誤轉到終端機，方便排查白屏
  if (!app.isPackaged) {
    // Electron 35+ 的事件改成單一事件物件；舊版是位置參數，兩種都接
    win.webContents.on('console-message', (...args: unknown[]) => {
      const first = args[0] as { level?: unknown; message?: string; lineNumber?: number; sourceId?: string } | undefined
      const p =
        first && typeof first.message === 'string'
          ? first
          : { level: args[1], message: String(args[2] ?? ''), lineNumber: args[3] as number, sourceId: args[4] as string }
      if (p.level === 'error' || p.level === 3) {
        console.error(`[renderer] ${p.message}${p.sourceId ? `\n    at ${p.sourceId}:${p.lineNumber}` : ''}`)
      }
    })
    win.webContents.on('preload-error', (_e, path, err) => console.error(`[preload] ${path}\n`, err))
    win.webContents.on('did-fail-load', (_e, code, desc, url) => console.error(`[load] ${code} ${desc} ${url}`))
    win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone]', d.reason))
    if (process.env['INKWELL_DEVTOOLS']) win.webContents.openDevTools({ mode: 'detach' })
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) win.loadURL(devUrl)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

function openExternalSafe(url: string): void {
  if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url)
}

function buildMenu(): void {
  if (!isMac) {
    Menu.setApplicationMenu(null)
    return
  }
  const send = (id: string) => BrowserWindow.getFocusedWindow()?.webContents.send('menu', id)
  // registerAccelerator:false → 快捷鍵事件交給頁面處理，避免選單攔截造成與編輯器衝突
  const item = (label: string, id: string, accelerator?: string) => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => send(id)
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: '檔案',
        submenu: [
          item('新建', 'file.new', 'CmdOrCtrl+N'),
          item('開啟…', 'file.open', 'CmdOrCtrl+O'),
          item('開啟資料夾…', 'file.openFolder', 'CmdOrCtrl+Shift+O'),
          { type: 'separator' },
          item('儲存', 'file.save', 'CmdOrCtrl+S'),
          item('另存為…', 'file.saveAs', 'CmdOrCtrl+Shift+S'),
          { type: 'separator' },
          item('匯出 HTML…', 'export.html'),
          item('匯出 PDF…', 'export.pdf'),
          item('匯出 Word…', 'export.docx'),
          item('匯出 Markdown…', 'export.md')
        ]
      },
      {
        label: '編輯',
        submenu: [
          item('復原', 'edit.undo', 'CmdOrCtrl+Z'),
          item('重做', 'edit.redo', 'CmdOrCtrl+Shift+Z'),
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      { role: 'viewMenu' },
      { label: '視窗', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] }
    ])
  )
}

// ---------- 檔案系統 ----------

async function walk(dir: string, out: string[], limit = 5000): Promise<void> {
  const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of ents) {
    if (out.length >= limit) return
    if (e.name.startsWith('.') || e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out, limit)
    else if (MD_RE.test(e.name)) out.push(p)
  }
}

function registerIpc(): void {
  ipcMain.handle('file:open', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    const p = r.filePaths[0]
    return { path: p, content: stripBom(await fs.readFile(p, 'utf8')) }
  })

  ipcMain.handle('file:read', async (_e, p: string) => {
    try {
      return { path: p, content: stripBom(await fs.readFile(p, 'utf8')) }
    } catch {
      return null
    }
  })

  ipcMain.handle('file:save', async (_e, p: string, content: string) => {
    try {
      await fs.writeFile(p, content, 'utf8')
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('file:saveAs', async (e, suggested: string, content: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, {
      defaultPath: suggested,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    })
    if (r.canceled || !r.filePath) return null
    await fs.writeFile(r.filePath, content, 'utf8')
    return r.filePath
  })

  ipcMain.handle('folder:open', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  ipcMain.handle('dir:read', async (_e, p: string): Promise<DirEntry[]> => {
    const ents = await fs.readdir(p, { withFileTypes: true }).catch(() => [])
    const list: DirEntry[] = []
    for (const e of ents) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue
      if (e.isDirectory()) list.push({ name: e.name, path: join(p, e.name), isDir: true })
      else if (MD_RE.test(e.name)) list.push({ name: e.name, path: join(p, e.name), isDir: false })
    }
    list.sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh-Hant') : a.isDir ? -1 : 1
    )
    return list
  })

  ipcMain.handle('file:stat', async (_e, p: string) => {
    try {
      return (await fs.stat(p)).mtimeMs
    } catch {
      return null
    }
  })

  const safeName = (n: string) => n.trim().replace(/[\\/:*?"<>|]/g, '-')

  ipcMain.handle('file:create', async (_e, dir: string, name: string) => {
    let n = safeName(name)
    if (!n) return null
    if (!extname(n)) n += '.md'
    const p = join(dir, n)
    try {
      await fs.writeFile(p, '', { flag: 'wx' }) // 已存在則失敗，避免覆蓋
      return p
    } catch {
      return null
    }
  })

  ipcMain.handle('path:rename', async (_e, p: string, newName: string) => {
    const n = safeName(newName)
    if (!n) return null
    const target = join(dirname(p), n)
    if (target === p) return p
    try {
      await fs.access(target)
      return null // 目標已存在
    } catch {
      /* 不存在才可改名 */
    }
    try {
      await fs.rename(p, target)
      return target
    } catch {
      return null
    }
  })

  ipcMain.handle('path:trash', async (_e, p: string) => {
    try {
      await shell.trashItem(p)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('folder:listAll', async (_e, root: string): Promise<FileListItem[]> => {
    const files: string[] = []
    await walk(root, files)
    return files.map((p) => ({
      name: basename(p),
      path: p,
      rel: relative(root, p).split(sep).join('/')
    }))
  })

  ipcMain.handle('folder:search', async (_e, root: string, query: string): Promise<SearchHit[]> => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const files: string[] = []
    await walk(root, files, 3000)
    const hits: SearchHit[] = []
    for (const p of files) {
      if (hits.length >= 300) break
      let text: string
      try {
        text = await fs.readFile(p, 'utf8')
      } catch {
        continue
      }
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(q)) {
          hits.push({ path: p, name: basename(p), line: i + 1, text: lines[i].trim().slice(0, 200) })
          if (hits.length >= 300) break
        }
      }
    }
    return hits
  })

  ipcMain.handle('image:save', async (_e, docPath: string, fileName: string, data: ArrayBuffer) => {
    try {
      const dir = join(dirname(docPath), 'assets')
      await fs.mkdir(dir, { recursive: true })
      const ext = extname(fileName) || '.png'
      const stem = basename(fileName, ext).replace(/[\\/:*?"<>|\s]+/g, '-') || 'image'
      let name = `${stem}${ext}`
      for (let i = 1; ; i++) {
        try {
          await fs.access(join(dir, name))
          name = `${stem}-${i}${ext}`
        } catch {
          break
        }
      }
      await fs.writeFile(join(dir, name), Buffer.from(data))
      return `assets/${name}`
    } catch {
      return null
    }
  })

  ipcMain.handle('file:dataUrl', async (_e, p: string) => {
    const mime = IMG_MIME[extname(p).toLowerCase()]
    if (!mime) return null
    try {
      const buf = await fs.readFile(p)
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })

  ipcMain.handle(
    'export:save',
    async (
      e,
      o: { name: string; ext: string; filterName: string; data: Uint8Array | string }
    ) => {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const r = await dialog.showSaveDialog(win, {
        defaultPath: `${o.name}.${o.ext}`,
        filters: [{ name: o.filterName, extensions: [o.ext] }]
      })
      if (r.canceled || !r.filePath) return null
      await fs.writeFile(r.filePath, typeof o.data === 'string' ? o.data : Buffer.from(o.data))
      return r.filePath
    }
  )

  ipcMain.handle('export:pdf', async (e, o: { name: string; html: string }) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `${o.name}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (r.canceled || !r.filePath) return null
    const tmp = join(tmpdir(), `inkwell-${Date.now()}.html`)
    await fs.writeFile(tmp, o.html, 'utf8')
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await w.loadFile(tmp)
      await w.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
      const pdf = await w.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true })
      await fs.writeFile(r.filePath, pdf)
      return r.filePath
    } finally {
      w.destroy()
      fs.unlink(tmp).catch(() => {})
    }
  })

  /* ---------- 版本快照（時光機） ---------- */
  const histDir = (p: string) =>
    join(app.getPath('userData'), 'history', createHash('sha1').update(p).digest('hex').slice(0, 16))
  const HIST_KEEP = 200

  const tagOf = async (dir: string, ts: number): Promise<string | undefined> => {
    try {
      return (await fs.readFile(join(dir, `${ts}.tag`), 'utf8')).trim() || undefined
    } catch {
      return undefined
    }
  }

  const histWrite = async (p: string, content: string, force: boolean): Promise<number | null> => {
    const dir = histDir(p)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'name.txt'), basename(p), 'utf8').catch(() => {})
    const names = (await fs.readdir(dir)).filter((n) => /^\d+\.md$/.test(n)).sort()
    if (names.length) {
      const last = names[names.length - 1]
      const prev = await fs.readFile(join(dir, last), 'utf8')
      if (prev === content) return force ? Number(last.slice(0, -3)) : null
    }
    const ts = Date.now()
    await fs.writeFile(join(dir, `${ts}.md`), content, 'utf8')
    // 只保留最近 HIST_KEEP 份；有標籤的里程碑不會被清掉
    const all = [...names]
    for (let i = 0; all.length >= HIST_KEEP && i < all.length; ) {
      const n = all[i]
      if (await tagOf(dir, Number(n.slice(0, -3)))) {
        i++
        continue
      }
      all.splice(i, 1)
      await fs.unlink(join(dir, n)).catch(() => {})
    }
    return ts
  }

  ipcMain.handle('history:save', async (_e, p: string, content: string) => {
    try {
      return (await histWrite(p, content, false)) != null
    } catch {
      return false
    }
  })

  /** 把目前內容存成有名字的里程碑（內容與最近一版相同時，直接替那一版加標籤）。 */
  ipcMain.handle('history:milestone', async (_e, p: string, content: string, tag: string) => {
    try {
      const ts = await histWrite(p, content, true)
      if (ts == null) return false
      await fs.writeFile(join(histDir(p), `${ts}.tag`), tag.trim().slice(0, 60), 'utf8')
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('history:list', async (_e, p: string) => {
    try {
      const dir = histDir(p)
      const names = (await fs.readdir(dir)).filter((n) => /^\d+\.md$/.test(n)).sort()
      return await Promise.all(
        names.map(async (n) => {
          const ts = Number(n.slice(0, -3))
          return { ts, size: (await fs.stat(join(dir, n))).size, tag: await tagOf(dir, ts) }
        })
      )
    } catch {
      return []
    }
  })

  ipcMain.handle('history:read', async (_e, p: string, ts: number) => {
    try {
      return await fs.readFile(join(histDir(p), `${Math.floor(ts)}.md`), 'utf8')
    } catch {
      return null
    }
  })

  /** 這份文件最近 limit 版的全文（新到舊），供段落回滾 / 垃圾桶 / 章節演進使用。 */
  ipcMain.handle('history:readAll', async (_e, p: string, limit: number) => {
    try {
      const dir = histDir(p)
      const names = (await fs.readdir(dir)).filter((n) => /^\d+\.md$/.test(n)).sort().reverse().slice(0, Math.min(limit, 120))
      return await Promise.all(
        names.map(async (n) => ({ ts: Number(n.slice(0, -3)), md: await fs.readFile(join(dir, n), 'utf8') }))
      )
    } catch {
      return []
    }
  })

  /** 所有文件的快照索引（不含內容），給「那年今天」用。 */
  ipcMain.handle('history:index', async () => {
    try {
      const root = join(app.getPath('userData'), 'history')
      const out: { key: string; name: string; ts: number; size: number }[] = []
      for (const key of await fs.readdir(root)) {
        const dir = join(root, key)
        const name = await fs.readFile(join(dir, 'name.txt'), 'utf8').catch(() => '未命名')
        for (const n of await fs.readdir(dir).catch(() => [] as string[])) {
          if (!/^\d+\.md$/.test(n)) continue
          out.push({ key, name, ts: Number(n.slice(0, -3)), size: (await fs.stat(join(dir, n))).size })
        }
      }
      return out
    } catch {
      return []
    }
  })

  ipcMain.handle('history:readKey', async (_e, key: string, ts: number) => {
    if (!/^[0-9a-f]{16}$/.test(key)) return null
    try {
      return await fs.readFile(join(app.getPath('userData'), 'history', key, `${Math.floor(ts)}.md`), 'utf8')
    } catch {
      return null
    }
  })

  /* ---------- 剪貼簿收集（使用者手動開啟才會輪詢；內容只送到視窗、不落地） ---------- */
  let clipTimer: ReturnType<typeof setInterval> | null = null
  let clipLast = ''
  const clipStop = () => {
    if (clipTimer) clearInterval(clipTimer)
    clipTimer = null
  }
  ipcMain.handle('clip:watch', (e, on: boolean) => {
    clipStop()
    if (!on) return true
    const wc = e.sender
    clipLast = clipboard.readText() // 開啟當下已在剪貼簿的內容不收，避免把舊的機密收進來
    clipTimer = setInterval(() => {
      if (wc.isDestroyed()) return clipStop()
      const t = clipboard.readText()
      if (t && t !== clipLast) {
        clipLast = t
        wc.send('clip', t.slice(0, 20000))
      }
    }, 700)
    return true
  })
  app.on('before-quit', clipStop)

  /* ---------- 時間膠囊（軟鎖：依本機時鐘，到期前不回傳內容） ---------- */
  const capDir = () => join(app.getPath('userData'), 'capsules')
  ipcMain.handle('capsule:create', async (_e, title: string, text: string, unlockAt: number) => {
    try {
      await fs.mkdir(capDir(), { recursive: true })
      const id = `${Date.now()}`
      await fs.writeFile(
        join(capDir(), `${id}.json`),
        JSON.stringify({ id, title: String(title).slice(0, 80), text, createdAt: Date.now(), unlockAt }),
        'utf8'
      )
      return id
    } catch {
      return null
    }
  })
  ipcMain.handle('capsule:list', async () => {
    try {
      const out = []
      for (const n of await fs.readdir(capDir())) {
        if (!/^\d+\.json$/.test(n)) continue
        const o = JSON.parse(await fs.readFile(join(capDir(), n), 'utf8'))
        out.push({ id: o.id, title: o.title, createdAt: o.createdAt, unlockAt: o.unlockAt })
      }
      return out.sort((a, b) => a.unlockAt - b.unlockAt)
    } catch {
      return []
    }
  })
  ipcMain.handle('capsule:open', async (_e, id: string) => {
    if (!/^\d+$/.test(id)) return { ok: false as const }
    try {
      const o = JSON.parse(await fs.readFile(join(capDir(), `${id}.json`), 'utf8'))
      if (Date.now() < o.unlockAt) return { ok: false as const, unlockAt: o.unlockAt as number }
      return { ok: true as const, title: o.title as string, text: o.text as string }
    } catch {
      return { ok: false as const }
    }
  })
  ipcMain.handle('capsule:delete', async (_e, id: string) => {
    if (!/^\d+$/.test(id)) return false
    return fs.unlink(join(capDir(), `${id}.json`)).then(() => true, () => false)
  })

  /* ---------- 加密抽屜（主程序只存取密文；加解密在渲染端用 WebCrypto） ---------- */
  const drawerFile = () => join(app.getPath('userData'), 'drawer.enc')
  ipcMain.handle('drawer:read', async () => fs.readFile(drawerFile(), 'utf8').catch(() => null))
  ipcMain.handle('drawer:write', async (_e, blob: string) => {
    try {
      const tmp = drawerFile() + '.tmp'
      await fs.writeFile(tmp, blob, 'utf8')
      await fs.rename(tmp, drawerFile())
      return true
    } catch {
      return false
    }
  })

  /* ---------- AI 改寫（金鑰只留在本機，請求由主程序直連服務商） ---------- */
  const AI_SYSTEM =
    '你是嚴謹的文字編輯。依指示處理使用者提供的 Markdown 片段，保留原有的 Markdown 語法與連結，只輸出處理後的正文，不要任何解釋、前言或程式碼圍欄。'

  type AiReq = { kind: 'anthropic' | 'openai'; baseUrl: string; apiKey: string; model: string; instruction: string; text: string; maxTokens?: number }
  type AiUsage = { in: number; out: number }

  /** 組出請求網址：容忍結尾斜線，也容忍使用者貼成完整的 /chat/completions 或 /v1/messages。 */
  const aiUrl = (kind: AiReq['kind'], base: string): string => {
    const b = base.trim().replace(/\/+$/, '')
    if (kind === 'anthropic') {
      if (/\/v1\/messages$/.test(b)) return b
      return /\/v1$/.test(b) ? `${b}/messages` : `${b}/v1/messages`
    }
    return /\/chat\/completions$/.test(b) ? b : `${b}/chat/completions`
  }
  const snippet = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, 200)

  /** 呼叫模型。錯誤訊息會帶上實際請求的網址與回應片段（不含金鑰），方便判斷是網址、模型名還是金鑰的問題。 */
  const callAi = async (r: AiReq, maxTokens: number): Promise<{ text: string; usage?: AiUsage } | { error: string; reasoning?: boolean }> => {
    if (!r.baseUrl.trim()) return { error: '還沒有填服務網址（Base URL）' }
    if (!r.model.trim()) return { error: '還沒有填模型名稱' }
    const url = aiUrl(r.kind, r.baseUrl)
    const where = (() => {
      try {
        const u = new URL(url)
        return `${u.host}${u.pathname}`
      } catch {
        return url
      }
    })()
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 120_000)
    const user = r.text ? `${r.instruction}\n\n---\n${r.text}` : r.instruction
    try {
      let res: Response
      if (r.kind === 'anthropic') {
        res = await fetch(url, {
          method: 'POST',
          signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': r.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: r.model, max_tokens: maxTokens, system: AI_SYSTEM, messages: [{ role: 'user', content: user }] })
        })
      } else {
        const headers: Record<string, string> = { 'content-type': 'application/json' }
        if (r.apiKey) headers.authorization = `Bearer ${r.apiKey}`
        const body: Record<string, unknown> = {
          model: r.model,
          temperature: 0.3,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: AI_SYSTEM },
            { role: 'user', content: user }
          ]
        }
        // 通義千問的開源 Qwen3 系列在非串流請求下必須關閉思考模式
        if (/dashscope/i.test(r.baseUrl)) body.enable_thinking = false
        res = await fetch(url, { method: 'POST', signal: ctl.signal, headers, body: JSON.stringify(body) })
      }
      const raw = await res.text()
      let j: any = null
      try {
        j = JSON.parse(raw)
      } catch {
        /* 不是 JSON，下面用片段回報 */
      }
      if (!res.ok || !j) {
        const msg = j && (typeof j.error === 'string' ? j.error : j.error?.message || j.message || j.header?.message)
        const hint =
          res.status === 404 ? '（網址或路徑不對：確認 Base URL 與服務商文件一致）'
          : res.status === 401 || res.status === 403 ? '（金鑰無效或沒有權限）'
          : res.status === 429 ? '（請求太頻繁或額度用完）'
          : ''
        return { error: `${res.status} ${where}${hint}${msg ? ` — ${msg}` : !j ? ` — 回應不是 JSON：${snippet(raw)}` : ''}` }
      }
      // 部分服務用 HTTP 200 + code != 0 回報錯誤（例如訊飛的 header.code）
      if (typeof j.code === 'number' && j.code !== 0) return { error: `${where} — ${j.message || `錯誤碼 ${j.code}`}` }
      let text = ''
      if (r.kind === 'anthropic') {
        text = (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      } else {
        text = j.choices?.[0]?.message?.content ?? ''
      }
      // 部分推理模型會把思考過程包在 <think> 裡，這裡去掉
      text = String(text).replace(/<think>[\s\S]*?<\/think>/g, '').trim()
      const u = j.usage
      const usage: AiUsage | undefined = u
        ? { in: Number(u.prompt_tokens ?? u.input_tokens ?? 0), out: Number(u.completion_tokens ?? u.output_tokens ?? 0) }
        : undefined
      if (text) return { text, usage }
      // 推理模型把額度全花在思考上（content 空、reasoning_content 有字、finish_reason=length）
      const ch = j.choices?.[0]
      if (ch?.message?.reasoning_content || ch?.finish_reason === 'length') {
        return { error: `${where} — 模型把回覆額度都用在思考上，沒有輸出正文。請換成非推理（non-thinking）的模型，或關閉該模型的思考模式。`, reasoning: true }
      }
      return { error: `${where} — 模型沒有回傳內容：${snippet(raw)}` }
    } catch (err) {
      const e = err as Error
      return { error: e.name === 'AbortError' ? '請求逾時（120 秒）' : `網路錯誤：${e.message}（${where}）` }
    } finally {
      clearTimeout(timer)
    }
  }

  ipcMain.handle('ai:rewrite', (_e, r: AiReq) => callAi(r, Math.max(256, Math.min(32768, Math.floor(r.maxTokens || 4096)))))

  /** 查詢帳戶餘額。只有少數服務商有公開介面；其餘回報 unsupported，由介面引導到控制台。 */
  ipcMain.handle('ai:balance', async (_e, r: { baseUrl: string; apiKey: string }) => {
    const kind = balanceKind(r.baseUrl)
    if (!kind) return { ok: false as const, unsupported: true as const }
    if (!r.apiKey) return { ok: false as const, error: '請先填入 API 金鑰' }
    const origin = new URL(r.baseUrl).origin
    const url =
      kind === 'deepseek' ? 'https://api.deepseek.com/user/balance'
      : kind === 'moonshot' ? `${origin}/v1/users/me/balance`
      : kind === 'siliconflow' ? `${origin}/v1/user/info`
      : 'https://openrouter.ai/api/v1/credits'
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 15_000)
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { authorization: `Bearer ${r.apiKey}` } })
      const raw = await res.text()
      let j: any = null
      try {
        j = JSON.parse(raw)
      } catch {
        /* 下面回報 */
      }
      if (!res.ok || !j) {
        return { ok: false as const, error: `${res.status} ${new URL(url).host} — ${raw.replace(/\s+/g, ' ').slice(0, 160)}` }
      }
      const lines: string[] = []
      if (kind === 'deepseek') {
        for (const b of j.balance_infos || []) {
          lines.push(`${b.currency} 餘額 ${b.total_balance}（儲值 ${b.topped_up_balance}，贈送 ${b.granted_balance}）`)
        }
        if (j.is_available === false) lines.push('目前餘額不足，無法呼叫')
      } else if (kind === 'moonshot') {
        const d = j.data || {}
        lines.push(`可用餘額 ${d.available_balance}（現金 ${d.cash_balance}，代金券 ${d.voucher_balance}）`)
      } else if (kind === 'siliconflow') {
        const d = j.data || {}
        lines.push(`總餘額 ${d.totalBalance}（贈送 ${d.balance}，儲值 ${d.chargeBalance}）`)
      } else {
        const d = j.data || {}
        const total = Number(d.total_credits)
        const used = Number(d.total_usage)
        lines.push(`已購點數 ${total}，已用 ${used}，剩餘 ${Math.round((total - used) * 10000) / 10000}（美元）`)
      }
      return lines.length ? { ok: true as const, lines } : { ok: false as const, error: '服務沒有回傳餘額資料' }
    } catch (err) {
      const e = err as Error
      return { ok: false as const, error: e.name === 'AbortError' ? '查詢逾時' : `網路錯誤：${e.message}` }
    } finally {
      clearTimeout(timer)
    }
  })

  /** 測試連線：送一個極短的請求，回報耗時與模型的回覆。 */
  ipcMain.handle('ai:test', async (_e, r: AiReq) => {
    const t0 = Date.now()
    const out = await callAi({ ...r, instruction: '請只回覆「OK」兩個字母。', text: '' }, 1024)
    const ms = Date.now() - t0
    // 推理模型能連上、也有回應，只是正文被思考吃掉：連線本身算成功，但要提醒
    if ('error' in out && out.reasoning) return { ok: true as const, reply: '（這是推理模型，思考過程很長；改寫時建議換非推理版本）', ms }
    return 'error' in out ? { ok: false as const, error: out.error, ms } : { ok: true as const, reply: out.text.slice(0, 40), ms }
  })

  /* ---------- 長圖匯出 ---------- */
  ipcMain.handle('export:image', async (e, o: { name: string; html: string; width: number }) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `${o.name}.png`,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    if (r.canceled || !r.filePath) return null
    const tmp = join(tmpdir(), `inkwell-img-${Date.now()}.html`)
    await fs.writeFile(tmp, o.html, 'utf8')
    const w = new BrowserWindow({
      show: false,
      width: o.width,
      height: 800,
      webPreferences: { sandbox: true, offscreen: false, zoomFactor: 1 }
    })
    try {
      await w.loadFile(tmp)
      await w.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
      const h: number = await w.webContents.executeJavaScript('Math.ceil(document.documentElement.scrollHeight)')
      // 超長文章會被 GPU 紋理上限截斷，這裡限制在 16000 像素
      w.setContentSize(o.width, Math.min(h, 16000))
      await new Promise((res) => setTimeout(res, 350))
      const img = await w.webContents.capturePage()
      await fs.writeFile(r.filePath, img.toPNG())
      return r.filePath
    } finally {
      w.destroy()
      fs.unlink(tmp).catch(() => {})
    }
  })

  ipcMain.handle('app:launchFile', async () => {
    const args = process.argv.slice(app.isPackaged ? 1 : 2)
    for (const a of args) {
      if (a.startsWith('-') || !MD_RE.test(a)) continue
      try {
        await fs.access(a)
        return a
      } catch {
        /* ignore */
      }
    }
    return null
  })

  ipcMain.on('doc:dirty', (_e, d: boolean) => {
    dirty = !!d
  })

  let stickyPrev: { bounds: Electron.Rectangle; min: number[]; max: boolean } | null = null
  ipcMain.handle('window:sticky', (e, on: boolean) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (on && !stickyPrev) {
      stickyPrev = { bounds: w.getBounds(), min: w.getMinimumSize(), max: w.isMaximized() }
      if (stickyPrev.max) w.unmaximize()
      w.setMinimumSize(300, 180)
      const b = w.getBounds()
      // 縮到右上角附近，不擋住主要內容
      w.setBounds({ x: b.x + Math.max(0, b.width - 420), y: b.y, width: 400, height: 560 }, true)
      w.setAlwaysOnTop(true, 'floating')
    } else if (!on && stickyPrev) {
      w.setAlwaysOnTop(false)
      w.setMinimumSize(stickyPrev.min[0], stickyPrev.min[1])
      w.setBounds(stickyPrev.bounds, true)
      if (stickyPrev.max) w.maximize()
      stickyPrev = null
    }
  })

  ipcMain.handle('window:materialSupport', () => MATERIAL)

  ipcMain.on('window:setMaterial', (e, o: { enabled: boolean; kind: 'acrylic' | 'mica' }) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    try {
      if (MATERIAL === 'vibrancy') win.setVibrancy(o.enabled ? 'under-window' : null)
      else if (MATERIAL === 'win') win.setBackgroundMaterial(o.enabled ? o.kind : 'none')
    } catch {
      /* 舊版系統不支援時忽略 */
    }
  })

  ipcMain.on(
    'chrome:set',
    (
      e,
      c: { color: string; symbolColor: string; themeSource?: 'system' | 'light' | 'dark' }
    ) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    // 讓系統材質的明暗與 App 主題一致（跟隨系統時還原為 system）
    if (c.themeSource) nativeTheme.themeSource = c.themeSource
    lastChrome = { color: c.color, symbolColor: c.symbolColor }
    win.setBackgroundColor(c.color)
    if (!isMac) {
      try {
        win.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: 34 })
      } catch {
        /* 部分平台不支援 */
      }
    }
    }
  )

  ipcMain.on('win:fullscreen', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    win?.setFullScreen(!win.isFullScreen())
  })
  // 頁邊便條：存在文件旁的 .inkwell/notes.json，不碰 .md 本身
  const notesFile = (p: string) => join(dirname(p), '.inkwell', 'notes.json')
  ipcMain.handle('notes:read', async (_e, p: string) => {
    try {
      return await fs.readFile(notesFile(p), 'utf8')
    } catch {
      return ''
    }
  })
  ipcMain.handle('notes:write', async (_e, p: string, json: string) => {
    if (typeof json !== 'string' || json.length > 2_000_000) return false
    try {
      const f = notesFile(p)
      await fs.mkdir(dirname(f), { recursive: true })
      await fs.writeFile(f, json, 'utf8')
      return true
    } catch {
      return false
    }
  })
  // 參考資料抽屜：同樣放在文件旁的 .inkwell/refs.json
  const refsFile = (p: string) => join(dirname(p), '.inkwell', 'refs.json')
  ipcMain.handle('refs:read', async (_e, p: string) => {
    try {
      return await fs.readFile(refsFile(p), 'utf8')
    } catch {
      return ''
    }
  })
  ipcMain.handle('refs:write', async (_e, p: string, json: string) => {
    if (typeof json !== 'string' || json.length > 4_000_000) return false
    try {
      const f = refsFile(p)
      await fs.mkdir(dirname(f), { recursive: true })
      await fs.writeFile(f, json, 'utf8')
      return true
    } catch {
      return false
    }
  })
  // 段落上鎖清單：.inkwell/locks.json
  const locksFile = (p: string) => join(dirname(p), '.inkwell', 'locks.json')
  ipcMain.handle('locks:read', async (_e, p: string) => {
    try {
      return await fs.readFile(locksFile(p), 'utf8')
    } catch {
      return ''
    }
  })
  ipcMain.handle('locks:write', async (_e, p: string, json: string) => {
    if (typeof json !== 'string' || json.length > 2_000_000) return false
    try {
      const f = locksFile(p)
      await fs.mkdir(dirname(f), { recursive: true })
      await fs.writeFile(f, json, 'utf8')
      return true
    } catch {
      return false
    }
  })
  ipcMain.on('win:edit', (e, role: string) => {
    const w = e.sender
    if (role === 'cut') w.cut()
    else if (role === 'copy') w.copy()
    else if (role === 'paste') w.paste()
    else if (role === 'selectAll') w.selectAll()
  })
  ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  // 用主程序的原生對話框取代 window.confirm：Electron 的 window.confirm 關閉後常讓輸入框失去焦點、無法編輯
  ipcMain.handle('dialog:confirm', async (e, o: { message: string; detail?: string; ok?: string; cancel?: string }) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    const opts = { type: 'question' as const, buttons: [String(o.ok || '確定'), String(o.cancel || '取消')], defaultId: 0, cancelId: 1, message: String(o.message ?? '').slice(0, 400), detail: o.detail ? String(o.detail).slice(0, 1600) : undefined }
    const r = w ? await dialog.showMessageBox(w, opts) : await dialog.showMessageBox(opts)
    w?.webContents.focus()
    return r.response === 0
  })
  ipcMain.handle('native:run', (_e, req) => runNative(req))
  ipcMain.on('native:stop', (_e, id: string) => stopNative(String(id)))
  ipcMain.on('win:splash', (e, on: boolean) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    w.setMinimizable(!on)
    w.setClosable(!on)
    if (isMac) w.setWindowButtonVisibility(!on)
    else {
      try {
        // 歡迎畫面期間把視窗按鈕畫成透明；結束後還原成目前主題的顏色
        w.setTitleBarOverlay(on ? { color: '#00000000', symbolColor: '#00000000', height: 34 } : { color: lastChrome?.color ?? '#00000000', symbolColor: lastChrome?.symbolColor ?? '#26241f', height: 34 })
      } catch {
        /* 部分平台不支援 */
      }
    }
  })
  ipcMain.on('win:forceClose', (e) => {
    forceClose = true
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.on('shell:external', (_e, url: string) => openExternalSafe(url))
  ipcMain.on('shell:reveal', (_e, p: string) => shell.showItemInFolder(p))
}

app.whenReady().then(() => {
  setupInbox()
  setupAmbient()
  setupUpdater(() => {
    // 有未儲存內容時先確認，避免重啟更新把更改丟掉
    if (dirty) {
      const w = BrowserWindow.getAllWindows()[0]
      const r = dialog.showMessageBoxSync(w, { type: 'warning', buttons: ['取消（我先儲存）', '不儲存並更新'], defaultId: 0, cancelId: 0, message: '有尚未儲存的更改', detail: '重啟更新會捨棄這些更改。' })
      if (r !== 1) return false
    }
    forceClose = true // 略過關閉視窗時的詢問，交給安裝程式收尾
    return true
  })
  protocol.handle('inkwell', (req) => {
    try {
      const u = new URL(req.url)
      const p = decodeURIComponent(u.pathname.slice(1))
      if (!IMG_MIME[extname(p).toLowerCase()]) return new Response('Forbidden', { status: 403 })
      return net.fetch(pathToFileURL(p).toString())
    } catch {
      return new Response('Bad Request', { status: 400 })
    }
  })
  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
