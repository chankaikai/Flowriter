import { useEffect, useMemo, useRef, useState } from 'react'
import { localSubgraph, type LinkGraph } from '../../../shared/linkGraph'
import { forceLayout } from '@/lib/forceLayout'
import { tr, trf } from '@/lib/i18n'

const W = 1000
const H = 640

/** 連結關係圖：整個資料夾的筆記與 [[連結]]／相對連結；可看全局或以目前文件為中心的局部圖。 */
export function GraphDialog({ folder, current, onOpen, onOpenGhost, onClose }: { folder: string; current: string | null; onOpen(path: string): void; onOpenGhost(name: string): void; onClose(): void }) {
  const [g, setG] = useState<(LinkGraph & { files: number }) | null>(null)
  const [mode, setMode] = useState<'local' | 'all'>(current ? 'local' : 'all')
  const [depth, setDepth] = useState(2)
  const [hideOrphans, setHideOrphans] = useState(true)
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  useEffect(() => {
    let live = true
    void window.api.graphBuild(folder).then((r) => live && setG(r))
    return () => { live = false }
  }, [folder])
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const shown = useMemo<LinkGraph | null>(() => {
    if (!g) return null
    let s: LinkGraph = g
    if (mode === 'local' && current) s = localSubgraph(g, current, depth)
    if (hideOrphans && mode === 'all') {
      const used = new Set<string>()
      for (const e of s.edges) (used.add(e.s), used.add(e.t))
      s = { ...s, nodes: s.nodes.filter((n) => used.has(n.id)) }
    }
    return s
  }, [g, mode, depth, hideOrphans, current])

  const pos = useMemo(() => (shown ? forceLayout(shown.nodes.map((n) => n.id), shown.edges, W, H) : new Map()), [shown])
  const deg = useMemo(() => {
    const d = new Map<string, number>()
    for (const e of shown?.edges ?? []) {
      d.set(e.s, (d.get(e.s) ?? 0) + 1)
      d.set(e.t, (d.get(e.t) ?? 0) + 1)
    }
    return d
  }, [shown])
  const near = useMemo(() => {
    const s = new Set<string>()
    const c = hover ?? current
    if (!c) return s
    s.add(c)
    for (const e of shown?.edges ?? []) {
      if (e.s === c) s.add(e.t)
      if (e.t === c) s.add(e.s)
    }
    return s
  }, [hover, current, shown])
  const many = (shown?.nodes.length ?? 0) > 80

  return (
    <div className="xp-overlay" onMouseDown={onClose}>
      <div className="xp-dlg graph-dlg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="graph-bar">
          <b>{tr('連結關係圖')}</b>
          <div className="chips">
            <button className={`chip${mode === 'local' ? ' on' : ''}`} disabled={!current} onClick={() => setMode('local')}>{tr('本文周邊')}</button>
            <button className={`chip${mode === 'all' ? ' on' : ''}`} onClick={() => setMode('all')}>{tr('全部筆記')}</button>
          </div>
          {mode === 'local' && (
            <label className="xp-check">{tr('層數')}
              <select value={depth} onChange={(e) => setDepth(+e.target.value)}>{[1, 2, 3].map((d) => <option key={d}>{d}</option>)}</select>
            </label>
          )}
          {mode === 'all' && <label className="xp-check"><input type="checkbox" checked={hideOrphans} onChange={(e) => setHideOrphans(e.target.checked)} />{tr('隱藏沒有連結的筆記')}</label>}
          <span className="grow" />
          <span className="hist-hint">{shown ? trf('{0} 篇筆記、{1} 條連結', String(shown.nodes.length), String(shown.edges.length)) : tr('掃描中…')}</span>
          <button className="btn ghost" onClick={onClose}>{tr('關閉')}</button>
        </div>
        <div className="graph-body">
          {!shown && <div className="hist-hint" style={{ padding: 16 }}>{tr('掃描資料夾中…')}</div>}
          {shown && shown.nodes.length === 0 && <div className="hist-hint" style={{ padding: 16 }}>{mode === 'local' ? tr('本文還沒有連結，也沒有其他筆記連到這裡。用 [[筆記名稱]] 建立連結。') : tr('資料夾裡還沒有互相連結的筆記。')}</div>}
          {shown && shown.nodes.length > 0 && (
            <svg
              viewBox={`0 0 ${W} ${H}`}
              onWheel={(e) => setView((v) => ({ ...v, k: Math.max(0.3, Math.min(4, v.k * (e.deltaY < 0 ? 1.12 : 0.89))) }))}
              onPointerDown={(e) => {
                drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
                ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const d = drag.current
                if (d) setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }))
              }}
              onPointerUp={() => (drag.current = null)}
            >
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                {shown.edges.map((e, i) => {
                  const a = pos.get(e.s)
                  const b = pos.get(e.t)
                  if (!a || !b) return null
                  const hot = near.size > 0 && near.has(e.s) && near.has(e.t)
                  return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`g-edge${hot ? ' hot' : ''}`} />
                })}
                {shown.nodes.map((n) => {
                  const p = pos.get(n.id)
                  if (!p) return null
                  const r = 5 + Math.min(10, (deg.get(n.id) ?? 0) * 1.4)
                  const cls = `g-node${n.ghost ? ' ghost' : ''}${n.id === current ? ' cur' : ''}${near.size && !near.has(n.id) ? ' dim' : ''}`
                  const label = !many || n.id === current || near.has(n.id)
                  return (
                    <g key={n.id} className={cls} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => (n.path ? (onOpen(n.path), onClose()) : (onOpenGhost(n.label), onClose()))}>
                      <circle cx={p.x} cy={p.y} r={r} />
                      {label && <text x={p.x} y={p.y + r + 11}>{n.label}</text>}
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
        </div>
        <div className="hist-hint graph-foot">
          {tr('點節點開啟；虛線空心＝連結了但還不存在的筆記（點一下就建立）。滾輪縮放，拖曳平移。')}
          {g?.truncated ? ` ${tr('筆記太多，只顯示連結最多的部分。')}` : ''}
        </div>
      </div>
    </div>
  )
}
