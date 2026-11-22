import { Fragment, useEffect, useRef, useState } from 'react'
import { usePill } from '@/lib/pill'
import { Icon, type IconName } from './Icon'

export interface DockItem {
  key: string
  label: string
  icon: IconName
  hint?: string
  /** 開關類功能目前是否開啟（顯示小圓點） */
  toggled?: boolean
  run(): void
}

const BASE = 46 // 單格寬度
const SIGMA = 46 // 放大影響範圍：相鄰圖示會跟隨放大
const PEAK = 0.55 // 最大額外放大量

/**
 * 底部居中的浮動玻璃停靠欄，只放圖標。
 * 懸停時當前圖標放大，相鄰圖標按高斯衰減跟隨放大；上方顯示名稱。
 * 「當前項」（側欄頁籤）以玻璃膠囊做底，切換時滑動。
 */
export function Dock({ groups, currentKey }: { groups: DockItem[][]; currentKey: string | null }) {
  const itemsRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const els = useRef<(HTMLButtonElement | null)[]>([])
  const cur = useRef<number[]>([])
  const tgt = useRef<number[]>([])
  const raf = useRef(0)
  const [hot, setHot] = useState<string | null>(null)
  usePill(itemsRef, pillRef, currentKey)

  const flat = groups.flat()

  const tick = () => {
    let moving = false
    flat.forEach((_, i) => {
      const c = cur.current[i] ?? 1
      const t = tgt.current[i] ?? 1
      const n = c + (t - c) * 0.24
      cur.current[i] = Math.abs(t - n) < 0.002 ? t : n
      if (cur.current[i] !== t) moving = true
      els.current[i]?.style.setProperty('--s', cur.current[i].toFixed(3))
    })
    raf.current = moving ? requestAnimationFrame(tick) : 0
  }
  const kick = () => {
    if (!raf.current) raf.current = requestAnimationFrame(tick)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const onMove = (e: React.PointerEvent) => {
    let best = -1
    let bestD = Infinity
    flat.forEach((_, i) => {
      const el = els.current[i]
      if (!el) return
      const r = el.getBoundingClientRect()
      const d = Math.abs(e.clientX - (r.left + r.width / 2))
      tgt.current[i] = 1 + PEAK * Math.exp(-(d * d) / (2 * SIGMA * SIGMA))
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setHot(best >= 0 ? flat[best].key : null)
    kick()
  }
  const onLeave = () => {
    flat.forEach((_, i) => (tgt.current[i] = 1))
    setHot(null)
    kick()
  }

  let idx = -1
  return (
    <nav className="dock" aria-label="工具列" onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="dock-items" ref={itemsRef} style={{ ['--slot' as string]: `${BASE}px` }}>
        <span className="glass-pill dock-pill" ref={pillRef} />
        {groups.map((g, gi) => (
          <Fragment key={gi}>
            {gi > 0 && <i className="dock-sep" />}
            {g.map((it) => {
              const i = ++idx
              return (
                <button
                  key={it.key}
                  ref={(el) => {
                    els.current[i] = el
                  }}
                  data-key={it.key}
                  data-hot={hot === it.key}
                  className={`dock-item${it.toggled ? ' toggled' : ''}${currentKey === it.key ? ' current' : ''}`}
                  onClick={it.run}
                  aria-label={it.label}
                >
                  <span className="dock-label">
                    {it.label}
                    {it.hint && <kbd>{it.hint}</kbd>}
                  </span>
                  <span className="dock-icon">
                    <Icon name={it.icon} size={20} />
                  </span>
                  <i className="dock-dot" />
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </nav>
  )
}
