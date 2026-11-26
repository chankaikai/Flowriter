import { useEffect, useState } from 'react'
import { computeStats } from '@/lib/markdown'
import { Icon, type IconName } from './Icon'
import { tr } from '@/lib/i18n'

export interface BubbleAction {
  id: string
  label: string
  icon: IconName
  run(): void
}

interface Info {
  x: number
  y: number
  below: boolean
  words: number
  minutes: number
}

/**
 * 框選文字時，在選區「下方」顯示字數與常用工具（Crepe 自己的格式工具列在上方，兩者不會互相遮擋）。
 */
export function SelectionBubble({ actions }: { actions: BubbleAction[] }) {
  const [info, setInfo] = useState<Info | null>(null)

  useEffect(() => {
    let timer = 0
    const update = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setInfo(null)
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      if (!anchor?.closest('.editor-scroll')) return setInfo(null)
      const text = sel.toString()
      if (!text.trim()) return setInfo(null)
      const words = computeStats(text).words
      const r = sel.getRangeAt(0).getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return setInfo(null)
      const below = true
      setInfo({
        x: Math.min(window.innerWidth - 120, Math.max(120, r.left + r.width / 2)),
        y: Math.min(r.bottom + 10, window.innerHeight - 96),
        below,
        words,
        minutes: words / 300
      })
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(update, 120)
    }
    document.addEventListener('selectionchange', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('selectionchange', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [])

  if (!info) return null
  const t =
    info.minutes < 0.2 ? `約 ${Math.max(1, Math.round(info.minutes * 60))} 秒` : `約 ${info.minutes.toFixed(1)} 分鐘`
  return (
    <div
      className={`sel-bubble${info.below ? ' below' : ''}`}
      style={{ left: Math.min(window.innerWidth - 220, Math.max(220, info.x)), top: info.y }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {info.words >= 2 && (
        <span className="sb-count">
          {info.words.toLocaleString()} 字<i />
          {t}
        </span>
      )}
      {actions.map((a) => (
        <button key={a.id} className="sb-act" title={tr(a.label)} onClick={a.run}>
          <Icon name={a.icon} size={14} />
          <span>{tr(a.label)}</span>
        </button>
      ))}
    </div>
  )
}
