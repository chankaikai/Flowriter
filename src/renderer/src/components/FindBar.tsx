import { useEffect, useRef, useState } from 'react'
import type { EditorHandle } from '@/editor/MarkdownEditor'
import type { SearchInfo } from '@/editor/plugins'
import { Icon } from './Icon'

export function FindBar({
  mode,
  editor,
  focusSignal,
  onClose
}: {
  mode: 'find' | 'replace' | null
  editor: EditorHandle | null
  focusSignal: number
  onClose(): void
}) {
  const [query, setQuery] = useState('')
  const [rep, setRep] = useState('')
  const [cs, setCs] = useState(false)
  const [info, setInfo] = useState<SearchInfo>({ total: 0, current: -1 })
  const findRef = useRef<HTMLInputElement>(null)
  const open = mode !== null

  useEffect(() => {
    if (!open) return
    findRef.current?.focus()
    findRef.current?.select()
  }, [open, focusSignal])

  useEffect(() => {
    if (!open || !editor) return
    setInfo(query ? editor.find(query, cs) : (editor.clearFind(), { total: 0, current: -1 }))
  }, [query, cs, open, editor])

  useEffect(() => {
    if (!open && editor) editor.clearFind()
  }, [open, editor])

  const step = (dir: 1 | -1) => editor && setInfo(editor.findStep(dir))

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      editor?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      step(e.shiftKey ? -1 : 1)
    }
  }

  return (
    <div className={`findbar${open ? ' open' : ''}`} onKeyDown={onKeyDown}>
      <div className="find-row">
        <input
          ref={findRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="查找"
          spellCheck={false}
        />
        <span className="find-count">
          {query ? (info.total ? `${info.current + 1}/${info.total}` : '無結果') : ''}
        </span>
        <button className={`icon-btn sm txt${cs ? ' on' : ''}`} onClick={() => setCs(!cs)} title="區分大小寫">
          Aa
        </button>
        <button className="icon-btn sm" onClick={() => step(-1)} title="上一個 (Shift+Enter)">
          <Icon name="up" size={16} />
        </button>
        <button className="icon-btn sm" onClick={() => step(1)} title="下一個 (Enter)">
          <Icon name="down" size={16} />
        </button>
        <button className="icon-btn sm" onClick={onClose} title="關閉 (Esc)">
          <Icon name="close" size={15} />
        </button>
      </div>
      {mode === 'replace' && (
        <div className="find-row">
          <input
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            placeholder="替換為"
            spellCheck={false}
          />
          <button className="btn sm" onClick={() => editor && setInfo(editor.replaceCurrent(rep))}>
            替換
          </button>
          <button className="btn sm" onClick={() => editor && setInfo(editor.replaceAll(rep))}>
            全部替換
          </button>
        </div>
      )}
    </div>
  )
}
