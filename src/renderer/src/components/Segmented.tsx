import { useRef } from 'react'
import { usePill } from '@/lib/pill'
import { tr } from '@/lib/i18n'

interface Option<T extends string> {
  value: T
  label: string
}

/** 分段控制：當前項以玻璃膠囊做底，切換時膠囊滑動、拉長並彈性回彈。 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className
}: {
  options: Option<T>[]
  value: T
  onChange(v: T): void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  usePill(ref, pillRef, value)
  return (
    <div
      className={`segmented ${className ?? ''}`}
      ref={ref}
      role="tablist"
      // 整條控制列都可點：依指標的水平位置挑最近的選項，不依賴元素命中（避免只有某個遠處才點得到）
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const box = ref.current?.getBoundingClientRect()
        if (!box || e.clientY < box.top || e.clientY > box.bottom) return
        let best: Option<T> | null = null
        let bestD = Infinity
        ref.current?.querySelectorAll<HTMLButtonElement>('button[data-key]').forEach((b) => {
          const r = b.getBoundingClientRect()
          const d = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0
          if (d < bestD) {
            bestD = d
            best = options.find((o) => o.value === b.dataset.key) ?? null
          }
        })
        const hit = best as Option<T> | null
        if (hit && hit.value !== value) {
          e.preventDefault()
          onChange(hit.value)
        }
      }}
    >
      <span className="glass-pill seg-pill" ref={pillRef} />
      {options.map((o) => (
        <button
          key={o.value}
          data-key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? 'on' : ''}
          onPointerDown={(e) => {
            if (e.button === 0) {
              e.preventDefault()
              if (o.value !== value) onChange(o.value)
            }
          }}
          onClick={(e) => {
            if (e.detail === 0 && o.value !== value) onChange(o.value)
          }}
        >
          {tr(o.label)}
        </button>
      ))}
    </div>
  )
}
