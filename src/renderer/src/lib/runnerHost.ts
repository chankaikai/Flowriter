import { PYODIDE_INDEX, PY_LOAD_TIMEOUT_MS, RUN_TIMEOUT_MS, capOutput, pythonWorkerSource, workerSource, type RunKind } from './runner'

export interface RunResult {
  lines: { kind: 'log' | 'warn' | 'error' | 'result'; text: string }[]
  status: 'ok' | 'error' | 'timeout' | 'stopped'
  error?: string
  truncated: boolean
  ms: number
}

export interface RunHandle {
  stop(): void
  done: Promise<RunResult>
}

/** 在一次性 Worker 中執行；逾時、停止或完成後一律 terminate，不留任何背景程序。 */
export function runCode(kind: RunKind, code: string, onPhase?: (p: 'loading' | 'running') => void): RunHandle {
  const url = URL.createObjectURL(new Blob([kind === 'py' ? pythonWorkerSource() : workerSource()], { type: 'text/javascript' }))
  const worker = new Worker(url)
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
  const lines: RunResult['lines'] = []
  const t0 = performance.now()
  let finished = false
  let finish!: (r: RunResult) => void
  const done = new Promise<RunResult>((res) => (finish = res))

  const end = (status: RunResult['status'], error?: string) => {
    if (finished) return
    finished = true
    window.clearTimeout(timer)
    worker.terminate()
    URL.revokeObjectURL(url)
    const capped = capOutput(lines.map((l) => l.text))
    finish({ lines: lines.slice(0, capped.lines.length), status, error, truncated: capped.truncated, ms: Math.round(performance.now() - t0) })
  }

  const armRun = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => end('timeout', `超過 ${RUN_TIMEOUT_MS / 1000} 秒，已強制中止`), RUN_TIMEOUT_MS)
  }
  // Python 要先下載執行環境：載入階段給較長的等待，開始執行後才套用 3 秒上限
  let timer = window.setTimeout(
    () => end('timeout', kind === 'py' ? '載入 Python 環境逾時，請確認網路後再試' : `超過 ${RUN_TIMEOUT_MS / 1000} 秒，已強制中止`),
    kind === 'py' ? PY_LOAD_TIMEOUT_MS : RUN_TIMEOUT_MS
  )
  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as { token?: string; kind?: string; text?: string }
    if (!m || m.token !== token) return
    if (m.kind === 'loading') onPhase?.('loading')
    else if (m.kind === 'running') {
      onPhase?.('running')
      armRun()
    } else if (m.kind === 'done') window.setTimeout(() => end('ok'), 50)
    else if (m.kind === 'fail') end('error', m.text)
    else if (m.kind === 'log' || m.kind === 'warn' || m.kind === 'error' || m.kind === 'result') lines.push({ kind: m.kind, text: String(m.text ?? '') })
  }
  worker.onerror = (e) => {
    e.preventDefault()
    end('error', e.message || '執行時發生錯誤')
  }
  worker.postMessage({ token, code, indexURL: PYODIDE_INDEX })
  return { stop: () => end('stopped', '已手動停止'), done }
}
