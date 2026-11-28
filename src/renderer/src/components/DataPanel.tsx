import { useEffect, useState } from 'react'
import { tr, trf } from '@/lib/i18n'
import { confirmBox } from '@/lib/confirm'

const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`)

/** 設定裡的「資料與維護」：備份／匯入使用者資料、清除快取。 */
export function DataPanel() {
  const [msg, setMsg] = useState('')
  const [cache, setCache] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [dir, setDir] = useState('')

  useEffect(() => {
    void window.api.cacheSize().then(setCache).catch(() => setCache(null))
    void window.api.dataLocation().then((r) => setDir(r.dir)).catch(() => undefined)
  }, [])

  async function backup() {
    setBusy(true)
    try {
      const local: Record<string, string> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k != null) local[k] = localStorage.getItem(k) ?? ''
      }
      const r = await window.api.dataBackup(local)
      if (r.ok) setMsg(trf('已備份 {0} 個檔案（{1}）到 {2}', r.count, mb(r.bytes), r.path))
      else if (r.reason !== 'cancel') setMsg(trf('備份失敗：{0}', r.reason))
    } finally {
      setBusy(false)
    }
  }

  async function restore() {
    if (!(await confirmBox('匯入備份會覆蓋同名的歷史版本、膠囊與設定。\n你的文件檔案不會被動到。要繼續嗎？', '匯入'))) return
    setBusy(true)
    try {
      const r = await window.api.dataRestore()
      if (!r.ok) {
        if (r.reason !== 'cancel') setMsg(trf('匯入失敗：{0}', r.reason))
        return
      }
      for (const [k, v] of Object.entries(r.local)) {
        try { localStorage.setItem(k, v) } catch { /* 空間不足就略過這一項 */ }
      }
      setMsg(trf('已匯入 {0} 個檔案，即將重新載入…', r.count))
      window.setTimeout(() => location.reload(), 900)
    } finally {
      setBusy(false)
    }
  }

  async function moveDir() {
    if (!(await confirmBox('會把歷史版本、膠囊、抽屜與音樂複製到新資料夾（舊資料不會被刪除），然後重新啟動。要繼續嗎？', '搬家'))) return
    setBusy(true)
    try {
      const r = await window.api.dataMoveDir()
      if (r.ok) {
        setMsg(trf('已複製到 {0}，即將重新啟動…', r.path))
        window.setTimeout(() => void window.api.appRelaunch(), 1200)
      } else if (r.reason !== 'cancel') setMsg(trf('搬家失敗：{0}', r.reason))
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    setBusy(true)
    try {
      const r = await window.api.cacheClear()
      setMsg(r.ok ? trf('已清除快取，釋放 {0}', mb(r.freed)) : trf('清除失敗：{0}', r.reason ?? ''))
      setCache(await window.api.cacheSize().catch(() => null))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="data-panel">
      <div className="hist-hint">{tr('備份包含：歷史版本（時光機）、時間膠囊、加密抽屜、環境音檔與所有設定。文件本身不在其中，請照平常方式保管。')}</div>
      <div className="pop-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={busy} onClick={() => void backup()}>{tr('備份使用者資料…')}</button>
        <button className="btn" disabled={busy} onClick={() => void restore()}>{tr('匯入備份…')}</button>
      </div>
      <div className="hist-hint" style={{ marginTop: 10 }}>
        {trf('資料位置：{0}', dir)}
      </div>
      <div className="pop-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={busy} onClick={() => void moveDir()}>{tr('更改資料位置…')}</button>
      </div>
      <div className="hist-hint" style={{ marginTop: 10 }}>
        {tr('清除快取只會刪除瀏覽器引擎的暫存檔，絕不會動你的文件、歷史版本、設定或音檔。')}
        {cache != null && <> {trf('目前約 {0}', mb(cache))}</>}
      </div>
      <div className="pop-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn" disabled={busy} onClick={() => void clear()}>{tr('清除快取')}</button>
      </div>
      {msg && <div className="hist-hint" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  )
}
