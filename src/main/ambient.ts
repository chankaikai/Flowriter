import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { extname, join } from 'node:path'
import { existsSync, promises as fs } from 'node:fs'

/** 氛圍音的真實錄音檔：先找使用者匯入的，再找隨程式附帶的 resources/ambient。 */
export const AMBIENT_KINDS = ['rain', 'ocean', 'wind', 'fire', 'cafe', 'fan', 'night', 'forest', 'stream', 'white', 'pink', 'brown']
const EXTS = ['.ogg', '.mp3', '.wav', '.m4a', '.flac', '.opus']
const MAX_BYTES = 60 * 1024 * 1024

const userDir = () => join(app.getPath('userData'), 'ambient')
const bundledDir = () => (app.isPackaged ? join(process.resourcesPath, 'ambient') : join(app.getAppPath(), 'resources', 'ambient'))

async function find(kind: string): Promise<{ path: string; source: 'user' | 'bundled' } | null> {
  if (!AMBIENT_KINDS.includes(kind)) return null
  for (const [dir, source] of [[userDir(), 'user'], [bundledDir(), 'bundled']] as const) {
    for (const e of EXTS) {
      const p = join(dir, kind + e)
      if (existsSync(p)) return { path: p, source }
    }
  }
  return null
}

export function setupAmbient(): void {
  ipcMain.handle('ambient:list', async () => {
    const out: Record<string, 'user' | 'bundled'> = {}
    for (const k of AMBIENT_KINDS) {
      const f = await find(k)
      if (f) out[k] = f.source
    }
    return out
  })
  ipcMain.handle('ambient:read', async (_e, kind: string) => {
    const f = await find(kind)
    if (!f) return null
    const st = await fs.stat(f.path)
    if (st.size > MAX_BYTES) return null
    const buf = await fs.readFile(f.path)
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  })
  ipcMain.handle('ambient:import', async (e, kind: string) => {
    if (!AMBIENT_KINDS.includes(kind)) return false
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showOpenDialog(win!, { title: '選擇錄音檔（建議可無縫循環的 ogg / mp3 / wav）', properties: ['openFile'], filters: [{ name: '音訊', extensions: EXTS.map((x) => x.slice(1)) }] })
    if (r.canceled || !r.filePaths[0]) return false
    const src = r.filePaths[0]
    const ext = extname(src).toLowerCase()
    if (!EXTS.includes(ext)) return false
    if ((await fs.stat(src)).size > MAX_BYTES) return false
    await fs.mkdir(userDir(), { recursive: true })
    for (const x of EXTS) await fs.rm(join(userDir(), kind + x), { force: true })
    await fs.copyFile(src, join(userDir(), kind + ext))
    return true
  })
  ipcMain.handle('ambient:remove', async (_e, kind: string) => {
    if (!AMBIENT_KINDS.includes(kind)) return false
    for (const x of EXTS) await fs.rm(join(userDir(), kind + x), { force: true })
    return true
  })
}
