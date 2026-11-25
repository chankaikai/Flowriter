import { useMemo, useRef, useState } from 'react'
import { diffBlocks, mergeHunks, splitBlocks, type Hunk } from '@/lib/diff'
import { diffInline, type Seg } from '@/lib/inlineDiff'
import { Icon } from './Icon'

export interface CompareSource { label: string; md: string }

interface Props {
  /** A：目前文件 */
  current: CompareSource
  /** 可以拿來比的其他已開啟文件 */
  others: CompareSource[]
  onPickFile(): Promise<CompareSource | null>
  /** 把合併後的內容套用到目前文件 */
  onApply(md: string): void
  onClose(): void
}

const Inline = ({ segs, side }: { segs: Seg[]; side: 'a' | 'b' }) => (
  <>
    {segs.map((s, i) =>
      s.k === 'same' ? <span key={i}>{s.t}</span> : (side === 'a' ? s.k === 'del' : s.k === 'add') ? <mark key={i} className={`cmp-${s.k}`}>{s.t}</mark> : null
    )}
  </>
)

/** 文件比對：兩份相似的文件並排，段落對齊、段內逐字標示差異，可逐處或全部套用對方的內容。 */
export function CompareView({ current, others, onPickFile, onApply, onClose }: Props) {
  const [other, setOther] = useState<CompareSource | null>(others[0] ?? null)
  const [accept, setAccept] = useState<Set<number>>(new Set())
  const [cursor, setCursor] = useState(0)
  const [showSame, setShowSame] = useState(false)
  const body = useRef<HTMLDivElement>(null)

  const hunks: Hunk[] = useMemo(() => (other ? diffBlocks(splitBlocks(current.md), splitBlocks(other.md)) : []), [current.md, other])
  const changes = useMemo(() => hunks.map((h, i) => (h.kind === 'change' ? i : -1)).filter((i) => i >= 0), [hunks])

  const go = (dir: 1 | -1) => {
    if (!changes.length) return
    const next = (cursor + dir + changes.length) % changes.length
    setCursor(next)
    body.current?.querySelector(`[data-h="${changes[next]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  const toggle = (i: number) => setAccept((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  return (
    <div className="prompt-scrim" onMouseDown={onClose}>
      <div className="cmp-box" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmp-head">
          <Icon name="diag" size={16} />
          <h3>文件比對</h3>
          <span className="grow" />
          <button className="icon-btn sm" onClick={onClose} title="關閉"><Icon name="close" size={14} /></button>
        </div>

        <div className="cmp-bar">
          <span className="cmp-side a">A　{current.label}（目前文件）</span>
          <span className="cmp-vs">比對</span>
          <select
            className="tm-select" value={other && others.some((o) => o === other) ? others.indexOf(other) : -1}
            onChange={(e) => { setOther(others[+e.target.value] ?? null); setAccept(new Set()); setCursor(0) }}
          >
            {!others.includes(other as CompareSource) && <option value={-1}>{other ? `B　${other.label}` : '選擇要比對的文件…'}</option>}
            {others.map((o, i) => <option key={i} value={i}>B　{o.label}</option>)}
          </select>
          <button className="btn ghost sm" onClick={async () => { const f = await onPickFile(); if (f) { setOther(f); setAccept(new Set()); setCursor(0) } }}>選擇檔案…</button>
        </div>

        {!other ? (
          <p className="pop-empty">請選一份要比對的文件（其他已開啟的分頁，或從磁碟選擇）。</p>
        ) : (
          <>
            <div className="cmp-bar">
              <span className="hist-hint">{changes.length ? `共 ${changes.length} 處不同` : 'A、B 的內容完全相同'}</span>
              <span className="grow" />
              <button className="btn ghost sm" disabled={!changes.length} onClick={() => go(-1)}>↑ 上一處</button>
              <button className="btn ghost sm" disabled={!changes.length} onClick={() => go(1)}>↓ 下一處</button>
              <label className="check-row"><input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} />顯示相同段落</label>
              <button className="btn sm" disabled={!accept.size} onClick={() => onApply(mergeHunks(hunks, accept))}>套用勾選的 {accept.size} 處</button>
              <button className="btn ghost sm" disabled={!changes.length} onClick={() => setAccept(new Set(changes))}>全選</button>
            </div>
            <div className="cmp-cols"><b>A（目前）</b><b>B（{other.label}）</b></div>
            <div className="cmp-body" ref={body}>
              {hunks.map((h, i) => {
                if (h.kind === 'same') {
                  return showSame ? (
                    <div key={i} className="cmp-row same">
                      <pre>{h.cur.join('\n\n')}</pre>
                      <pre>{h.old.join('\n\n')}</pre>
                    </div>
                  ) : (
                    <div key={i} className="cmp-fold">⋯ {h.cur.length} 段相同</div>
                  )
                }
                const rows = Math.max(h.cur.length, h.old.length)
                return (
                  <div key={i} data-h={i} className={`cmp-row change${changes[cursor] === i ? ' cur' : ''}`}>
                    <label className="cmp-pick" title="套用 B 的內容到 A">
                      <input type="checkbox" checked={accept.has(i)} onChange={() => toggle(i)} />
                    </label>
                    <div className="cmp-pair">
                      {Array.from({ length: rows }, (_, k) => {
                        const a = h.cur[k]
                        const b = h.old[k]
                        const segs = a != null && b != null ? diffInline(a, b) : null
                        return (
                          <div key={k} className="cmp-line">
                            <pre className={a == null ? 'empty' : ''}>{a == null ? '（A 沒有這段）' : segs ? <Inline segs={segs} side="a" /> : <mark className="cmp-del">{a}</mark>}</pre>
                            <pre className={b == null ? 'empty' : ''}>{b == null ? '（B 沒有這段）' : segs ? <Inline segs={segs} side="b" /> : <mark className="cmp-add">{b}</mark>}</pre>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
