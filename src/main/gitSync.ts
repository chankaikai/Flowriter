import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { isDocPath, parsePorcelain, validRemote, type GitStatus } from '../shared/gitSync'

/**
 * 以系統上的 git 同步文件。全部用「參數陣列」呼叫（不經過 shell），不做強制推送，
 * 不改全域設定；登入由使用者本機的 git 憑證管理員處理，程式不碰也不存密碼或 token。
 */
const run = (cwd: string, args: string[], timeout = 120_000): Promise<{ ok: boolean; out: string }> =>
  new Promise((resolve) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C.UTF-8' } }, (err, stdout, stderr) => {
      const out = `${stdout ?? ''}${stderr ? `\n${stderr}` : ''}`.trim()
      if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') resolve({ ok: false, out: 'NO_GIT' })
      else resolve({ ok: !err, out })
    })
  })

const isDir = async (d: string): Promise<boolean> => {
  try {
    return typeof d === 'string' && d.length > 0 && (await fs.stat(d)).isDirectory()
  } catch {
    return false
  }
}

async function status(dir: string): Promise<GitStatus> {
  const base: GitStatus = { gitOk: true, isRepo: false, root: '', branch: '', remote: '', changes: [], ahead: 0 }
  if (!(await isDir(dir))) return { ...base, error: '資料夾不存在' }
  const v = await run(dir, ['--version'], 10_000)
  if (!v.ok) return { ...base, gitOk: false, error: v.out === 'NO_GIT' ? '找不到 git：請先安裝 Git for Windows（https://git-scm.com）' : v.out }
  const top = await run(dir, ['rev-parse', '--show-toplevel'], 10_000)
  if (!top.ok) return base
  const root = top.out.split('\n')[0].trim()
  const [br, rem, st, ah] = await Promise.all([
    run(root, ['rev-parse', '--abbrev-ref', 'HEAD'], 10_000),
    run(root, ['remote', 'get-url', 'origin'], 10_000),
    run(root, ['status', '--porcelain=v1', '-z', '-uall'], 30_000),
    run(root, ['rev-list', '--count', '@{u}..HEAD'], 10_000)
  ])
  return {
    gitOk: true,
    isRepo: true,
    root,
    branch: br.ok ? br.out.trim() : '',
    remote: rem.ok ? rem.out.trim() : '',
    changes: st.ok ? parsePorcelain(st.out) : [],
    ahead: ah.ok ? Number(ah.out.trim()) || 0 : 0
  }
}

export function setupGitSync(): void {
  ipcMain.handle('git:status', (_e, dir: string) => status(dir))

  ipcMain.handle('git:init', async (_e, dir: string) => {
    if (!(await isDir(dir))) return { ok: false, out: '資料夾不存在' }
    return run(dir, ['init'])
  })

  ipcMain.handle('git:remote', async (_e, root: string, url: string) => {
    if (!(await isDir(root))) return { ok: false, out: '資料夾不存在' }
    if (!validRemote(url)) return { ok: false, out: '遠端位址格式不正確（需要 https://…、ssh://… 或 git@主機:路徑）' }
    const has = await run(root, ['remote', 'get-url', 'origin'], 10_000)
    return run(root, has.ok ? ['remote', 'set-url', 'origin', url.trim()] : ['remote', 'add', 'origin', url.trim()], 10_000)
  })

  ipcMain.handle('git:pull', async (_e, root: string) => {
    if (!(await isDir(root))) return { ok: false, out: '資料夾不存在' }
    return run(root, ['pull', '--ff-only']) // 只允許快轉：有分歧時不會自動合併，交給使用者處理
  })

  /** 提交並推送。onlyDocs：只納入文件與圖片，不帶旁檔（筆記、金鑰等） */
  ipcMain.handle('git:sync', async (_e, root: string, message: string, onlyDocs: boolean) => {
    if (!(await isDir(root))) return { ok: false, out: '資料夾不存在' }
    const msg = String(message || '').trim().slice(0, 300) || '更新文件'
    const log: string[] = []
    const st = await run(root, ['status', '--porcelain=v1', '-z', '-uall'], 30_000)
    if (!st.ok) return { ok: false, out: st.out }
    const changes = parsePorcelain(st.out).filter((c) => !onlyDocs || isDocPath(c.path))
    if (changes.length) {
      const paths = changes.map((c) => c.path)
      for (let i = 0; i < paths.length; i += 100) {
        const a = await run(root, ['add', '-A', '--', ...paths.slice(i, i + 100)])
        if (!a.ok) return { ok: false, out: a.out }
      }
      const c = await run(root, ['commit', '-m', msg, '--no-verify'])
      if (!c.ok) return { ok: false, out: /user\.(name|email)|identity/i.test(c.out) ? `${c.out}\n\n請先設定提交者：git config --global user.name "你的名字"、git config --global user.email "你的信箱"` : c.out }
      log.push(c.out.split('\n')[0])
    } else log.push('沒有需要提交的變更')
    const p = await run(root, ['push', '-u', 'origin', 'HEAD'])
    log.push(p.out)
    if (!p.ok) return { ok: false, out: `${log.join('\n')}\n\n（若被拒絕，多半是遠端有新內容：先按「拉取」，再重試。程式不會強制推送。）` }
    return { ok: true, out: log.join('\n') }
  })
}
