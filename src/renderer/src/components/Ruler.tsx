import { useEffect, useRef, useState, type RefObject } from 'react'

interface Tick {
  frac: number
  text: string
  level: number
  top: number
}

/** 頂部極細的章節進度線：顯示捲動進度，標題位置是刻度，點擊跳轉。 */
export function Ruler({ scrollRef, rev }: { scrollRef: RefObject<HTMLDivElement | null>; rev: unknown }) {
  const [ticks, setTicks] = useState<Tick[]>([])
  const [hover, setHover] = useState<number | null>(null)
  const fillRef = useRef<HTMLDivElement>(null)

  // 進度：只改 transform，不觸發 React 重繪
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let raf = 0
    const paint = () => {
      raf = 0
      const max = Math.max(1, sc.scrollHeight - sc.clientHeight)
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, sc.scrollTop / max)})`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint)
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    paint()
    return () => {
      sc.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollRef, rev])

  // 刻度：內容或視窗尺寸改變後重新量測（防抖）
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let timer = 0
    const measure = () => {
      const max = Math.max(1, sc.scrollHeight - sc.clientHeight)
      const base = sc.getBoundingClientRect().top
      const heads = sc.querySelectorAll<HTMLElement>(
        '.editor-col:not([style*="display: none"]) .ProseMirror :is(h1, h2, h3)'
      )
      const out: Tick[] = []
      heads.forEach((h) => {
        const text = (h.textContent || '').trim()
        if (!text) return
        const top = h.getBoundingClientRect().top - base + sc.scrollTop
        out.push({ frac: Math.min(1, Math.max(0, top / max)), text, level: Number(h.tagName[1]), top })
      })
      setTicks(out.length > 200 ? out.filter((t) => t.level <= 2) : out)
    }
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, 350)
    }
    schedule()
    window.addEventListener('resize', schedule)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('resize', schedule)
    }
  }, [scrollRef, rev])

  return (
    <div className="ruler" aria-hidden={ticks.length === 0}>
      <div className="ruler-fill" ref={fillRef} />
      {ticks.map((t, i) => (
        <button
          key={`${i}-${t.text}`}
          className={`ruler-tick l${t.level}`}
          style={{ left: `${t.frac * 100}%` }}
          aria-label={t.text}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onClick={() => scrollRef.current?.scrollTo({ top: Math.max(0, t.top - 24), behavior: 'smooth' })}
        />
      ))}
      {hover != null && ticks[hover] && (
        <div className="ruler-tip" style={{ left: `${Math.min(92, Math.max(8, ticks[hover].frac * 100))}%` }}>
          <i>H{ticks[hover].level}</i> {ticks[hover].text}
        </div>
      )}
    </div>
  )
}
