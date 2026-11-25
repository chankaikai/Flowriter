import { useState } from 'react'
import { isOrphan, type Note } from '@/lib/notes'
import { Icon } from './Icon'

interface Props {
  /** 檔案是否已存檔；未存檔時沒有地方放 notes.json */
  saved: boolean
  notes: Note[]
  md: string
  /** 開啟面板時選取的文字，作為新便條的錨點 */
  selection: string
  onAdd(quote: string, text: string): void
  onToggle(id: string, done: boolean): void
  onRemove(id: string): void
  onJump(quote: string): void
}

export function NotesPanel({ saved, notes, md, selection, onAdd, onToggle, onRemove, onJump }: Props) {
  const [text, setText] = useState('')
  if (!saved) return <div className="side-empty"><p>先儲存檔案，便條才有地方存放（存在文件旁的 .inkwell/notes.json，不會寫進 .md）。</p></div>
  const submit = () => {
    if (!text.trim()) return
    onAdd(selection, text)
    setText('')
  }
  return (
    <div className="notes-panel">
      <div className="notes-new">
        <div className="notes-quote">{selection ? `「${selection.slice(0, 60)}」` : '未選取文字：先在文中選一段再開啟，便條才會錨定在那裡'}</div>
        <textarea
          value={text}
          rows={3}
          placeholder="寫下便條…（Ctrl/⌘+Enter 新增）"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && submit()}
        />
        <button className="btn" disabled={!text.trim()} onClick={submit}>新增便條</button>
      </div>
      {notes.length === 0 ? (
        <div className="side-empty"><p>這份文件還沒有便條</p></div>
      ) : (
        <ul className="notes-list">
          {notes.map((n) => {
            const orphan = isOrphan(md, n.quote)
            return (
              <li
                key={n.id}
                className={`note${n.done ? ' done' : ''}${orphan ? ' orphan' : ''}${n.quote && !orphan ? ' jumpable' : ''}`}
                onClick={(e) => {
                  if (n.quote && !orphan && !(e.target as HTMLElement).closest('button')) onJump(n.quote)
                }}
              >
                {n.quote && (
                  <button className="note-quote" disabled={orphan} onClick={() => onJump(n.quote)} title={orphan ? '原文已被改動，找不到位置' : '跳到原文'}>
                    「{n.quote.slice(0, 50)}」{orphan && ' · 失聯'}
                  </button>
                )}
                <div className="note-text">{n.text}</div>
                <div className="note-ops">
                  <span>{new Date(n.ts).toLocaleDateString()}</span>
                  <button onClick={() => onToggle(n.id, !n.done)}>{n.done ? '重新開啟' : '完成'}</button>
                  <button onClick={() => onRemove(n.id)} title="刪除"><Icon name="close" size={12} /></button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
