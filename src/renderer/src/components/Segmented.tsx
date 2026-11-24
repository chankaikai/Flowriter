import { useRef } from 'react'
import { usePill } from '@/lib/pill'

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
    <div className={`segmented ${className ?? ''}`} ref={ref} role="tablist">
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
          {o.label}
        </button>
      ))}
    </div>
  )
}
