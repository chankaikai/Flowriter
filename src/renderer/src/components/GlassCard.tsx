import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** 隨游標 3D 傾斜（最大 4°） */
  tilt?: boolean
  /** 邊緣流光 */
  beam?: boolean
}

const MAX_TILT = 4

/**
 * 磨砂玻璃卡片：
 *  - 游標處顯示柔和徑向光斑，靠近游標的邊框局部提亮
 *  - 隨游標位置 3D 傾斜（≤4°），移出後以緩動復原（rAF 插值，進出都平滑）
 *  - Border Beam 邊緣流光
 */
export const GlassCard = forwardRef<HTMLDivElement, Props>(function GlassCard(
  { tilt = true, beam = true, className = '', children, ...rest },
  fwd
) {
  const ref = useRef<HTMLDivElement>(null)
  useImperativeHandle(fwd, () => ref.current as HTMLDivElement)
  const s = useRef({ tx: 0, ty: 0, cx: 0, cy: 0, raf: 0 })
  const reduce = useRef(false)

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const st = s.current
    return () => cancelAnimationFrame(st.raf)
  }, [])

  const loop = useCallback(() => {
    const el = ref.current
    const st = s.current
    if (!el) return
    st.cx += (st.tx - st.cx) * 0.14
    st.cy += (st.ty - st.cy) * 0.14
    const done = Math.abs(st.tx - st.cx) < 0.01 && Math.abs(st.ty - st.cy) < 0.01
    if (done) {
      st.cx = st.tx
      st.cy = st.ty
    }
    el.style.setProperty('--rx', `${st.cx.toFixed(3)}deg`)
    el.style.setProperty('--ry', `${st.cy.toFixed(3)}deg`)
    st.raf = done ? 0 : requestAnimationFrame(loop)
  }, [])

  const kick = () => {
    if (!s.current.raf) s.current.raf = requestAnimationFrame(loop)
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    rest.onPointerMove?.(e)
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    el.style.setProperty('--mx', `${x}px`)
    el.style.setProperty('--my', `${y}px`)
    if (tilt && !reduce.current) {
      const clamp = (v: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, v))
      s.current.ty = clamp((x / r.width - 0.5) * 2 * MAX_TILT)
      s.current.tx = clamp(-(y / r.height - 0.5) * 2 * MAX_TILT)
      kick()
    }
  }

  const onLeave = (e: React.PointerEvent<HTMLDivElement>) => {
    rest.onPointerLeave?.(e)
    s.current.tx = 0
    s.current.ty = 0
    kick()
  }

  return (
    <div {...rest} ref={ref} className={`gcard ${className}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      <span className="gedge" aria-hidden />
      {beam && (
        <>
          <span className="gbeam glow" aria-hidden />
          <span className="gbeam" aria-hidden />
        </>
      )}
      <div className="gcontent">{children}</div>
    </div>
  )
})
