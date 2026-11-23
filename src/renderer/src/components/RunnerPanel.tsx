import { useEffect, useMemo, useRef, useState } from 'react'
import { preflight, RUN_TIMEOUT_MS } from '@/lib/runner'
import { runJs, type RunHandle, type RunResult } from '@/lib/runnerHost'

interface Props {
  /** 游標所在代碼塊；null 表示游標不在代碼塊內 */
  block: { lang: string; code: string } | null
}

export function RunnerPanel({ block }: Props) {
  const pre = useMemo(() => (block ? preflight(block.lang, block.code) : null), [block])
  const [confirm, setConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [res, setRes] = useState<RunResult | null>(null)
  const handle = useRef<RunHandle | null>(null)

  // 面板關閉或換了代碼塊時，一律停止執行中的 Worker
  useEffect(
    () => () => {
      handle.current?.stop()
    },
    [block]
  )

  if (!block || !pre) {
    return <p className="pop-empty">把游標放進一個代碼塊（```js），再開啟這個面板。</p>
  }

  const start = () => {
    if (!pre.runnable || running) return
    setConfirm(false)
    setRes(null)
    setRunning(true)
    const h = runJs(block.code)
    handle.current = h
    void h.done.then((r) => {
      if (handle.current === h) {
        setRes(r)
        setRunning(false)
        handle.current = null
      }
    })
  }
  const onRun = () => (pre.warnings.length && !confirm ? setConfirm(true) : start())

  return (
    <>
      <div className="hist-hint">
        只執行 JavaScript，在獨立的隔離環境中跑：沒有檔案、沒有網路、碰不到文件與程式本身；超過 {RUN_TIMEOUT_MS / 1000} 秒會強制中止。
        結果只顯示在這裡，<b>不會寫進你的文件</b>。
      </div>
      <pre className="runner-code">{block.code.split('\n').slice(0, 14).join('\n')}{block.code.split('\n').length > 14 ? '\n…' : ''}</pre>

      {pre.danger.length > 0 && (
        <p className="runner-warn">
          ⚠ 這段看起來含有破壞性操作：{pre.danger.join('、')}。本程式不會執行它。
        </p>
      )}
      {!pre.runnable && <p className="pop-empty">{pre.reason}</p>}
      {pre.runnable && pre.warnings.length > 0 && (
        <p className="runner-warn">⚠ {pre.warnings.join('；')}</p>
      )}

      {pre.runnable && (
        <div className="pop-actions">
          {running ? (
            <button className="btn" onClick={() => handle.current?.stop()}>停止</button>
          ) : (
            <button className="btn" onClick={onRun}>{confirm ? '了解風險，仍要執行' : '執行'}</button>
          )}
          {confirm && !running && <button className="btn ghost" onClick={() => setConfirm(false)}>取消</button>}
        </div>
      )}

      {res && (
        <div className="runner-out">
          <div className="runner-status">
            {res.status === 'ok' ? '完成' : res.status === 'timeout' ? '逾時中止' : res.status === 'stopped' ? '已停止' : '發生錯誤'} · {res.ms} ms
          </div>
          {res.lines.map((l, i) => (
            <pre key={i} className={`runner-line ${l.kind}`}>{l.kind === 'result' ? '⇒ ' : ''}{l.text}</pre>
          ))}
          {res.truncated && <div className="runner-status">輸出過長，已截斷</div>}
          {res.error && <pre className="runner-line error">{res.error}</pre>}
          {res.lines.length > 0 && (
            <button className="btn ghost" onClick={() => void navigator.clipboard.writeText(res.lines.map((l) => l.text).join('\n'))}>
              複製輸出
            </button>
          )}
        </div>
      )}
    </>
  )
}
