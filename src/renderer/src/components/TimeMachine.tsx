import { useEffect, useMemo, useState } from 'react'
import { fmtTime, HistoryPanel } from './Panels'
import { diffBlocks, findDeleted, mergeHunks, splitBlocks } from '@/lib/diff'
import { parseOutline, sectionRange } from '@/lib/markdown'
import { pickMemories, type Memory } from '@/lib/memories'

type Tab = 'versions' | 'blocks' | 'trash' | 'section' | 'memory'
const TABS: [Tab, string][] = [['versions', '版本'], ['blocks', '段落回滾'], ['trash', '垃圾桶'], ['section', '章節演進'], ['memory', '那年今天']]

interface Props {
  path: string | null
  current: () => string
  onRestore(md: string): void
  onInsert(md: string): void
  onMilestone(): Promise<void>
}

export function TimeMachine(p: Props) {
  const [tab, setTab] = useState<Tab>('versions')
  return (
    <>
      <div className="chips tm-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === 'versions' && <HistoryPanel path={p.path} current={p.current} onRestore={p.onRestore} onMilestone={p.onMilestone} />}
      {tab === 'blocks' && <BlocksTab {...p} />}
      {tab === 'trash' && <TrashTab {...p} />}
      {tab === 'section' && <SectionTab {...p} />}
      {tab === 'memory' && <MemoryTab />}
    </>
  )
}

function useSnaps(path: string | null, limit = 60) {
  const [snaps, setSnaps] = useState<{ ts: number; md: string }[] | null>(null)
  useEffect(() => {
    let live = true
    setSnaps(null)
    if (!path) {
      setSnaps([])
      return
    }
    window.api.historyReadAll(path, limit).then((l) => live && setSnaps(l))
    return () => {
      live = false
    }
  }, [path, limit])
  return snaps
}

/* ---- 段落級還原：只把勾選的段落換回舊版 ---- */
function BlocksTab({ path, current, onRestore }: Props) {
  const snaps = useSnaps(path)
  const [ts, setTs] = useState<number | null>(null)
  const [pick, setPick] = useState<Set<number>>(new Set())
  const cur = useMemo(() => current(), [current])
  const snap = snaps?.find((s) => s.ts === ts) ?? snaps?.[0]
  const hunks = useMemo(() => (snap ? diffBlocks(splitBlocks(cur), splitBlocks(snap.md)) : []), [cur, snap])
  useEffect(() => setPick(new Set()), [snap?.ts])
  if (!path) return <p className="pop-empty">先儲存檔案，才會開始記錄版本。</p>
  if (!snaps) return <p className="pop-empty">讀取中…</p>
  if (!snaps.length) return <p className="pop-empty">還沒有歷史版本。</p>
  const changes = hunks.map((h, i) => [h, i] as const).filter(([h]) => h.kind === 'change')
  return (
    <>
      <select className="tm-select" value={snap?.ts} onChange={(e) => setTs(+e.target.value)}>
        {snaps.map((s) => <option key={s.ts} value={s.ts}>{fmtTime(s.ts)}</option>)}
      </select>
      <div className="hist-hint">{changes.length ? `有 ${changes.length} 處不同。勾選要換回舊版的段落。` : '與目前版本相同'}</div>
      <div className="tm-list">
        {changes.map(([h, i]) => (
          <label key={i} className="tm-hunk">
            <input type="checkbox" checked={pick.has(i)} onChange={() => setPick((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })} />
            <span>
              {h.cur.length > 0 && <pre className="tm-del">{h.cur.join('\n\n')}</pre>}
              {h.old.length > 0 && <pre className="tm-add">{h.old.join('\n\n')}</pre>}
            </span>
          </label>
        ))}
      </div>
      <div className="pop-actions">
        <button className="btn" disabled={!pick.size} onClick={() => onRestore(mergeHunks(hunks, pick))}>換回勾選的 {pick.size} 處</button>
      </div>
    </>
  )
}

/* ---- 垃圾桶：歷史裡有、現在沒有的段落 ---- */
function TrashTab({ path, current, onInsert }: Props) {
  const snaps = useSnaps(path, 80)
  const cur = useMemo(() => current(), [current])
  const items = useMemo(() => (snaps ? findDeleted(cur, snaps).slice(0, 60) : []), [snaps, cur])
  if (!path) return <p className="pop-empty">先儲存檔案，才會開始記錄版本。</p>
  if (!snaps) return <p className="pop-empty">讀取中…</p>
  if (!items.length) return <p className="pop-empty">沒有找到被刪掉的段落。</p>
  return (
    <>
      <div className="hist-hint">這些段落曾經存在，現在已不在文件裡（短於 12 字的略過）。</div>
      <div className="tm-list">
        {items.map((it, i) => (
          <div key={i} className="tm-hunk">
            <span style={{ flex: 1 }}>
              <small className="tm-when">{fmtTime(it.ts)} 還在</small>
              <pre className="tm-add">{it.text.length > 400 ? it.text.slice(0, 400) + '…' : it.text}</pre>
            </span>
            <button className="btn ghost" onClick={() => onInsert(it.text)}>插回游標處</button>
          </div>
        ))}
      </div>
    </>
  )
}

/* ---- 章節演進：同一章節在每次存檔時的字數與內容 ---- */
function SectionTab({ path, current }: Props) {
  const snaps = useSnaps(path, 60)
  const cur = useMemo(() => current(), [current])
  const heads = useMemo(() => parseOutline(cur), [cur])
  const [h, setH] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const title = heads[h]?.text
  const rows = useMemo(() => {
    if (!snaps || !title) return []
    const list = [...snaps].reverse() // 舊 → 新
    let prev: number | null = null
    const out: { ts: number; chars: number; delta: number | null; text: string }[] = []
    for (const s of list) {
      const items = parseOutline(s.md)
      const k = items.findIndex((x) => x.text === title)
      if (k < 0) continue
      const [a, b] = sectionRange(s.md, items, k)
      const text = s.md.split(/\r?\n/).slice(a, b).join('\n')
      const chars = text.replace(/\s/g, '').length
      if (prev === null || chars !== prev) out.push({ ts: s.ts, chars, delta: prev === null ? null : chars - prev, text })
      prev = chars
    }
    return out.reverse()
  }, [snaps, title])
  if (!path) return <p className="pop-empty">先儲存檔案，才會開始記錄版本。</p>
  if (!heads.length) return <p className="pop-empty">文件裡還沒有標題。</p>
  return (
    <>
      <select className="tm-select" value={h} onChange={(e) => { setH(+e.target.value); setOpen(null) }}>
        {heads.map((x, i) => <option key={i} value={i}>{'　'.repeat(x.level - 1)}{x.text}</option>)}
      </select>
      {!snaps ? <p className="pop-empty">讀取中…</p> : !rows.length ? <p className="pop-empty">歷史版本裡沒有這個章節。</p> : (
        <div className="tm-list">
          {rows.map((r, i) => (
            <div key={r.ts} className="tm-hunk" style={{ display: 'block' }}>
              <button className="tm-row" onClick={() => setOpen(open === i ? null : i)}>
                <span>{fmtTime(r.ts)}</span>
                <span>{r.chars} 字{r.delta != null && <em className={r.delta >= 0 ? 'up' : 'down'}> {r.delta >= 0 ? '+' : ''}{r.delta}</em>}</span>
              </button>
              {open === i && <pre className="tm-add">{r.text.length > 1500 ? r.text.slice(0, 1500) + '…' : r.text}</pre>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ---- 那年今天 ---- */
function MemoryTab() {
  const [mem, setMem] = useState<(Memory & { excerpt: string })[] | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const idx = await window.api.historyIndex()
      const picks = pickMemories(idx).slice(0, 8)
      const full = await Promise.all(
        picks.map(async (m) => {
          const t = (await window.api.historyReadKey(m.key, m.ts)) ?? ''
          return { ...m, excerpt: t.replace(/^---[\s\S]*?---\s*/, '').replace(/\s+/g, ' ').slice(0, 160) }
        })
      )
      if (live) setMem(full)
    })()
    return () => {
      live = false
    }
  }, [])
  if (!mem) return <p className="pop-empty">讀取中…</p>
  if (!mem.length) return <p className="pop-empty">今天前後還沒有舊時的快照。寫得越久，這裡越有東西。</p>
  return (
    <div className="tm-list">
      {mem.map((m) => (
        <div key={`${m.key}-${m.ts}`} className="tm-card">
          <small className="tm-when">{m.label} · {new Date(m.ts).toLocaleDateString()} · {m.name}</small>
          <div>{m.excerpt || '（空白）'}</div>
          <button className="btn ghost" onClick={() => void window.api.historyReadKey(m.key, m.ts).then((t) => t && navigator.clipboard.writeText(t))}>複製全文</button>
        </div>
      ))}
    </div>
  )
}

