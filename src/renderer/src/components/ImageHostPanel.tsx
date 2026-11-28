import { useState } from 'react'
import { loadHost, saveHost } from '@/lib/imageHost'
import { type HostKind, type ImageHostCfg } from '../../../shared/imageHost'
import { tr } from '@/lib/i18n'

/** 圖床設定：本機 assets、PicGo／PicList、自訂 HTTP。貼上或拖入圖片時依此上傳。 */
export function ImageHostPanel() {
  const [c, setC] = useState<ImageHostCfg>(loadHost)
  const [test, setTest] = useState('')
  const set = (p: Partial<ImageHostCfg>) =>
    setC((x) => {
      const n = { ...x, ...p }
      saveHost(n)
      return n
    })

  const runTest = async () => {
    setTest(tr('測試中…'))
    // 1×1 透明 PNG
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (ch) => ch.charCodeAt(0))
    const r = await window.api.imageHostUpload({ cfg: c, name: 'flowriter-test.png', data: png.buffer as ArrayBuffer })
    setTest(r.ok ? `${tr('上傳成功')}：${r.url}` : `${tr('失敗')}：${r.error}`)
  }

  return (
    <>
      <div className="row">
        <span>{tr('貼上或拖入圖片時')}</span>
        <select className="ai-input" value={c.kind} onChange={(e) => set({ kind: e.target.value as HostKind })}>
          <option value="local">{tr('存到文件旁的 assets 資料夾')}</option>
          <option value="picgo">PicGo / PicList</option>
          <option value="custom">{tr('自訂 HTTP 圖床')}</option>
        </select>
      </div>
      {c.kind === 'picgo' && (
        <>
          <div className="hist-hint">{tr('先啟動 PicGo 或 PicList，並在它的設定裡開啟「Server」。預設位址如下。')}</div>
          <input className="ai-input" value={c.picgoUrl} onChange={(e) => set({ picgoUrl: e.target.value })} placeholder="http://127.0.0.1:36677/upload" />
        </>
      )}
      {c.kind === 'custom' && (
        <>
          <div className="hist-hint">{tr('以 multipart/form-data 上傳，回應需是 JSON（取網址路徑）或直接是網址。')}</div>
          <input className="ai-input" value={c.customUrl} onChange={(e) => set({ customUrl: e.target.value })} placeholder="https://img.example.com/upload" />
          <div className="row">
            <span>{tr('檔案欄位名')}</span>
            <input className="ai-input" value={c.customField} onChange={(e) => set({ customField: e.target.value })} />
          </div>
          <div className="row">
            <span>{tr('回應中網址的路徑')}</span>
            <input className="ai-input" value={c.customPath} onChange={(e) => set({ customPath: e.target.value })} placeholder="data.url" />
          </div>
          <textarea className="css-box" rows={3} spellCheck={false} value={c.customHeaders} onChange={(e) => set({ customHeaders: e.target.value })} placeholder={'Authorization: Bearer xxxx'} />
          <div className="hist-hint">{tr('標頭（含金鑰）只存在這台電腦的本機設定裡，不會寫進文件，也不會進備份以外的任何地方。')}</div>
        </>
      )}
      {c.kind !== 'local' && (
        <div className="pop-actions">
          <button className="btn ghost" onClick={() => void runTest()}>{tr('傳一張測試圖')}</button>
        </div>
      )}
      {test && <div className="hist-hint" style={{ wordBreak: 'break-all' }}>{test}</div>}
      <div className="hist-hint">{tr('上傳失敗時會自動改存本機，不會丟圖。要把整篇文件的本地圖片一次傳上去，用命令面板的「上傳本文的本地圖片到圖床」。')}</div>
    </>
  )
}
