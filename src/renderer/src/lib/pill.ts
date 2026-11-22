import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

// 帶過衝的彈簧曲線（CSS linear() 緩動，Chromium 原生支援）
const SPRING = 'linear(0, 0.2 6%, 0.62 15%, 0.95 26%, 1.1 36%, 1.12 42%, 1.06 52%, 0.99 66%, 1.005 80%, 1)'

/**
 * 玻璃膠囊：跟隨「當前項」滑動。
 * 移動時先朝運動方向拉長（領先邊緣先到），再縮回目標尺寸並帶彈性回彈；
 * 目標元素以 data-key 標記，位置以 offsetLeft/Width 量測，所以不受子元素 transform 影響。
 */
export function usePill(
  container: RefObject<HTMLElement | null>,
  pill: RefObject<HTMLElement | null>,
  activeKey: string | null,
  /** 子項增減或尺寸變化時遞增，讓膠囊重新貼合 */
  version?: unknown
): void {
  const placed = useRef(false)

  const find = (c: HTMLElement, key: string) =>
    Array.from(c.querySelectorAll<HTMLElement>('[data-key]')).find((el) => el.dataset.key === key) ?? null

  useLayoutEffect(() => {
    const c = container.current
    const p = pill.current
    if (!c || !p) return
    const target = activeKey ? find(c, activeKey) : null

    if (!target) {
      placed.current = false
      p.getAnimations().forEach((a) => a.cancel())
      p.style.opacity = '0'
      p.style.transform = 'scale(0.85)'
      return
    }

    const to = { l: target.offsetLeft, w: target.offsetWidth }
    p.style.top = `${target.offsetTop}px`
    p.style.height = `${target.offsetHeight}px`
    p.style.opacity = '1'
    p.style.transform = 'none'

    if (!placed.current) {
      placed.current = true
      p.getAnimations().forEach((a) => a.cancel())
      p.style.left = `${to.l}px`
      p.style.width = `${to.w}px`
      return
    }

    const from = { l: p.offsetLeft, w: p.offsetWidth }
    if (Math.abs(from.l - to.l) < 0.5 && Math.abs(from.w - to.w) < 0.5) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      p.getAnimations().forEach((a) => a.cancel())
      p.style.left = `${to.l}px`
      p.style.width = `${to.w}px`
      return
    }

    p.getAnimations().forEach((a) => a.cancel())
    const right = to.l > from.l
    const stretch = right
      ? { left: `${from.l}px`, width: `${to.l + to.w - from.l}px` }
      : { left: `${to.l}px`, width: `${from.l + from.w - to.l}px` }
    p.style.left = `${to.l}px`
    p.style.width = `${to.w}px`

    const a1 = p.animate(
      [
        { left: `${from.l}px`, width: `${from.w}px`, transform: 'scaleY(1)' },
        { ...stretch, transform: 'scaleY(0.9)' }
      ],
      { duration: 130, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' }
    )
    a1.onfinish = () => {
      const a2 = p.animate(
        [
          { ...stretch, transform: 'scaleY(0.9)' },
          { left: `${to.l}px`, width: `${to.w}px`, transform: 'scaleY(1)' }
        ],
        { duration: 560, easing: SPRING, fill: 'forwards' }
      )
      a2.onfinish = () => {
        a1.cancel()
        a2.cancel() // 行內樣式已是最終值
      }
    }
  }, [activeKey, container, pill, version])

  // 視窗縮放時直接貼合，不做動畫
  useEffect(() => {
    const c = container.current
    const p = pill.current
    if (!c || !p || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (!activeKey || p.getAnimations().length) return
      const t = find(c, activeKey)
      if (!t) return
      p.style.left = `${t.offsetLeft}px`
      p.style.width = `${t.offsetWidth}px`
      p.style.top = `${t.offsetTop}px`
      p.style.height = `${t.offsetHeight}px`
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [activeKey, container, pill])
}
