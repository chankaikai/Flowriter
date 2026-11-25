import { useEffect, useRef, useState } from 'react'
import { tr } from '@/lib/i18n'

export interface PromptRequest {
  title: string
  initial?: string
  placeholder?: string
  /** 輸入框是否為密碼 */
  secret?: boolean
  okLabel?: string
  resolve(value: string | null): void
}

/** Electron 不支援 window.prompt，所以用玻璃對話框代替。 */
export function TextPrompt({ req }: { req: PromptRequest | null }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!req) return
    setValue(req.initial ?? '')
    requestAnimationFrame(() => ref.current?.select())
  }, [req])
  if (!req) return null
  const done = (v: string | null) => req.resolve(v)
  return (
    <div className="prompt-scrim" onMouseDown={() => done(null)}>
      <div className="prompt-box" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{req.title}</h3>
        <input
          ref={ref} className="ai-input" autoFocus spellCheck={false} value={value}
          type={req.secret ? 'password' : 'text'} placeholder={req.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') done(value)
            if (e.key === 'Escape') done(null)
          }}
        />
        <div className="pop-actions">
          <button className="btn" onClick={() => done(value)}>{req.okLabel ?? '確定'}</button>
          <button className="btn ghost" onClick={() => done(null)}>{tr('取消')}</button>
        </div>
      </div>
    </div>
  )
}
