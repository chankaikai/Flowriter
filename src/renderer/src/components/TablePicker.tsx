import { useState } from 'react'

const MAX_R = 8
const MAX_C = 10

/** 像 Word 的插入表格：滑過格子選行列數，點一下插入；下方可自行輸入行數、列數。 */
export function TablePicker({ onPick }: { onPick(rows: number, cols: number): void }) {
  const [hov, setHov] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const clamp = (n: number, max: number) => Math.max(1, Math.min(max, Math.floor(n) || 1))
  return (
    <div className="tp" onMouseLeave={() => setHov({ r: 0, c: 0 })}>
      <div className="tp-title">{hov.r ? `${hov.r} 行 × ${hov.c} 列` : '插入表格'}</div>
      <div className="tp-grid" style={{ gridTemplateColumns: `repeat(${MAX_C}, 18px)` }}>
        {Array.from({ length: MAX_R * MAX_C }, (_, i) => {
          const r = Math.floor(i / MAX_C) + 1
          const c = (i % MAX_C) + 1
          return (
            <button
              key={i}
              className={`tp-cell${r <= hov.r && c <= hov.c ? ' on' : ''}`}
              aria-label={`${r} 行 ${c} 列`}
              onMouseEnter={() => setHov({ r, c })}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(r, c)}
            />
          )
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
