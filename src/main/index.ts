import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } from 'electron'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { release, tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import type { DirEntry, FileListItem, MaterialSupport, SearchHit } from '../shared/types'

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
    title: 'Inkwell',
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
            height: 40
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
    if (!dirty || forceClose) return
    e.preventDefault()
    dialog
      .showMessageBox(win, {
        type: 'warning',
        buttons: ['取消', '放棄更改並離開'],
        defaultId: 0,
        cancelId: 0,
        message: '有尚未儲存的更改',
        detail: '離開後這些更改將會遺失。'
      })
      .then((r) => {
        if (r.response === 1) {
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

  ipcMain.handle('history:save', async (_e, p: string, content: string) => {
    try {
      const dir = histDir(p)
      await fs.mkdir(dir, { recursive: true })
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.md')).sort()
      if (names.length) {
        const last = names[names.length - 1]
        const prev = await fs.readFile(join(dir, last), 'utf8')
        if (prev === content) return false
      }
      await fs.writeFile(join(dir, `${Date.now()}.md`), content, 'utf8')
      // 只保留最近 HIST_KEEP 份
      const all = [...names]
      while (all.length >= HIST_KEEP) await fs.unlink(join(dir, all.shift()!)).catch(() => {})
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
        names.map(async (n) => ({ ts: Number(n.slice(0, -3)), size: (await fs.stat(join(dir, n))).size }))
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

  /* ---------- AI 改寫（金鑰只留在本機，請求由主程序直連服務商） ---------- */
  const AI_SYSTEM =
    '你是嚴謹的文字編輯。依指示處理使用者提供的 Markdown 片段，保留原有的 Markdown 語法與連結，只輸出處理後的正文，不要任何解釋、前言或程式碼圍欄。'

  ipcMain.handle(
    'ai:rewrite',
    async (
      _e,
      r: { kind: 'anthropic' | 'openai'; baseUrl: string; apiKey: string; model: string; instruction: string; text: string }
    ) => {
      const user = `${r.instruction}\n\n---\n${r.text}`
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 120_000)
      try {
        if (r.kind === 'anthropic') {
          const res = await fetch(`${r.baseUrl}/v1/messages`, {
            method: 'POST',
            signal: ctl.signal,
            headers: { 'content-type': 'application/json', 'x-api-key': r.apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: r.model, max_tokens: 4096, system: AI_SYSTEM, messages: [{ role: 'user', content: user }] })
          })
          const j = (await res.json()) as { content?: { type: string; text?: string }[]; error?: { message?: string } }
          if (!res.ok) return { error: j.error?.message || `請求失敗（${res.status}）` }
          const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')
          return text ? { text } : { error: '模型沒有回傳內容' }
        }
        const headers: Record<string, string> = { 'content-type': 'application/json' }
        if (r.apiKey) headers.authorization = `Bearer ${r.apiKey}`
        const body: Record<string, unknown> = {
          model: r.model,
          temperature: 0.3,
          messages: [
            { role: 'system', content: AI_SYSTEM },
            { role: 'user', content: user }
          ]
        }
        // 通義千問的開源 Qwen3 系列在非串流請求下必須關閉思考模式
        if (/dashscope/i.test(r.baseUrl)) body.enable_thinking = false
        const res = await fetch(`${r.baseUrl}/chat/completions`, { method: 'POST', signal: ctl.signal, headers, body: JSON.stringify(body) })
        const raw = await res.text()
        let j: { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string } = {}
        try {
          j = JSON.parse(raw)
        } catch {
          return { error: `服務回傳了無法解析的內容（${res.status}）` }
        }
        if (!res.ok) {
          const m = typeof j.error === 'string' ? j.error : j.error?.message
          return { error: m || `請求失敗（${res.status}）` }
        }
        // 部分推理模型會把思考過程包在 <think> 裡，這裡去掉
        const text = (j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        return text ? { text } : { error: '模型沒有回傳內容' }
      } catch (err) {
        const e = err as Error
        return { error: e.name === 'AbortError' ? '請求逾時' : `網路錯誤：${e.message}` }
      } finally {
        clearTimeout(timer)
      }
    }
  )

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
    win.setBackgroundColor(c.color)
    if (!isMac) {
      try {
        win.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: 40 })
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
  ipcMain.on('shell:external', (_e, url: string) => openExternalSafe(url))
  ipcMain.on('shell:reveal', (_e, p: string) => shell.showItemInFolder(p))
}

app.whenReady().then(() => {
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
