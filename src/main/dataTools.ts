/**
 * 使用者資料備份／還原與清除快取。
 * - 備份：把使用者資料夾裡的歷史版本、時間膠囊、加密抽屜、環境音檔，以及前端傳來的設定（localStorage 內容）打包成一個檔。
 * - 還原：寫回使用者資料夾，並把設定交還前端。重裝程式後用得到。
 * - 清除快取：只動 Chromium 的快取目錄，永遠不碰文件、歷史版本、設定與音檔。
 */
import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { basename, join, relative, resolve, sep } from 'node:path'
import { promises as fs } from 'node:fs'

const MAX_BYTES = 400 * 1024 * 1024
const DIRS = ['history', 'capsules', 'ambient-user', 'ambient']
const FILES = ['drawer.enc']
const CACHE_DIRS = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'GrShaderCache', 'ShaderCache', 'Service Worker/CacheStorage']

async function walk(dir: string, base: string, out: { rel: string; abs: string; size: number }[]): Promise<void> {
  let names: string[] = []
  try { names = await fs.readdir(dir) } catch { return }
  for (const n of names) {
    const abs = join(dir, n)
    const st = await fs.stat(abs).catch(() => null)
    if (!st) continue
    if (st.isDirectory()) await walk(abs, base, out)
    else out.push({ rel: relative(base, abs).split(sep).join('/'), abs, size: st.size })
  }
}

async function dirSize(dir: string): Promise<number> {
  const list: { rel: string; abs: string; size: number }[] = []
  await walk(dir, dir, list)
  return list.reduce((a, b) => a + b.size, 0)
}

export function setupDataTools(): void {
  const ud = () => app.getPath('userData')

  ipcMain.handle('data:backup', async (e, local: Record<string, string>) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const stamp = new Date().toISOString().slice(0, 10)
    const r = await dialog.showSaveDialog(win, {
      title: '備份使用者資料',
      defaultPath: `Flowriter-backup-${stamp}.flowbak`,
      filters: [{ name: 'Flowriter 備份', extensions: ['flowbak'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false as const, reason: 'cancel' }
    try {
      const list: { rel: string; abs: string; size: number }[] = []
      for (const d of DIRS) await walk(join(ud(), d), ud(), list)
      for (const f of FILES) {
        const abs = join(ud(), f)
        const st = await fs.stat(abs).catch(() => null)
        if (st?.isFile()) list.push({ rel: f, abs, size: st.size })
      }
      const total = list.reduce((a, b) => a + b.size, 0)
      if (total > MAX_BYTES) return { ok: false as const, reason: `資料超過 ${Math.round(MAX_BYTES / 1048576)} MB，無法打包` }
      const files: { p: string; b: string }[] = []
      for (const f of list) files.push({ p: f.rel, b: (await fs.readFile(f.abs)).toString('base64') })
      const bundle = { app: 'Flowriter', format: 1, createdAt: Date.now(), local, files }
      await fs.writeFile(r.filePath, JSON.stringify(bundle), 'utf8')
      return { ok: true as const, path: r.filePath, count: files.length, bytes: total }
    } catch (err) {
      return { ok: false as const, reason: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('data:restore', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, {
      title: '匯入備份',
      properties: ['openFile'],
      filters: [{ name: 'Flowriter 備份', extensions: ['flowbak'] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false as const, reason: 'cancel' }
    try {
      const bundle = JSON.parse(await fs.readFile(r.filePaths[0], 'utf8')) as {
        app?: string; format?: number; local?: Record<string, string>; files?: { p: string; b: string }[]
      }
      if (bundle.app !== 'Flowriter' || bundle.format !== 1 || !Array.isArray(bundle.files)) {
        return { ok: false as const, reason: '這不是 Flowriter 的備份檔' }
      }
      const root = resolve(ud())
      let n = 0
      for (const f of bundle.files) {
        const dest = resolve(root, f.p)
        // 防路徑穿越：備份檔裡的路徑只能落在使用者資料夾內，且只接受我們自己會備份的位置
        const top = f.p.split('/')[0]
        if (!dest.startsWith(root + sep) || !(DIRS.includes(top) || FILES.includes(f.p))) continue
        await fs.mkdir(join(dest, '..'), { recursive: true })
        await fs.writeFile(dest, Buffer.from(f.b, 'base64'))
        n++
      }
      return { ok: true as const, count: n, local: bundle.local ?? {}, name: basename(r.filePaths[0]) }
    } catch (err) {
      return { ok: false as const, reason: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('cache:size', async () => {
    let total = 0
    for (const d of CACHE_DIRS) total += await dirSize(join(ud(), d))
    return total
  })

  ipcMain.handle('cache:clear', async () => {
    try {
      const before = await Promise.all(CACHE_DIRS.map((d) => dirSize(join(ud(), d)))).then((a) => a.reduce((x, y) => x + y, 0))
      await session.defaultSession.clearCache()
      await session.defaultSession.clearCodeCaches({})
      // 只清快取類儲存；localStorage、IndexedDB、Cookie 一律保留（設定與接續位置都在裡面）
      await session.defaultSession.clearStorageData({ storages: ['cachestorage', 'serviceworkers', 'shadercache'] })
      const after = await Promise.all(CACHE_DIRS.map((d) => dirSize(join(ud(), d)))).then((a) => a.reduce((x, y) => x + y, 0))
      return { ok: true as const, freed: Math.max(0, before - after), before }
    } catch (err) {
      return { ok: false as const, freed: 0, before: 0, reason: err instanceof Error ? err.message : String(err) }
    }
  })
}
