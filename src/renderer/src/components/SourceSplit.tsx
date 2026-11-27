import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { buildHtmlDocument, renderHtmlBody } from '@/export/exportHtml'
import { Icon } from './Icon'
import { tr } from '@/lib/i18n'

export type SrcLayout = 'only' | 'split'

interface Props {
  layout: SrcLayout
  /** true = 預覽在左、源碼在右 */
  swap: boolean
  /** 左側窗格占的比例（0.25–0.75） */
  ratio: number
  onLayout(l: SrcLayout): void
  onSwap(): void
  onRatio(r: number): void
  /** 源碼編輯器 */
  source: ReactNode
  /** 預覽用：目前的 Markdown、文件標題、文件所在資料夾；rev 變動就重新渲染 */
  getMd(): string
  rev: number
  title: string
  docDir: string | null
}

/**
 * 源碼模式的檢視方式：
 * 「僅源碼」或「分割檢視」（一邊源碼、一邊渲染後的預覽），中間的分隔線可拖曳調整寬度，
 * 也可以左右互換。預覽放在沙盒 iframe 裡（不執行任何腳本），所以文件裡的 HTML 碰不到程式本身。
 */
export function SourceSplit(p: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const ratio = drag ?? p.ratio

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const el = box.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const clamp = (x: number) => Math.max(0.25, Math.min(0.75, (x - rect.left) / rect.width))
      // 拖曳期間：指標抓在分隔線上，並蓋住預覽 iframe，否則滑鼠一進 iframe 就收不到事件，拖起來會卡頓、斷掉
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
      el.classList.add('dragging')
      let raf = 0
      let lastX = e.clientX
      const move = (ev: PointerEvent) => {
        lastX = ev.clientX
        if (raf) return
        raf = requestAnimationFrame(() => { raf = 0; setDrag(clamp(lastX)) })
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        if (raf) cancelAnimationFrame(raf)
        el.classList.remove('dragging')
        const r = clamp(ev.clientX ?? lastX)
        setDrag(null)
        p.onRatio(r)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [p]
  )

  return (
    <div className="src-wrap">
      <div className="src-bar">
        <div className="src-seg" role="tablist">
          <button className={p.layout === 'only' ? 'on' : ''} onClick={() => p.onLayout('only')}>{tr('僅源碼')}</button>
          <button className={p.layout === 'split' ? 'on' : ''} onClick={() => p.onLayout('split')}>{tr('源碼＋預覽')}</button>
        </div>
        {p.layout === 'split' && (
          <button className="src-swap" title={tr('左右互換（源碼／預覽）')} onClick={p.onSwap}>
            <Icon name="swap" size={15} />
            <span>{tr('左右互換')}</span>
          </button>
        )}
      </div>
      {p.layout === 'only' ? (
        <div className="src-only">{p.source}</div>
      ) : (
        <div className="src-split" ref={box} style={{ gridTemplateColumns: `${ratio}fr 6px ${1 - ratio}fr` }}>
          <div className="src-pane">{p.swap ? <Preview {...p} box={box} /> : p.source}</div>
          <div className="src-divider" role="separator" aria-orientation="vertical" onPointerDown={onDown} onDoubleClick={() => p.onRatio(0.5)} title={tr('拖曳調整寬度，雙擊還原')} />
          <div className="src-pane">{p.swap ? p.source : <Preview {...p} box={box} />}</div>
        </div>
      )}
    </div>
  )
}

function Preview({ getMd, rev, title, docDir, box }: Pick<Props, 'getMd' | 'rev' | 'title' | 'docDir'> & { box: RefObject<HTMLDivElement | null> }) {
  const [html, setHtml] = useState('')
  const seq = useRef(0)
  const frame = useRef<HTMLIFrameElement>(null)
  const ratio = useRef(0)
  const lock = useRef(0)
  useEffect(() => {
    const my = ++seq.current
    const t = window.setTimeout(() => {
      void renderHtmlBody(getMd(), docDir)
        .then((body) => {
          if (my === seq.current) setHtml(buildHtmlDocument(title, body))
        })
        .catch(() => undefined)
    }, 250)
    return () => window.clearTimeout(t)
  }, [rev, getMd, title, docDir])

  // 捲動同步：源碼 ⇄ 預覽（依捲動比例；邊界用短暫鎖避免互相觸發）
  const pct = (el: { scrollTop: number; scrollHeight: number; clientHeight: number }) => {
    const m = el.scrollHeight - el.clientHeight
    return m > 0 ? el.scrollTop / m : 0
  }
  const setPct = (el: { scrollTop: number; scrollHeight: number; clientHeight: number }, r: number) => {
    el.scrollTop = r * Math.max(0, el.scrollHeight - el.clientHeight)
  }
  const srcScroller = () => box.current?.querySelector<HTMLElement>('.cm-scroller') ?? null
  const hold = () => { lock.current = Date.now() + 120 }

  useEffect(() => {
    const sc = srcScroller()
    if (!sc) return
    const onSrc = () => {
      if (Date.now() < lock.current) return
      ratio.current = pct(sc)
      const doc = frame.current?.contentDocument?.documentElement
      if (doc) { hold(); setPct(doc, ratio.current) }
    }
    sc.addEventListener('scroll', onSrc, { passive: true })
    return () => sc.removeEventListener('scroll', onSrc)
  }, [box, html])

  // 預覽重新載入後：還原捲動位置（否則每打一個字預覽就跳回頂端），並接上預覽→源碼的同步
  const onLoad = () => {
    const doc = frame.current?.contentDocument
    const win = frame.current?.contentWindow
    const sc = srcScroller()
    if (!doc || !win) return
    if (sc) ratio.current = pct(sc)
    hold()
    setPct(doc.documentElement, ratio.current)
    win.addEventListener('scroll', () => {
      if (Date.now() < lock.current) return
      const s2 = srcScroller()
      if (!s2) return
      ratio.current = pct(doc.documentElement)
      hold()
      setPct(s2, ratio.current)
    }, { passive: true })
  }
  // allow-same-origin 只為了讓外層能設定預覽的捲動位置；沒有 allow-scripts，所以文件裡的 HTML 仍然不能執行任何腳本
  return <iframe ref={frame} className="src-preview" sandbox="allow-same-origin" title={tr('預覽')} srcDoc={html} onLoad={onLoad} />
}
