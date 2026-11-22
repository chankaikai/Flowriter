import { useEffect, useState } from 'react'
import { computeStats } from '@/lib/markdown'

interface Info {
  x: number
  y: number
  below: boolean
  words: number
  minutes: number
}

/** 框選文字時，在選區上方顯示「選中 N 字 | 約 X 分鐘讀完」。 */
export function SelectionBubble() {
  const [info, setInfo] = useState<Info | null>(null)

  useEffect(() => {
    let timer = 0
    const update = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setInfo(null)
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      if (!anchor?.closest('.editor-scroll')) return setInfo(null)
      const text = sel.toString()
      const words = computeStats(text).words
      if (words < 2) return setInfo(null)
      const r = sel.getRangeAt(0).getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return setInfo(null)
      const below = r.top < 56
      setInfo({
        x: Math.min(window.innerWidth - 120, Math.max(120, r.left + r.width / 2)),
        y: below ? r.bottom + 10 : r.top - 10,
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
    <div className={`sel-bubble${info.below ? ' below' : ''}`} style={{ left: info.x, top: info.y }}>
      選中 {info.words.toLocaleString()} 字<i /> {t}讀完
    </div>
  )
}
