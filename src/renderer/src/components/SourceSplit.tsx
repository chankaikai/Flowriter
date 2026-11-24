import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { buildHtmlDocument, renderHtmlBody } from '@/export/exportHtml'
import { Icon } from './Icon'

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
      const move = (ev: PointerEvent) => setDrag(Math.max(0.25, Math.min(0.75, (ev.clientX - rect.left) / rect.width)))
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const r = Math.max(0.25, Math.min(0.75, (ev.clientX - rect.left) / rect.width))
        setDrag(null)
        p.onRatio(r)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [p]
  )

  return (
    <div className="src-wrap">
      <div className="src-bar">
        <div className="src-seg" role="tablist">
          <button className={p.layout === 'only' ? 'on' : ''} onClick={() => p.onLayout('only')}>僅源碼</button>
          <button className={p.layout === 'split' ? 'on' : ''} onClick={() => p.onLayout('split')}>源碼＋預覽</button>
        </div>
        {p.layout === 'split' && (
          <button className="src-swap" title="左右互換（源碼／預覽）" onClick={p.onSwap}>
            <Icon name="swap" size={15} />
            <span>左右互換</span>
          </button>
        )}
      </div>
      {p.layout === 'only' ? (
        <div className="src-only">{p.source}</div>
      ) : (
        <div className="src-split" ref={box} style={{ gridTemplateColumns: `${ratio}fr 6px ${1 - ratio}fr` }}>
          <div className="src-pane">{p.swap ? <Preview {...p} /> : p.source}</div>
          <div className="src-divider" role="separator" aria-orientation="vertical" onPointerDown={onDown} onDoubleClick={() => p.onRatio(0.5)} title="拖曳調整寬度，雙擊還原" />
          <div className="src-pane">{p.swap ? p.source : <Preview {...p} />}</div>
        </div>
      )}
    </div>
  )
}

function Preview({ getMd, rev, title, docDir }: Pick<Props, 'getMd' | 'rev' | 'title' | 'docDir'>) {
  const [html, setHtml] = useState('')
  const seq = useRef(0)
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
  // sandbox="" ＝ 不允許腳本、表單、彈窗、同源存取
  return <iframe className="src-preview" sandbox="" title="預覽" srcDoc={html} />
}
