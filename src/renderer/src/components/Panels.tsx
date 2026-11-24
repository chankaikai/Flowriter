import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { extractLinks, sharedTargets, twoHopOut, type RelatedNote } from '@/lib/graph'
import { Icon, type IconName } from './Icon'
import { AMBIENT_LIST, setAmbient, setAmbientVolume, type AmbientKind } from '@/lib/ambient'
import { fmtClock, PRESETS, type PomoConfig, type PomoState } from '@/lib/pomodoro'
import { lastDays, streak, type WritingData, dayKey } from '@/lib/writing'
import type { HistoryItem, SearchHit } from '../../../shared/types'
import { basename, stripExt } from '@/lib/path'
import { AiSetup } from './AiSetup'
import { recordUsage, fmtTokens } from '@/lib/aiUsage'
import { collectTasks } from '@/lib/tasks'
import { resolveAi, type AiPrefs } from '@/lib/ai'

/** 停靠欄上方的浮動玻璃面板，一次只開一個。 */
export function Popover({
  open, icon, title, onClose, children, wide
}: { open: boolean; icon: IconName; title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) setMounted(true)
    else {
      const id = window.setTimeout(() => setMounted(false), 260)
      return () => window.clearTimeout(id)
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!mounted) return null
  return (
    <div className={`pop${open ? ' in' : ''}${wide ? ' wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
      <div className="pop-head">
        <Icon name={icon} size={16} />
        <h3>{title}</h3>
        <span className="grow" />
        <button className="icon-btn sm" onClick={onClose} title="關閉">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="pop-body">{children}</div>
    </div>
  )
}

const Ring = ({ value, size = 120, children }: { value: number; size?: number; children?: ReactNode }) => {
  const r = size / 2 - 7
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" />
        <circle
          cx={size / 2} cy={size / 2} r={r} className="ring-fg"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  )
}

/* ------------------------------ 時光機 ------------------------------ */

export const fmtTime = (ts: number) => {
  const d = new Date(ts)
  const today = dayKey() === dayKey(d)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return today ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

export function HistoryPanel({
  path, current, onRestore, onMilestone
}: { path: string | null; current: () => string; onRestore(content: string): void; onMilestone(): Promise<void> }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [text, setText] = useState<string | null>(null)
  const cur = useMemo(() => current(), [current, items])
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    if (!path) {
      setItems([])
      return
    }
    window.api.historyList(path).then((l) => {
      if (!live) return
      setItems(l)
      setIdx(Math.max(0, l.length - 1))
    })
    return () => {
      live = false
    }
  }, [path, reload])

  const sel = items?.[idx]
  useEffect(() => {
    let live = true
    setText(null)
    if (path && sel) window.api.historyRead(path, sel.ts).then((t) => live && setText(t))
    return () => {
      live = false
    }
  }, [path, sel?.ts])

  if (!path) return <p className="pop-empty">先儲存檔案，才會開始記錄版本。</p>
  if (!items) return <p className="pop-empty">讀取中…</p>
  if (!items.length) return <p className="pop-empty">還沒有歷史版本。每次儲存都會留下快照（內容相同不重複記錄）。</p>

  const curLines = new Set(cur.split('\n'))
  const lines = (text ?? '').split('\n')
  const changed = lines.filter((l) => l.trim() && !curLines.has(l)).length
  return (
    <>
      <div className="hist-meta">
        <b>{sel ? fmtTime(sel.ts) : ''}{sel?.tag ? ` · ★ ${sel.tag}` : ''}</b>
        <span>
          第 {idx + 1} / {items.length} 版 · {sel ? Math.round(sel.size / 100) / 10 : 0} KB
        </span>
      </div>
      {items.some((x) => x.tag) && (
        <div className="chips">
          {items.map((x, i) => x.tag && (
            <button key={x.ts} className={`chip${i === idx ? ' on' : ''}`} onClick={() => setIdx(i)}>★ {x.tag}</button>
          ))}
        </div>
      )}
      <input
        type="range" className="hist-slider" min={0} max={items.length - 1} step={1} value={idx}
        onChange={(e) => setIdx(+e.target.value)}
      />
      <div className="hist-hint">{changed ? `與目前版本相比有 ${changed} 行內容不同（以綠色標出）` : '與目前版本相同'}</div>
      <pre className="hist-view">
        {text == null
          ? '…'
          : lines.slice(0, 400).map((l, i) => (
              <span key={i} className={l.trim() && !curLines.has(l) ? 'diff-add' : undefined}>
                {l}
                {'\n'}
              </span>
            ))}
      </pre>
      <div className="pop-actions">
        <button className="btn" disabled={text == null || text === cur} onClick={() => text != null && onRestore(text)}>
          還原到此版本
        </button>
        <button className="btn ghost" onClick={() => void onMilestone().then(() => setReload((n) => n + 1))}>
          標記目前為里程碑
        </button>
      </div>
    </>
  )
}

/* ------------------------------ 寫作儀表板 ------------------------------ */

export function DashboardPanel({
  data, goal, onGoal
}: { data: WritingData; goal: number; onGoal(n: number): void }) {
  const today = data.days[dayKey()] || 0
  const days = lastDays(data, 14)
  const max = Math.max(goal, ...days.map((d) => d.words), 1)
  const total = Object.values(data.days).reduce((a, b) => a + b, 0)
  return (
    <>
      <div className="dash-top">
        <Ring value={today / goal} size={116}>
          <b>{today.toLocaleString()}</b>
          <small>/ {goal.toLocaleString()} 字</small>
        </Ring>
        <div className="dash-stats">
          <div><b>{streak(data)}</b><span>連續寫作天數</span></div>
          <div><b>{total.toLocaleString()}</b><span>累計新增字數</span></div>
          <div className="goal-step">
            <button className="icon-btn sm" onClick={() => onGoal(Math.max(100, goal - 100))}>−</button>
            <span>每日目標 {goal}</span>
            <button className="icon-btn sm" onClick={() => onGoal(Math.min(20000, goal + 100))}>＋</button>
          </div>
        </div>
      </div>
      <div className="bars" aria-label="近 14 天">
        {days.map((d) => (
          <div key={d.key} className="bar" title={`${d.key}：${d.words} 字`}>
            <i className={d.words >= goal ? 'hit' : ''} style={{ height: `${Math.max(3, (d.words / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="hist-hint">只統計你實際輸入的新增字數，刪減與貼上的大段內容不計入。</div>
    </>
  )
}

/* ------------------------------ 專注：番茄鐘 + 氛圍音 ------------------------------ */

const NumField = ({
  label, value, min, max, onChange, unit
}: { label: string; value: number; min: number; max: number; unit?: string; onChange(n: number): void }) => (
  <label className="num-field">
    <span>{label}</span>
    <input
      type="number" min={min} max={max} value={value}
      onChange={(e) => e.target.value !== '' && onChange(+e.target.value)}
    />
    {unit && <em>{unit}</em>}
  </label>
)

export function FocusPanel({
  st, toggle, reset, skip, setConfig, ambient, setAmbientKind
}: {
  st: PomoState
  toggle(): void
  reset(): void
  skip(): void
  setConfig(p: Partial<PomoConfig>): void
  ambient: AmbientKind
  setAmbientKind(k: AmbientKind): void
}) {
  const [vol, setVol] = useState(0.35)
  const [custom, setCustom] = useState(false)
  const volRef = useRef(vol)
  volRef.current = vol
  useEffect(() => {
    setAmbient(ambient, volRef.current)
  }, [ambient])
  const isPreset = PRESETS.some((p) => p.work === st.workMin && p.rest === st.restMin)
  const phaseLabel = st.phase === 'work' ? '專注' : st.long ? '長休息' : '休息'
  return (
    <>
      <div className="pomo">
        <Ring value={1 - st.left / st.total} size={132}>
          <b className="clock">{fmtClock(st.left)}</b>
          <small>{phaseLabel} · 今日 {st.rounds} 輪</small>
        </Ring>
        <div className="pomo-ctl">
          <button className="btn" onClick={toggle}>{st.running ? '暫停' : '開始'}</button>
          <button className="btn ghost" onClick={reset}>重設</button>
          <button className="btn ghost" onClick={skip}>跳過</button>
        </div>
        <div className="chips center">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`chip${!custom && st.workMin === p.work && st.restMin === p.rest ? ' on' : ''}`}
              onClick={() => {
                setCustom(false)
                setConfig({ workMin: p.work, restMin: p.rest })
              }}
            >
              {p.label}
            </button>
          ))}
          <button className={`chip${custom || !isPreset ? ' on' : ''}`} onClick={() => setCustom(!custom)}>
            自訂
          </button>
        </div>
        {(custom || !isPreset) && (
          <div className="pomo-cfg">
            <NumField label="專注" unit="分" value={st.workMin} min={1} max={180} onChange={(n) => setConfig({ workMin: n })} />
            <NumField label="休息" unit="分" value={st.restMin} min={1} max={60} onChange={(n) => setConfig({ restMin: n })} />
            <NumField label="每" unit="輪" value={st.longEvery} min={0} max={12} onChange={(n) => setConfig({ longEvery: n })} />
            <NumField label="長休息" unit="分" value={st.longMin} min={1} max={90} onChange={(n) => setConfig({ longMin: n })} />
          </div>
        )}
        <label className="check-row">
          <input type="checkbox" checked={st.auto} onChange={(e) => setConfig({ auto: e.target.checked })} />
          階段結束後自動開始下一階段
        </label>
        {st.longEvery === 0 && <div className="hist-hint">「每 0 輪」表示不使用長休息。</div>}
      </div>
      <div className="set-sep" />
      <div className="hist-hint">氛圍音（即時合成，無需網路）</div>
      <div className="chips">
        {AMBIENT_LIST.map((a) => (
          <button key={a.k} className={`chip${ambient === a.k ? ' on' : ''}`} onClick={() => setAmbientKind(a.k)}>
            {a.label}
          </button>
        ))}
      </div>
      <input
        type="range" min={0} max={1} step={0.01} value={vol}
        onChange={(e) => {
          setVol(+e.target.value)
          setAmbientVolume(+e.target.value)
        }}
      />
    </>
  )
}

/* ------------------------------ AI 改寫 ------------------------------ */

const AI_PRESETS: { label: string; prompt: string; cont?: boolean }[] = [
  { label: '潤色', prompt: '潤色以下文字，使表達更流暢自然，保持原意與語言。' },
  { label: '精簡', prompt: '把以下文字精簡到原來約一半的長度，保留關鍵資訊。' },
  { label: '續寫', prompt: '接著以下文字繼續往下寫一段（約 150～300 字），語氣、人稱與語言保持一致；只輸出新寫的內容，不要重複原文。', cont: true },
  { label: '擴寫', prompt: '在不編造事實的前提下，把以下文字擴寫得更充實。' },
  { label: '修正錯字語法', prompt: '只修正以下文字的錯字、標點與語法錯誤，不改變用詞與風格。' },
  { label: '翻成英文', prompt: '把以下文字翻譯成自然的英文。' },
  { label: '翻成中文', prompt: '把以下文字翻譯成自然的繁體中文。' }
]

export function AiPanel({
  selection, before, prefs, update, onApply, onAppend
}: {
  selection: string
  /** 游標前的文字，沒選取時續寫用它當上文 */
  before: string
  prefs: AiPrefs
  update(patch: Partial<AiPrefs>): void
  onApply(md: string): void
  /** 插在選取內容（或游標）之後，不取代原文 */
  onAppend(md: string): void
}) {
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [last, setLast] = useState<{ in: number; out: number } | null>(null)
  const cfg = resolveAi(prefs)

  const source = selection || before
  const run = async (instruction: string, useBefore = false) => {
    if (!instruction.trim() || busy || cfg.missing) return
    const text = selection || (useBefore ? before : '')
    if (!text.trim()) return
    setBusy(true)
    setErr(null)
    setOut(null)
    const r = await window.api.aiRewrite({
      kind: cfg.kind, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, maxTokens: cfg.maxTokens, instruction, text
    })
    setBusy(false)
    if ('error' in r) setErr(r.error)
    else {
      setOut(r.text.trim())
      if (r.usage && (r.usage.in || r.usage.out)) {
        recordUsage(cfg.provider.id, r.usage, dayKey())
        setLast(r.usage)
      }
    }
  }

  return (
    <>
      <AiSetup s={prefs} update={update} compact />
      {cfg.missing && <p className="pop-empty">{cfg.missing}。</p>}
      {!source ? (
        <p className="pop-empty">先在編輯器中選取一段文字（或把游標放在想續寫的地方），再打開這個面板。</p>
      ) : (
        <>
          <div className="ai-src">
            {selection ? '' : '（未選取：以游標前的文字當上文，只能用「續寫」）\n'}
            {source.length > 260 ? `${selection ? source.slice(0, 260) : '…' + source.slice(-260)}${selection ? '…' : ''}` : source}
          </div>
          <div className="chips">
            {AI_PRESETS.filter((p) => selection || p.cont).map((p) => (
              <button key={p.label} className="chip" disabled={busy || !!cfg.missing} onClick={() => void run(p.prompt, !!p.cont)}>
                {p.label}
              </button>
            ))}
          </div>
          {selection && (
            <div className="ai-row">
              <input
                className="ai-input" placeholder="或輸入自訂指示，Enter 送出" value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void run(custom)}
              />
            </div>
          )}
          {cfg.missing && <div className="ai-err">需要先設定 AI：{cfg.missing}</div>}
          {busy && <div className="ai-busy"><i /><span>{cfg.provider.label} 正在處理…</span></div>}
          {err && <div className="ai-err">{err}</div>}
          {out && (
            <>
              <div className="ai-out">{out}</div>
              {last && <div className="hist-hint">本次用量：輸入 {fmtTokens(last.in)}、輸出 {fmtTokens(last.out)} tokens</div>}
              <div className="pop-actions">
                {selection && <button className="btn" onClick={() => onApply(out)}>取代選取內容</button>}
                <button className={`btn${selection ? ' ghost' : ''}`} onClick={() => onAppend(out)}>接在後面插入</button>
                <button className="btn ghost" onClick={() => void navigator.clipboard.writeText(out)}>複製</button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

/* ------------------------------ 連結與反向連結 ------------------------------ */

export function LinksPanel({
  folder, docPath, md, onOpenLink, onOpenHit
}: {
  folder: string | null
  docPath: string | null
  md: string
  onOpenLink(name: string): void
  onOpenHit(path: string): void
}) {
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [hop, setHop] = useState<{ shared: RelatedNote[]; out: RelatedNote[] } | null>(null)
  const stem = docPath ? stripExt(basename(docPath)) : null
  const outgoing = useMemo(() => {
    const set = new Set<string>()
    for (const m of md.matchAll(/\[\[([^[\]\n]{1,120})\]\]/g)) set.add(m[1].split('|')[0].trim())
    return [...set]
  }, [md])

  useEffect(() => {
    let live = true
    setHits(null)
    if (!folder || !stem) return
    window.api.searchFolder(folder, `[[${stem}`).then((h) => {
      if (!live) return
      // 同一檔案只列一次，排除自己
      const seen = new Set<string>()
      setHits(h.filter((x) => x.path !== docPath && !seen.has(x.path) && !!seen.add(x.path)))
    })
    return () => {
      live = false
    }
  }, [folder, stem, docPath])

  // 二跳：只讀有限數量的檔案，避免大型資料夾卡住
  useEffect(() => {
    let live = true
    setHop(null)
    if (!folder || !stem) return
    void (async () => {
      const direct = extractLinks(md)
      const byTarget: Record<string, string[]> = {}
      for (const t of direct.slice(0, 12)) {
        const h = await window.api.searchFolder(folder, `[[${t}`)
        byTarget[t] = h.map((x) => stripExt(x.name))
      }
      const back = (await window.api.searchFolder(folder, `[[${stem}`)).filter((x) => x.path !== docPath)
      const backlinks: Record<string, string[]> = {}
      for (const b of [...new Map(back.map((x) => [x.path, x])).values()].slice(0, 20)) {
        const f = await window.api.readFile(b.path)
        if (f) backlinks[stripExt(b.name)] = extractLinks(f.content)
      }
      if (live) setHop({ shared: sharedTargets(stem, byTarget).slice(0, 12), out: twoHopOut(stem, direct, backlinks).slice(0, 12) })
    })()
    return () => {
      live = false
    }
  }, [folder, stem, docPath, md])

  return (
    <>
      <div className="hist-hint">本文連出（點擊開啟，不存在則建立）</div>
      <div className="link-list">
        {outgoing.length ? (
          outgoing.map((n) => (
            <button key={n} onClick={() => onOpenLink(n)}>[[{n}]]</button>
          ))
        ) : (
          <span className="pop-empty">在文中輸入 [[筆記名稱]] 即可建立連結。</span>
        )}
      </div>
      <div className="set-sep" />
      <div className="hist-hint">反向連結（其他筆記指向本文）</div>
      {!folder || !stem ? (
        <p className="pop-empty">開啟資料夾並儲存檔案後可用。</p>
      ) : hits == null ? (
        <p className="pop-empty">搜尋中…</p>
      ) : hits.length ? (
        <div className="link-list col">
          {hits.map((h) => (
            <button key={h.path} onClick={() => onOpenHit(h.path)}>
              <b>{stripExt(h.name)}</b>
              <small>{h.text.trim().slice(0, 80)}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="pop-empty">目前沒有其他筆記連到這裡。</p>
      )}
      {folder && stem && (
        <>
          <div className="set-sep" />
          <div className="hist-hint">二跳關係：與本文引用相同對象的筆記</div>
          {hop == null ? (
            <p className="pop-empty">計算中…</p>
          ) : hop.shared.length ? (
            <div className="link-list col">
              {hop.shared.map((r) => (
                <button key={r.stem} onClick={() => onOpenLink(r.stem)}>
                  <b>{r.stem}</b>
                  <small>共同連到 {r.via.map((v) => `[[${v}]]`).join('、')}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="pop-empty">沒有找到。</p>
          )}
          <div className="hist-hint">二跳關係：經由反向連結再連出的筆記</div>
          {hop && hop.out.length > 0 && (
            <div className="link-list col">
              {hop.out.map((r) => (
                <button key={r.stem} onClick={() => onOpenLink(r.stem)}>
                  <b>[[{r.stem}]]</b>
                  <small>經由 {r.via.map((v) => `[[${v}]]`).join('、')}</small>
                </button>
              ))}
            </div>
          )}
          {hop && hop.out.length === 0 && <p className="pop-empty">沒有找到。</p>}
        </>
      )}
    </>
  )
}

export function TasksPanel({ md, onJump }: { md: string; onJump(text: string): void }) {
  const tasks = useMemo(() => collectTasks(md), [md])
  const open = tasks.filter((t) => !t.checked)
  const done = tasks.length - open.length
  return (
    <>
      <div className="hist-hint">
        {tasks.length ? `待辦 ${open.length} 項，已完成 ${done} 項（點擊跳到該行）` : '這份文件還沒有 - [ ] 任務'}
      </div>
      <div className="link-list task-list">
        {open.map((t) => (
          <button key={t.line} onClick={() => onJump(t.text)}>{t.text}</button>
        ))}
      </div>
    </>
  )
}
