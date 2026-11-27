import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { existsSync, promises as fs } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { type MusicLibState, type MusicPlaylist, type MusicTrack } from '../shared/types'

/**
 * 音樂庫：音訊檔放在「音樂庫資料夾」，所有播放清單共用同一份索引（library.json）。
 * 預設資料夾在使用者資料目錄（程式更新不會動它）；可改成任何資料夾。
 * 本程式只複製、掃描、讀取，絕不刪除或改動使用者的音訊檔；「移除」只是從索引拿掉。
 */
export const MUSIC_EXTS = ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus', '.aac', '.wma', '.webm']
const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
const MAX_BYTES = 200 * 1024 * 1024
const cfgPath = () => join(app.getPath('userData'), 'music-config.json')
const defaultDir = () => join(app.getPath('userData'), 'music')

interface Index { version: 1; tracks: MusicTrack[]; playlists: MusicPlaylist[] }
const emptyIndex = (): Index => ({ version: 1, tracks: [], playlists: [] })
const newId = () => randomBytes(6).toString('hex')

async function libDir(): Promise<string> {
  try {
    const j = JSON.parse(await fs.readFile(cfgPath(), 'utf8'))
    if (typeof j.dir === 'string' && j.dir) return j.dir
  } catch {
    /* 沒設定過 */
  }
  return defaultDir()
}

async function loadIndex(dir: string): Promise<Index> {
  try {
    const j = JSON.parse(await fs.readFile(join(dir, 'library.json'), 'utf8'))
    if (j && Array.isArray(j.tracks) && Array.isArray(j.playlists)) return { version: 1, tracks: j.tracks, playlists: j.playlists }
  } catch {
    /* 還沒有索引，或壞了：從空的開始（音訊檔本身不受影響，可再「掃描」找回） */
  }
  return emptyIndex()
}

async function saveIndex(dir: string, idx: Index): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const tmp = join(dir, `library.json.${process.pid}.tmp`)
  await fs.writeFile(tmp, JSON.stringify(idx, null, 2), 'utf8')
  await fs.rename(tmp, join(dir, 'library.json'))
}

const titleOf = (file: string) => basename(file, extname(file)).replace(/[_]+/g, ' ').trim() || file

async function state(dir: string, idx: Index): Promise<MusicLibState> {
  const tracks = idx.tracks.map((t) => ({ ...t, missing: !existsSync(join(dir, t.file)) }))
  return { dir, isDefault: dir === defaultDir(), tracks, playlists: idx.playlists }
}

/** 路徑必須留在音樂庫資料夾內（索引檔可能被手改或同步工具弄壞） */
const inside = (dir: string, rel: string): string | null => {
  const p = resolve(dir, rel)
  return p === resolve(dir) || p.startsWith(resolve(dir) + sep) ? p : null
}

async function walk(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 6 || out.length > 20000) return
  let ents
  try {
    ents = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of ents) {
    if (e.name.startsWith('.') || e.name === 'covers') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out, depth + 1)
    else if (MUSIC_EXTS.includes(extname(e.name).toLowerCase())) out.push(p)
  }
}

export function setupMusicLib(): void {
  ipcMain.handle('music:state', async () => {
    const dir = await libDir()
    return state(dir, await loadIndex(dir))
  })

  ipcMain.handle('music:setDir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showOpenDialog(win!, { title: '選擇音樂庫資料夾', properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    const dir = r.filePaths[0]
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(cfgPath(), JSON.stringify({ dir }), 'utf8')
    return state(dir, await loadIndex(dir))
  })

  ipcMain.handle('music:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showOpenDialog(win!, { title: '匯入音樂', properties: ['openFile', 'multiSelect'], filters: [{ name: '音訊', extensions: MUSIC_EXTS.map((x) => x.slice(1)) }] })
    if (r.canceled || !r.filePaths.length) return null
    const dir = await libDir()
    const idx = await loadIndex(dir)
    const audio = join(dir, 'audio')
    await fs.mkdir(audio, { recursive: true })
    for (const src of r.filePaths) {
      if (!MUSIC_EXTS.includes(extname(src).toLowerCase())) continue
      let name = basename(src)
      // 已經在音樂庫裡就直接登記，不重複複製；同名不同檔則改名，絕不覆蓋
      const rel0 = inside(dir, relative(dir, src))
      let rel: string
      if (rel0 && !relative(dir, src).startsWith('..')) rel = relative(dir, src)
      else {
        const stem = basename(name, extname(name))
        let n = 1
        while (existsSync(join(audio, name))) name = `${stem} (${++n})${extname(src)}`
        await fs.copyFile(src, join(audio, name))
        rel = join('audio', name)
      }
      if (!idx.tracks.some((t) => t.file === rel)) idx.tracks.push({ id: newId(), file: rel, title: titleOf(rel), added: Date.now() })
    }
    await saveIndex(dir, idx)
    return state(dir, idx)
  })

  /** 掃描音樂庫資料夾：新檔加入索引，已不存在的檔從索引拿掉（播放清單同步清理） */
  ipcMain.handle('music:scan', async () => {
    const dir = await libDir()
    const idx = await loadIndex(dir)
    const found: string[] = []
    await walk(dir, found)
    const rels = new Set(found.map((p) => relative(dir, p)))
    let added = 0
    for (const rel of rels) {
      if (!idx.tracks.some((t) => t.file === rel)) {
        idx.tracks.push({ id: newId(), file: rel, title: titleOf(rel), added: Date.now() })
        added++
      }
    }
    const gone = idx.tracks.filter((t) => !rels.has(t.file))
    const goneIds = new Set(gone.map((t) => t.id))
    idx.tracks = idx.tracks.filter((t) => !goneIds.has(t.id))
    for (const p of idx.playlists) p.trackIds = p.trackIds.filter((id) => !goneIds.has(id))
    await saveIndex(dir, idx)
    return { ...(await state(dir, idx)), added, removed: gone.length }
  })

  ipcMain.handle('music:read', async (_e, id: string) => {
    const dir = await libDir()
    const idx = await loadIndex(dir)
    const t = idx.tracks.find((x) => x.id === id)
    const p = t && inside(dir, t.file)
    if (!p || !existsSync(p)) return null
    if ((await fs.stat(p)).size > MAX_BYTES) return null
    const buf = await fs.readFile(p)
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  })

  ipcMain.handle('music:savePlaylists', async (_e, playlists: MusicPlaylist[]) => {
    const dir = await libDir()
    const idx = await loadIndex(dir)
    const ids = new Set(idx.tracks.map((t) => t.id))
    idx.playlists = (Array.isArray(playlists) ? playlists : []).slice(0, 200).map((p) => ({
      id: String(p.id || newId()).slice(0, 32),
      name: String(p.name || '未命名').slice(0, 60),
      icon: String(p.icon || '♪').slice(0, 8),
      cover: p.cover && inside(dir, p.cover) ? p.cover : undefined,
      trackIds: (Array.isArray(p.trackIds) ? p.trackIds : []).filter((x) => ids.has(x))
    }))
    await saveIndex(dir, idx)
    return state(dir, idx)
  })

  ipcMain.handle('music:removeTrack', async (_e, id: string) => {
    const dir = await libDir()
    const idx = await loadIndex(dir)
    idx.tracks = idx.tracks.filter((t) => t.id !== id) // 只動索引，不刪檔案
    for (const p of idx.playlists) p.trackIds = p.trackIds.filter((x) => x !== id)
    await saveIndex(dir, idx)
    return state(dir, idx)
  })

  ipcMain.handle('music:cover', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showOpenDialog(win!, { title: '選擇封面圖片', properties: ['openFile'], filters: [{ name: '圖片', extensions: IMG_EXTS.map((x) => x.slice(1)) }] })
    if (r.canceled || !r.filePaths[0]) return null
    const src = r.filePaths[0]
    const ext = extname(src).toLowerCase()
    if (!IMG_EXTS.includes(ext) || (await fs.stat(src)).size > 8 * 1024 * 1024) return null
    const dir = await libDir()
    await fs.mkdir(join(dir, 'covers'), { recursive: true })
    const rel = join('covers', `${newId()}${ext}`)
    await fs.copyFile(src, join(dir, rel))
    return rel
  })

  ipcMain.handle('music:coverData', async (_e, rel: string) => {
    const dir = await libDir()
    const p = inside(dir, String(rel))
    if (!p || !IMG_EXTS.includes(extname(p).toLowerCase()) || !existsSync(p)) return null
    const buf = await fs.readFile(p)
    const ext = extname(p).toLowerCase().slice(1)
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`
  })
}
