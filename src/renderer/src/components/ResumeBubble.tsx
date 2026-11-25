import { useEffect, useState } from 'react'
import { tr } from '@/lib/i18n'

/** 重新打開文件、游標跳回上次落筆處時顯示；任何按鍵或點擊後消失。 */
export function ResumeBubble({
  hint, rect, onDone
}: { hint: string | null; rect: { left: number; top: number; bottom: number } | null; onDone(): void }) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!rect) return
    const show = requestAnimationFrame(() => setShown(true))
    const off = () => onDone()
    const t = window.setTimeout(off, 14_000)
    window.addEventListener('keydown', off, true)
    window.addEventListener('mousedown', off, true)
    return () => {
      cancelAnimationFrame(show)
      window.clearTimeout(t)
      window.removeEventListener('keydown', off, true)
      window.removeEventListener('mousedown', off, true)
    }
  }, [rect, onDone])
  if (!rect) return null
  const below = rect.top < 90
  return (
    <div
      className={`resume-bubble${shown ? ' in' : ''}${below ? ' below' : ''}`}
      style={{ left: Math.min(window.innerWidth - 40, Math.max(40, rect.left)), top: below ? rect.bottom + 12 : rect.top - 12 }}
    >
      <b>{tr('上次寫到這裡')}</b>
      {hint && <span>接續提示：{hint}</span>}
    </div>
  )
}
