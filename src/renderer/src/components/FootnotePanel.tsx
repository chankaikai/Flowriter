import { useEffect, useState } from 'react'
import type { EditorHandle } from '@/editor/MarkdownEditor'
import type { FootnoteInfo } from '@/editor/extras'
import { validFootnoteLabel } from '@/editor/extras'
import type { Settings } from '@/lib/settings'
import { tr, trf } from '@/lib/i18n'

/**
 * 腳註：新建、交叉引用（同一個腳註可在多處引用）、改名、樣式。
 * 寫進 .md 的永遠是標準的 `[^名稱]` 與 `[^名稱]: 內容`；樣式與「是否顯示編號」只影響畫面。
 */
export function FootnotePanel({
  editor, settings, update, onClose
}: {
  editor: EditorHandle | null
  settings: Pick<Settings, 'fnStyle' | 'fnNumbers'>
  update(p: Partial<Settings>): void
  onClose(): void
}) {
  const [list, setList] = useState<FootnoteInfo[]>([])
  const [label, setLabel] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState('')

  const refresh = () => setList(editor?.footnotes() ?? [])
  useEffect(refresh, [editor])

  const create = () => {
    const l = label.trim()
    if (l && !validFootnoteLabel(l)) return setErr(tr('名稱不能有空白或 ] ，最長 30 字'))
    if (!editor?.insertFootnote(l || undefined)) return setErr(tr('目前無法插入腳註'))
    onClose()
  }
  const cite = (l: string) => {
    if (editor?.insertFootnote(l)) onClose()
  }
  const rename = (from: string) => {
    if (!validFootnoteLabel(draft.trim())) return setErr(tr('名稱不能有空白或 ] ，最長 30 字'))
    if (!editor?.renameFootnote(from, draft)) return setErr(tr('新名稱已被使用，或和原名稱相同'))
    setRenaming(null)
    setErr('')
    refresh()
  }

  const styles: { id: Settings['fnStyle']; text: string }[] = [
    { id: 'bracket', text: '[1]' },
    { id: 'plain', text: '¹' },
    { id: 'paren', text: '(1)' }
  ]

  return (
    <>
      <div className="hist-hint">{tr('在游標處插入腳註。名稱留空就用下一個數字；輸入已存在的名稱，就是再引用同一個腳註（像 Word 的交叉引用）。')}</div>
      <div className="pop-actions" style={{ justifyContent: 'flex-start' }}>
        <input className="radar-q" style={{ width: 150 }} value={label} placeholder={tr('名稱（可留空）')} onChange={(e) => { setLabel(e.target.value); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && create()} />
        <button className="btn" onClick={create}>{tr('插入腳註')}</button>
      </div>
      {err && <p className="pop-empty">{err}</p>}

      <div className="set-sep" />
      <div className="hist-hint">{tr('本文的腳註（點「引用」在游標處再引用一次）')}</div>
      <div className="link-list col">
        {list.map((f) => (
          <div key={f.label} className="fn-row" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 2px' }}>
            {renaming === f.label ? (
              <>
                <input className="radar-q" style={{ width: 110 }} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && rename(f.label)} />
                <button className="btn ghost" onClick={() => rename(f.label)}>{tr('確定')}</button>
                <button className="btn ghost" onClick={() => { setRenaming(null); setErr('') }}>{tr('取消')}</button>
              </>
            ) : (
              <>
                <b style={{ color: 'var(--accent)', minWidth: 28 }}>[{f.label}]</b>
                <small style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.75 }}>
                  {f.text || tr('（內容還沒寫）')} · {trf('{0} 處引用', f.refs)}
                </small>
                <button className="btn ghost" onClick={() => cite(f.label)}>{tr('引用')}</button>
                <button className="btn ghost" onClick={() => { setRenaming(f.label); setDraft(f.label); setErr('') }}>{tr('改名')}</button>
              </>
            )}
          </div>
        ))}
        {!list.length && <p className="pop-empty">{tr('這份文件還沒有腳註。')}</p>}
      </div>

      <div className="set-sep" />
      <div className="hist-hint">{tr('引用的樣式（只影響畫面，不會改動 .md）')}</div>
      <div className="pop-actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
        {styles.map((s) => (
          <button key={s.id} className={`btn ${settings.fnStyle === s.id ? '' : 'ghost'}`} onClick={() => update({ fnStyle: s.id })}>{s.text}</button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={settings.fnNumbers} onChange={(e) => update({ fnNumbers: e.target.checked })} />
          {tr('顯示編號')}
        </label>
      </div>
    </>
  )
}
