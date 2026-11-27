import { useState } from 'react'

const MAX_R = 12
const MAX_C = 16
const BASE_R = 6
const BASE_C = 8
const CELL = 14 // 格子邊長（px），與 CSS 的 --tp-cell 一致
const GAP = 3

/** 像 Word 的插入表格：用指標位置換算行列（不是逐格 hover，所以不會在縫隙卡住），格子會隨游標往外長；點一下插入，下方可自行輸入。 */
export function TablePicker({ onPick }: { onPick(rows: number, cols: number): void }) {
  const [hov, setHov] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const clamp = (n: number, max: number) => Math.max(1, Math.min(max, Math.floor(n) || 1))
  const showR = Math.min(MAX_R, Math.max(BASE_R, hov.r + 1))
  const showC = Math.min(MAX_C, Math.max(BASE_C, hov.c + 1))
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const c = Math.floor((e.clientX - box.left) / (CELL + GAP)) + 1
    const r = Math.floor((e.clientY - box.top) / (CELL + GAP)) + 1
    return { r: Math.max(1, Math.min(MAX_R, r)), c: Math.max(1, Math.min(MAX_C, c)) }
  }
  return (
    <div className="tp" onMouseLeave={() => setHov({ r: 0, c: 0 })}>
      <div className="tp-title">{hov.r ? `${hov.r} 行 × ${hov.c} 列` : '插入表格'}</div>
      <div
        className="tp-grid"
        style={{ gridTemplateColumns: `repeat(${showC}, ${CELL}px)`, gridAutoRows: `${CELL}px`, gap: GAP }}
        onPointerMove={(e) => {
          const p = at(e)
          setHov((h) => (h.r === p.r && h.c === p.c ? h : p))
        }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          const p = at({ currentTarget: e.currentTarget, clientX: e.clientX, clientY: e.clientY } as unknown as React.PointerEvent<HTMLDivElement>)
          onPick(p.r, p.c)
        }}
      >
        {Array.from({ length: showR * showC }, (_, i) => {
          const r = Math.floor(i / showC) + 1
          const c = (i % showC) + 1
          return <i key={i} className={`tp-cell${r <= hov.r && c <= hov.c ? ' on' : ''}`} />
        })}
      </div>
      <div className="tp-custom">
        <label>
          行
          <input type="number" min={1} max={50} value={rows} onChange={(e) => setRows(clamp(Number(e.target.value), 50))} />
        </label>
        <label>
          列
          <input type="number" min={1} max={20} value={cols} onChange={(e) => setCols(clamp(Number(e.target.value), 20))} />
        </label>
        <button className="btn" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(clamp(rows, 50), clamp(cols, 20))}>
          插入
        </button>
      </div>
    </div>
  )
}
