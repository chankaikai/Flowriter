import { useEffect, useRef, useState } from 'react'
import { loadSettings } from '@/lib/settings'
import { applyThemeVars, isDarkTheme } from '@/lib/themes'

/** 全域快捷鍵叫出的收件匣小視窗：Enter 存入 Inbox.md，Esc 關閉。 */
export default function InboxWindow() {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'fail'>('idle')
  const ta = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const s = loadSettings()
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const id = s.theme === 'system' ? (dark ? 'dark' : 'light') : s.theme
    const root = document.documentElement
    root.dataset.theme = id
    applyThemeVars(root, id)
    root.style.setProperty('color-scheme', isDarkTheme(id) ? 'dark' : 'light')
    ta.current?.focus()
  }, [])

  const save = async () => {
    if (!text.trim() || state === 'saving') return
    setState('saving')
    const ok = await window.api.inboxAppend(text)
    if (ok) window.api.inboxClose()
    else setState('fail')
  }

  return (
    <div className="inbox-win">
      <textarea
        ref={ta}
        value={text}
        placeholder="記下一個念頭…  Enter 存入收件匣，Shift+Enter 換行，Esc 取消"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') window.api.inboxClose()
          else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void save()
          }
        }}
      />
      <div className="inbox-foot">{state === 'fail' ? '儲存失敗，請再試一次' : '會附上時間，加到 文件/Flowiter/Inbox.md'}</div>
    </div>
  )
}
