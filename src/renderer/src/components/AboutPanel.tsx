import { useState } from 'react'
import { FEEDBACK_EMAIL, REPO_URL, type UpdateStatus } from '../../../shared/update'
import { tr } from '@/lib/i18n'
import { CHANGELOG } from '@/lib/changelog'

interface Props {
  version: string
  status: UpdateStatus
}

/** 更新狀態的一句話說明 */
export function updateText(s: UpdateStatus): string {
  switch (s.state) {
    case 'dev':
      return '開發模式不檢查更新'
    case 'checking':
      return '正在檢查更新…'
    case 'none':
      return '目前已是最新版本'
    case 'available':
      return `發現新版本 ${s.version ?? ''}`
    case 'downloading':
      return `正在下載新版本 ${s.version ?? ''}… ${s.percent ?? 0}%`
    case 'downloaded':
      return `新版本 ${s.version ?? ''} 已下載完成`
    case 'error':
      return `檢查更新失敗：${s.message ?? '未知錯誤'}`
    default:
      return ''
  }
}

/** 「關於 Flowiter」：版本、檢查更新、回饋信箱。 */
export function AboutPanel({ version, status }: Props) {
  const [copied, setCopied] = useState(false)
  const busy = status.state === 'checking' || status.state === 'downloading'
  const copy = () => {
    void navigator.clipboard.writeText(FEEDBACK_EMAIL).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="about">
      <div className="about-name">Flowiter</div>
      <div className="about-ver">版本 {version || '—'}</div>
      <p className="about-desc">{tr('所見即所得的 Markdown 編輯器。檔案永遠是標準 Markdown，內容存在你自己的電腦上。')}</p>

      <div className="about-sec">{tr('檢查更新')}</div>
      <div className={`about-upd ${status.state}`}>{updateText(status) || '點下面的按鈕檢查是否有新版本'}</div>
      <div className="about-row">
        {status.state === 'available' ? (
          <button className="btn" onClick={() => void window.api.updateDownload()}>{tr('立即更新')}</button>
        ) : status.state === 'downloaded' ? (
          <button className="btn" onClick={() => window.api.updateInstall()}>{tr('重啟並安裝')}</button>
        ) : (
          <button className="btn" disabled={busy || status.state === 'dev'} onClick={() => void window.api.updateCheck()}>{tr('檢查更新')}</button>
        )}
      </div>

      {status.notes && (
        <>
          <div className="about-sec">{tr('新版本更新說明')}</div>
          <pre className="about-notes">{status.notes}</pre>
        </>
      )}
      <div className="about-sec">{tr('更新日誌')}</div>
      <div className="about-log">
        {CHANGELOG.map((c) => (
          <div key={c.version}>
            <b>{c.version}</b>
            <ul>{c.items.map((t, i) => <li key={i}>{tr(t)}</li>)}</ul>
          </div>
        ))}
      </div>

      <div className="about-sec">{tr('說明與回饋')}</div>
      <p className="about-desc">{tr('遇到問題、想要新功能，或有任何建議，歡迎來信：')}</p>
      <div className="about-mail">{FEEDBACK_EMAIL}</div>
      <div className="about-row">
        <button
          className="btn"
          onClick={() => window.api.openExternal(`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Flowiter 意見回饋')}&body=${encodeURIComponent(`版本：${version}\n系統：${navigator.userAgent}\n\n請描述你遇到的問題或建議：\n`)}`)}
        >
          {tr('寫信給我們')}
        </button>
        <button className="btn ghost" onClick={copy}>{copied ? '已複製' : '複製信箱'}</button>
      </div>
      <p className="about-hint">{tr('來信時附上版本號和操作步驟（最好附截圖），我們比較容易重現問題。')}</p>

      <div className="about-sec">{tr('專案')}</div>
      <div className="about-row">
        <button className="btn ghost" onClick={() => window.api.openExternal(REPO_URL)}>{tr('GitHub 專案頁')}</button>
        <button className="btn ghost" onClick={() => window.api.openExternal(`${REPO_URL}/releases`)}>{tr('版本紀錄')}</button>
      </div>
    </div>
  )
}

/** 發現新版本時，畫面右下角的提示條（可稍後再說） */
export function UpdateBanner({ status, onDismiss, onAbout }: { status: UpdateStatus; onDismiss(): void; onAbout(): void }) {
  if (status.state !== 'available' && status.state !== 'downloading' && status.state !== 'downloaded') return null
  return (
    <div className="upd-banner" role="status">
      <div className="upd-text">
        {status.state === 'available' && `發現新版本 ${status.version ?? ''}`}
        {status.state === 'downloading' && `正在下載新版本… ${status.percent ?? 0}%`}
        {status.state === 'downloaded' && `新版本 ${status.version ?? ''} 已就緒`}
      </div>
      <div className="upd-actions">
        {status.state === 'available' && <button className="btn" onClick={() => void window.api.updateDownload()}>{tr('立即更新')}</button>}
        {status.state === 'downloaded' && <button className="btn" onClick={() => window.api.updateInstall()}>{tr('重啟並安裝')}</button>}
        <button className="btn ghost" onClick={onAbout}>{tr('詳情')}</button>
        <button className="btn ghost" onClick={onDismiss}>{tr('稍後')}</button>
      </div>
    </div>
  )
}
