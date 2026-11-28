/** Git 同步用的純函式（主程序與前端、測試共用）。 */

export interface GitChange { path: string; status: string }

/** 解析 `git status --porcelain=v1 -z` 的輸出 */
export function parsePorcelain(out: string): GitChange[] {
  const parts = out.split('\0').filter(Boolean)
  const res: GitChange[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.length < 4) continue
    const status = p.slice(0, 2)
    res.push({ status, path: p.slice(3) })
    if (status[0] === 'R' || status[0] === 'C') i++ // 改名：下一段是舊路徑
  }
  return res
}

const DOC_EXT = /\.(md|markdown|mdx|txt)$/i
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i

/** 「只提交文件與圖片」模式要納入的檔案：Markdown／文字，或 assets 底下的檔案、一般圖片；不含旁檔（筆記、加密金鑰等） */
export function isDocPath(p: string): boolean {
  const q = p.replace(/\\/g, '/')
  if (/(^|\/)\.git(\/|$)/.test(q)) return false
  if (/\.(inkwell|flowbak|bak)$/i.test(q) || /(^|\/)\.inkwell[^/]*$/i.test(q)) return false
  return DOC_EXT.test(q) || IMG_EXT.test(q) || /(^|\/)assets\//.test(q)
}

/** 遠端位址：只接受 https、ssh、git@host:path；不可以以 - 開頭（避免被當成 git 參數） */
export function validRemote(u: string): boolean {
  const s = u.trim()
  if (!s || s.startsWith('-') || /\s/.test(s)) return false
  return /^https:\/\/[^/\s]+\/\S+$/i.test(s) || /^ssh:\/\/[^/\s]+\/\S+$/i.test(s) || /^[\w.-]+@[\w.-]+:\S+$/.test(s)
}

export const defaultCommitMessage = (d = new Date()): string => {
  const z = (n: number) => String(n).padStart(2, '0')
  return `更新文件 ${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`
}

export interface GitStatus {
  gitOk: boolean
  isRepo: boolean
  root: string
  branch: string
  remote: string
  changes: GitChange[]
  ahead: number
  error?: string
}
