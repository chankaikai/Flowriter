import { ipcMain } from 'electron'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { buildGraph, type LinkGraph } from '../shared/linkGraph'

const SKIP = new Set(['node_modules', '.git', 'assets', '.obsidian', '.trash'])
const MD = /\.(md|markdown|mdx)$/i

async function collect(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 8 || out.length >= 3000) return
  let ents
  try {
    ents = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of ents) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) await collect(p, out, depth + 1)
    else if (MD.test(e.name)) out.push(p)
  }
}

/** 掃描資料夾裡的 Markdown（唯讀），回傳連結關係圖 */
export function setupLinkGraph(): void {
  ipcMain.handle('graph:build', async (_e, folder: string): Promise<LinkGraph & { files: number }> => {
    const paths: string[] = []
    await collect(String(folder), paths)
    const files: { path: string; content: string }[] = []
    for (const p of paths) {
      try {
        const st = await fs.stat(p)
        if (st.size > 2 * 1024 * 1024) continue
        files.push({ path: p, content: await fs.readFile(p, 'utf8') })
      } catch {
        /* 讀不到就略過 */
      }
    }
    return { ...buildGraph(files), files: files.length }
  })
}
