import { useEffect, useMemo, useState } from 'react'
import { buildHtmlDocument, renderHtmlBody } from '@/export/exportHtml'
import { DEFAULT_EXPORT, headerFooter, loadExportOpts, optionsCss, previewCss, saveExportOpts, withToc, type ExportOpts, type Paper } from '@/export/exportOptions'
import { musicHiddenMode } from '@/editor/musicUi'
import { tr } from '@/lib/i18n'

export type PagedKind = 'html' | 'pdf' | 'print'
const TITLE: Record<PagedKind, string> = { html: '匯出 HTML', pdf: '匯出 PDF', print: '列印' }
const GO: Record<PagedKind, string> = { html: '匯出', pdf: '匯出 PDF', print: '列印…' }

const Num = ({ label, v, min, max, step = 1, on }: { label: string; v: number; min: number; max: number; step?: number; on(n: number): void }) => (
  <label className="xp-num">
    <span>{tr(label)}</span>
    <input type="number" min={min} max={max} step={step} value={v} onChange={(e) => e.target.value !== '' && on(+e.target.value)} />
  </label>
)

/** Typora 風格的匯出／列印設定：左邊調參數，右邊即時預覽（預覽是連續畫面，實際分頁由輸出時決定）。 */
export function ExportDialog({ kind, md, base, dir, onClose, onDone }: { kind: PagedKind; md: string; base: string; dir: string | null; onClose(): void; onDone(msg: string): void }) {
  const [o, setO] = useState<ExportOpts>(loadExportOpts)
  const [body, setBody] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (p: Partial<ExportOpts>) => setO((x) => ({ ...x, ...p }))
  const paged = kind !== 'html'

  useEffect(() => {
    let live = true
    const id = window.setTimeout(() => {
      renderHtmlBody(withToc(md, o.toc), dir, musicHiddenMode)
        .then((b) => live && setBody(b))
        .catch((e) => live && setErr(String((e as Error)?.message ?? e).slice(0, 120)))
    }, 120)
    return () => {
      live = false
      window.clearTimeout(id)
    }
  }, [md, dir, o.toc])

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [busy, onClose])

  const html = useMemo(() => (body === null ? '' : buildHtmlDocument(base, body, optionsCss(o, kind))), [body, o, kind, base])
  const preview = useMemo(() => (body === null ? '' : buildHtmlDocument(base, body, `${optionsCss(o, kind)}\n${previewCss(o, kind)}`)), [body, o, kind, base])

  const go = async () => {
    if (body === null || busy) return
    setBusy(true)
    setErr('')
    saveExportOpts(o)
    try {
      if (kind === 'html') {
        const out = await window.api.exportFile({ name: base, ext: 'html', filterName: 'HTML', data: html })
        if (out) {
          window.api.reveal(out)
          onDone(tr('已匯出'))
        }
      } else if (kind === 'pdf') {
        const hf = headerFooter(o, base)
        const out = await window.api.exportPdf({ name: base, html, ...(hf ? { header: hf.header, footer: hf.footer } : {}) })
        if (out) {
          window.api.reveal(out)
          onDone(tr('已匯出'))
        }
      } else {
        const r = await window.api.exportPrint({ html })
        if (r.ok) onDone(tr('已送出列印'))
        else if (r.reason && r.reason !== 'cancelled' && r.reason !== 'Print job canceled') setErr(r.reason)
        else return
      }
      onClose()
    } catch (e) {
      setErr(String((e as Error)?.message ?? e).slice(0, 140))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="xp-overlay" onMouseDown={() => !busy && onClose()}>
      <div className="xp-dlg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="xp-form">
          <h3>{tr(TITLE[kind])}</h3>
          {paged && (
            <>
              <div className="xp-row">
                <label>{tr('紙張')}
                  <select value={o.paper} onChange={(e) => set({ paper: e.target.value as Paper })}>
                    {(['A3', 'A4', 'A5', 'Letter', 'Legal'] as Paper[]).map((p) => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className="xp-check"><input type="checkbox" checked={o.landscape} onChange={(e) => set({ landscape: e.target.checked })} />{tr('橫向')}</label>
              </div>
              <div className="xp-grid">
                <Num label="上邊距 mm" v={o.mt} min={0} max={60} on={(n) => set({ mt: n })} />
                <Num label="下邊距 mm" v={o.mb} min={0} max={60} on={(n) => set({ mb: n })} />
                <Num label="左邊距 mm" v={o.ml} min={0} max={60} on={(n) => set({ ml: n })} />
                <Num label="右邊距 mm" v={o.mr} min={0} max={60} on={(n) => set({ mr: n })} />
              </div>
            </>
          )}
          {!paged && <Num label="內容寬度 px" v={o.width} min={360} max={1600} step={10} on={(n) => set({ width: n })} />}
          <div className="xp-row">
            <label>{tr('字體')}
              <select value={o.font} onChange={(e) => set({ font: e.target.value as ExportOpts['font'] })}>
                <option value="sans">{tr('黑體')}</option>
                <option value="serif">{tr('宋體／襯線')}</option>
                <option value="mono">{tr('等寬')}</option>
              </select>
            </label>
            <label>{tr('主題')}
              <select value={o.theme} onChange={(e) => set({ theme: e.target.value as ExportOpts['theme'] })}>
                <option value="light">{tr('淺色')}</option>
                <option value="sepia">{tr('米黃')}</option>
                <option value="dark">{tr('深色')}</option>
              </select>
            </label>
          </div>
          <div className="xp-grid">
            <Num label="字級 px" v={o.fontSize} min={9} max={32} on={(n) => set({ fontSize: n })} />
            <Num label="行高" v={o.lineHeight} min={1.1} max={3} step={0.05} on={(n) => set({ lineHeight: n })} />
          </div>
          <label className="xp-check"><input type="checkbox" checked={o.toc} onChange={(e) => set({ toc: e.target.checked })} />{tr('在最前面加入目錄')}</label>
          {kind === 'pdf' && (
            <>
              <label className="xp-check"><input type="checkbox" checked={o.header} onChange={(e) => set({ header: e.target.checked })} />{tr('頁首顯示文件標題')}</label>
              <label className="xp-check"><input type="checkbox" checked={o.pageNumbers} onChange={(e) => set({ pageNumbers: e.target.checked })} />{tr('頁尾顯示頁碼')}</label>
            </>
          )}
          {paged && <label className="xp-check"><input type="checkbox" checked={o.background} onChange={(e) => set({ background: e.target.checked })} />{tr('保留背景色（程式碼底色、表頭）')}</label>}
          <label className="xp-css">{tr('自訂 CSS（進階）')}
            <textarea value={o.customCss} spellCheck={false} placeholder="h1 { color: #333 }" onChange={(e) => set({ customCss: e.target.value })} />
          </label>
          {kind === 'print' && <div className="hist-hint">{tr('印表機、份數、頁範圍在按「列印」後的系統對話框裡選。')}</div>}
          {err && <div className="hist-hint warn">{err}</div>}
          <div className="xp-actions">
            <button className="btn ghost" onClick={() => setO(DEFAULT_EXPORT)}>{tr('還原預設')}</button>
            <span className="grow" />
            <button className="btn ghost" onClick={onClose} disabled={busy}>{tr('取消')}</button>
            <button className="btn" onClick={() => void go()} disabled={body === null || busy}>{busy ? tr('處理中…') : tr(GO[kind])}</button>
          </div>
        </div>
        <div className="xp-prev">
          <div className="xp-prev-head">{tr('預覽')}{paged ? `（${o.paper}${o.landscape ? tr('橫向') : ''}，${tr('連續顯示，實際輸出會依頁高分頁')}）` : ''}</div>
          {body === null ? <div className="hist-hint">{tr('載入中…')}</div> : <iframe title="preview" sandbox="" srcDoc={preview} />}
        </div>
      </div>
    </div>
  )
}
