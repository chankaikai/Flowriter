import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GlassCard } from './GlassCard'
import { Icon, type IconName } from './Icon'

type Phase = 'closed' | 'opening' | 'open' | 'closing'

const OPEN_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const CLOSE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const toRect = (r: DOMRect): Rect => ({ left: r.left, top: r.top, width: r.width, height: r.height })
const css = (r: Rect) => ({
  left: `${r.left}px`,
  top: `${r.top}px`,
  width: `${r.width}px`,
  height: `${r.height}px`
})

/**
 * 卡片：點擊按鈕後原位放大為詳情視圖（共享元素 FLIP），關閉時沿原路收回。
 * 詳情以 portal 掛到 body，避免被抽屜的 transform 影響 fixed 定位。
 */
export function ExpandCard({
  icon,
  title,
  summary,
  wide,
  children
}: {
  icon: IconName
  title: string
  summary: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('closed')
  const origin = useRef<Rect | null>(null)
  const target = useRef<Rect>({ left: 40, top: 40, width: 480, height: 600 })

  const computeTarget = (): Rect => {
    const d = cardRef.current?.closest('.drawer')?.getBoundingClientRect()
    if (!d) return { left: 40, top: 40, width: window.innerWidth - 80, height: window.innerHeight - 80 }
    return { left: d.left + 12, top: d.top + 12, width: d.width - 24, height: d.height - 24 }
  }

  const open = () => {
    if (phase !== 'closed' || !cardRef.current) return
    origin.current = toRect(cardRef.current.getBoundingClientRect())
    target.current = computeTarget()
    setPhase('opening')
  }
  const close = () => {
    if (phase === 'open') setPhase('closing')
  }

  useLayoutEffect(() => {
    const el = detailRef.current
    if (!el) return
    if (phase === 'opening' && origin.current) {
      const a = el.animate([css(origin.current), css(target.current)], {
        duration: 560,
        easing: OPEN_EASE,
        fill: 'forwards'
      })
      a.onfinish = () => {
        a.cancel()
        setPhase('open')
      }
    } else if (phase === 'closing') {
      const from = toRect(el.getBoundingClientRect())
      const back = cardRef.current ? toRect(cardRef.current.getBoundingClientRect()) : origin.current!
      const a = el.animate([css(from), css(back)], { duration: 420, easing: CLOSE_EASE, fill: 'forwards' })
      a.onfinish = () => setPhase('closed')
    }
  }, [phase])

  // 展開期間 Esc 先關閉詳情（不連帶關掉抽屜）
  useEffect(() => {
    if (phase !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setPhase('closing')
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [phase])

  const showDetail = phase !== 'closed'

  return (
    <>
      <GlassCard
        ref={cardRef}
        className={`xcard${wide ? ' wide' : ''}`}
        style={{ opacity: showDetail ? 0 : 1 }}
        onClick={open}
      >
        <div className="xcard-head">
          <span className="xcard-icon">
            <Icon name={icon} size={17} />
          </span>
          <span className="xcard-title">{title}</span>
        </div>
        <div className="xcard-summary">{summary}</div>
        <button
          className="xcard-btn"
          onClick={(e) => {
            e.stopPropagation()
            open()
          }}
        >
          調整
          <Icon name="chevron" size={13} />
        </button>
      </GlassCard>

      {showDetail &&
        createPortal(
          <GlassCard
            ref={detailRef}
            tilt={false}
            className="xdetail"
            style={css(target.current)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={`xd-inner ${phase}`}>
              <div className="xd-head">
                <span className="xcard-icon">
                  <Icon name={icon} size={17} />
                </span>
                <h2>{title}</h2>
                <button className="icon-btn" onClick={close} title="返回 (Esc)">
                  <Icon name="close" />
                </button>
              </div>
              <div className="xd-body">{children}</div>
            </div>
          </GlassCard>,
          document.body
        )}
    </>
  )
}
