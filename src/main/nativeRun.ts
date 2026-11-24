import { spawn, type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NATIVE_COMPILE_TIMEOUT_MS, NATIVE_RUN_TIMEOUT_MS, nativeBlocked, nativeLang, type NativeRunRequest, type NativeRunResult } from '../shared/native'

const MAX_CODE = 20_000
const MAX_OUT_BYTES = 64 * 1024
const win = process.platform === 'win32'
const active = new Map<string, { stop: () => void }>()

/** 移除看起來像金鑰／憑證的環境變數，不讓被執行的程式讀到 */
function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE/i.test(k)) continue
    env[k] = v
  }
  return { ...env, ...extra }
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  try {
    if (win) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    else process.kill(-child.pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      /* 已結束 */
    }
  }
}

interface Step {
  ok: boolean
  code: number | null
  out: { kind: 'log' | 'error'; text: string }[]
  truncated: boolean
  timedOut: boolean
  missing: boolean
  stopped: boolean
}

function runStep(id: string, cmd: string, args: string[], cwd: string, timeoutMs: number, collect: boolean): Promise<Step> {
  return new Promise((resolve) => {
    let child: ChildProcess
    const step: Step = { ok: false, code: null, out: [], truncated: false, timedOut: false, missing: false, stopped: false }
    try {
      child = spawn(cmd, args, {
        cwd,
        env: cleanEnv({ TMPDIR: cwd, TEMP: cwd, TMP: cwd }),
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
        detached: !win
      })
    } catch {
      step.missing = true
      return resolve(step)
    }
    let bytes = 0
    const push = (kind: 'log' | 'error') => (buf: Buffer) => {
      if (step.truncated) return
      bytes += buf.length
      if (bytes > MAX_OUT_BYTES) {
        step.truncated = true
        killTree(child)
        return
      }
      if (collect || kind === 'error')
        for (const line of buf.toString('utf8').replace(/\r\n/g, '\n').split('\n')) {
          if (/^Picked up (_JAVA_OPTIONS|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS)/.test(line)) continue
          step.out.push({ kind, text: line })
        }
    }
    child.stdout?.on('data', push('log'))
    child.stderr?.on('data', push('error'))
    const timer = setTimeout(() => {
      step.timedOut = true
      killTree(child)
    }, timeoutMs)
    active.set(id, {
      stop: () => {
        step.stopped = true
        killTree(child)
      }
    })
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (e.code === 'ENOENT') step.missing = true
      resolve(step)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      step.code = code
      step.ok = code === 0 && !step.timedOut && !step.stopped && !step.truncated
      // 去掉結尾多餘的空行
      while (step.out.length && step.out[step.out.length - 1].text === '') step.out.pop()
      resolve(step)
    })
  })
}

export async function runNative(req: NativeRunRequest): Promise<NativeRunResult> {
  const t0 = Date.now()
  const done = (r: Omit<NativeRunResult, 'ms' | 'truncated'> & { truncated?: boolean }): NativeRunResult => ({ truncated: false, ...r, ms: Date.now() - t0 })
  const lang = nativeLang(String(req.lang ?? ''))
  const code = String(req.code ?? '')
  if (!lang) return done({ status: 'blocked', lines: [], message: '不支援這個語言' })
  if (!code.trim()) return done({ status: 'blocked', lines: [], message: '代碼塊是空的' })
  if (code.length > MAX_CODE) return done({ status: 'blocked', lines: [], message: `程式碼超過 ${MAX_CODE} 字，不執行` })
  const blocked = nativeBlocked(lang, code)
  if (blocked.length) return done({ status: 'blocked', lines: [], message: `為了保護你的電腦，已拒絕執行：${blocked[0]}` })
  if (active.has(req.id)) return done({ status: 'blocked', lines: [], message: '這段程式碼正在執行中' })

  // 每次執行都用全新的暫存資料夾，結束後整個刪除（只刪我們自己建立的這個資料夾）
  const dir = await fs.mkdtemp(join(tmpdir(), 'flowiter-run-'))
  try {
    const file = lang.id === 'java' ? 'Main.java' : `main.${lang.ext}`
    const src = join(dir, file)
    await fs.writeFile(src, code, 'utf8')
    const exe = join(dir, win ? 'prog.exe' : 'prog')

    let tool = ''
    const prefix = (t: string): string[] => {
      switch (lang.id) {
        case 'c':
          return [src, '-o', exe, '-lm']
        case 'cpp':
          return [src, '-o', exe, '-std=c++17']
        case 'rust':
          return [src, '-o', exe]
        case 'go':
          return ['run', src]
        case 'java':
          return [src]
        default:
          void t
          return [src]
      }
    }

    // 找工具：依序嘗試候選，ENOENT 就換下一個
    let first: Step | null = null
    for (const t of lang.tools) {
      const args = prefix(t)
      const step = await runStep(req.id, t, lang.compiled ? args : args, dir, lang.compiled ? NATIVE_COMPILE_TIMEOUT_MS : NATIVE_RUN_TIMEOUT_MS + 15_000, !lang.compiled)
      if (step.missing) continue
      tool = t
      first = step
      break
    }
    if (!first) return done({ status: 'missing', lines: [], message: `找不到 ${lang.tools[0]}。${lang.hint}` })

    if (!lang.compiled) {
      const status = first.stopped ? 'stopped' : first.timedOut ? 'timeout' : first.ok ? 'ok' : 'error'
      return done({
        status,
        lines: first.out,
        exitCode: first.code,
        truncated: first.truncated,
        message: first.timedOut ? `超過 ${NATIVE_RUN_TIMEOUT_MS / 1000} 秒（含啟動），已強制中止` : first.truncated ? '輸出過多，已中止' : undefined
      })
    }
    // 編譯步驟
    if (first.stopped) return done({ status: 'stopped', lines: [] })
    if (first.timedOut) return done({ status: 'timeout', lines: [], message: `編譯超過 ${NATIVE_COMPILE_TIMEOUT_MS / 1000} 秒，已中止` })
    if (!first.ok) return done({ status: 'error', lines: first.out, exitCode: first.code, message: `編譯失敗（${tool}）` })
    // 執行步驟
    const run = await runStep(req.id, exe, [], dir, NATIVE_RUN_TIMEOUT_MS, true)
    if (run.missing) return done({ status: 'error', lines: [], message: '編譯後找不到可執行檔' })
    const status = run.stopped ? 'stopped' : run.timedOut ? 'timeout' : run.ok ? 'ok' : 'error'
    return done({
      status,
      lines: run.out,
      exitCode: run.code,
      truncated: run.truncated,
      message: run.timedOut ? `超過 ${NATIVE_RUN_TIMEOUT_MS / 1000} 秒，已強制中止` : run.truncated ? '輸出過多，已中止' : undefined
    })
  } catch (e) {
    return done({ status: 'error', lines: [], message: String((e as Error)?.message ?? e) })
  } finally {
    active.delete(req.id)
    // 只刪我們建立的暫存資料夾（路徑必為 tmpdir 下 flowiter-run- 開頭）
    if (dir.includes('flowiter-run-')) void fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export function stopNative(id: string): void {
  active.get(id)?.stop()
}
