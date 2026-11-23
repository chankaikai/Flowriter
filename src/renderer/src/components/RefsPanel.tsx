import { useState } from 'react'
import { isUrl, type Ref } from '@/lib/refs'
import { formatRefQuote } from '@/lib/refs'

interface Props {
  saved: boolean
  refs: Ref[]
  /** 開啟時選取的文字，預填進內容 */
  selection: string
  onAdd(r: { title: string; source: string; body: string }): void
  onRemove(id: string): void
  onInsert(md: string): void
}

export function RefsPanel({ saved, refs, selection, onAdd, onRemove, onInsert }: Props) {
  const [title, setTitle] = useState('')
  const [source, setSource] = useState('')
  const [body, setBody] = useState(selection)
  if (!saved) return <p className="pop-empty">先儲存檔案，參考資料才有地方存放（存在文件旁的 .inkwell/refs.json，不會寫進 .md）。</p>
  const add = () => {
    if (!body.trim()) return
    onAdd({ title, source, body })
    setTitle('')
    setSource('')
    setBody('')
  }
  return (
    <div className="notes-panel">
      <div className="notes-new">
        <input className="refs-in" value={title} placeholder="標題（書名、文章名）" onChange={(e) => setTitle(e.target.value)} />
        <input className="refs-in" value={source} placeholder="來源（網址或頁碼，可留空）" onChange={(e) => setSource(e.target.value)} />
        <textarea value={body} rows={4} placeholder="貼上要留作參考的內容…" onChange={(e) => setBody(e.target.value)} />
        <button className="btn" disabled={!body.trim()} onClick={add}>收進抽屜</button>
      </div>
      {refs.length === 0 ? (
        <div className="side-empty"><p>這份文件的抽屜是空的</p></div>
      ) : (
        <ul className="notes-list">
          {refs.map((r) => (
            <li key={r.id} className="note">
              {(r.title || r.source) && (
                <div className="note-quote" style={{ cursor: 'default' }}>
                  {r.title || r.source}
                  {isUrl(r.source) && (
                    <>
                      {' · '}
                      <a href={r.source} onClick={(e) => { e.preventDefault(); window.api.openExternal(r.source) }}>開啟來源</a>
                    </>
                  )}
                </div>
              )}
              <div className="note-text">{r.body.length > 240 ? r.body.slice(0, 240) + '…' : r.body}</div>
              <div className="note-ops">
                <span>{new Date(r.ts).toLocaleDateString()}</span>
                <button onClick={() => onInsert(formatRefQuote(r))}>插入為引用</button>
                <button onClick={() => onRemove(r.id)}>刪除</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
