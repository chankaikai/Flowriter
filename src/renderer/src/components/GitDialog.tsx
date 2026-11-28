import { useCallback, useEffect, useState } from 'react'
import { defaultCommitMessage, type GitStatus } from '../../../shared/gitSync'
import { tr, trf } from '@/lib/i18n'

/** 把資料夾裡的文件提交並推送到 Git 遠端（GitHub、Gitee、GitLab、自架都行，只要 git 推得上去）。 */
export function GitDialog({ dir, onClose, onDone }: { dir: string; onClose(): void; onDone(msg: string): void }) {
  const [st, setSt] = useState<GitStatus | null>(null)
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState(defaultCommitMessage)
  const [onlyDocs, setOnlyDocs] = useState(true)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState('')

  const refresh = useCallback(async () => {
    const s = await window.api.gitStatus(dir)
    setSt(s)
    setUrl((u) => u || s.remote)
  }, [dir])
  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [busy, onClose])

  const act = async (label: string, fn: () => Promise<{ ok: boolean; out: string }>, done?: string) => {
    setBusy(true)
    setLog(`${label}…`)
    try {
      const r = await fn()
      setLog(r.out || (r.ok ? tr('完成') : tr('失敗')))
      if (r.ok && done) onDone(done)
    } catch (e) {
      setLog(String((e as Error)?.message ?? e))
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  const root = st?.root || dir
  const shown = st?.changes.slice(0, 40) ?? []

  return (
    <div className="xp-overlay" onMouseDown={() => !busy && onClose()}>
      <div className="xp-dlg git-dlg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="xp-form" style={{ width: '100%', borderRight: 0 }}>
          <h3>{tr('發佈到 Git')}</h3>
          <div className="hist-hint" style={{ wordBreak: 'break-all' }}>{tr('資料夾')}：{root}</div>
          {!st && <div className="hist-hint">{tr('載入中…')}</div>}
          {st && !st.gitOk && <div className="hist-hint warn">{st.error}</div>}
          {st && st.gitOk && !st.isRepo && (
            <>
              <div className="hist-hint">{tr('這個資料夾還不是 Git 倉庫。')}</div>
              <div className="xp-actions">
                <button className="btn" disabled={busy} onClick={() => void act(tr('初始化'), () => window.api.gitInit(dir))}>{tr('初始化 Git 倉庫')}</button>
              </div>
            </>
          )}
          {st?.isRepo && (
            <>
              <div className="hist-hint">
                {tr('分支')}：{st.branch || '—'} · {trf('{0} 個變更', String(st.changes.length))}{st.ahead ? ` · ${trf('領先遠端 {0} 個提交', String(st.ahead))}` : ''}
              </div>
              <label className="xp-css">{tr('遠端位址（origin）')}
                <div className="xp-row">
                  <input className="ai-input" style={{ flex: 1 }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/你/倉庫.git" spellCheck={false} />
                  <button className="btn ghost" disabled={busy || !url.trim() || url.trim() === st.remote} onClick={() => void act(tr('設定遠端'), () => window.api.gitRemote(root, url))}>{tr('設定')}</button>
                </div>
              </label>
              <label className="xp-css">{tr('提交訊息')}
                <input className="ai-input" value={msg} maxLength={300} onChange={(e) => setMsg(e.target.value)} />
              </label>
              <label className="xp-check"><input type="checkbox" checked={onlyDocs} onChange={(e) => setOnlyDocs(e.target.checked)} />{tr('只提交文件與圖片（不含筆記旁檔、備份等）')}</label>
              {shown.length > 0 && (
                <div className="git-files">
                  {shown.map((c) => <div key={c.path}><b>{c.status.trim() || '?'}</b> {c.path}</div>)}
                  {st.changes.length > shown.length && <div>… {trf('另有 {0} 個', String(st.changes.length - shown.length))}</div>}
                </div>
              )}
              <div className="xp-actions">
                <button className="btn ghost" disabled={busy || !st.remote} onClick={() => void act(tr('拉取'), () => window.api.gitPull(root))}>{tr('拉取')}</button>
                <span className="grow" />
                <button className="btn ghost" onClick={onClose} disabled={busy}>{tr('關閉')}</button>
                <button className="btn" disabled={busy || !st.remote || !msg.trim()} onClick={() => void act(tr('提交並推送'), () => window.api.gitSync(root, msg, onlyDocs), tr('已推送'))}>{busy ? tr('處理中…') : tr('提交並推送')}</button>
              </div>
              {!st.remote && <div className="hist-hint">{tr('先填遠端位址並按「設定」。登入由本機 git 的憑證管理處理，這裡不會輸入或保存密碼。')}</div>}
            </>
          )}
          {log && <pre className="git-log">{log}</pre>}
        </div>
      </div>
    </div>
  )
}
