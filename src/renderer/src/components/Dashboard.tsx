import { useCallback, useEffect, useMemo, useState } from 'react'
import { Ring } from './Panels'
import { Icon } from './Icon'
import { lastDays, streak, dayKey, type WritingData } from '@/lib/writing'
import { badges, bodyWords, chapters, imbalanced, layoutIssues, parseTarget, scanTodos, taskCounts } from '@/lib/dashboard'
import { diffBlocks, splitBlocks } from '@/lib/diff'
import { getBookmark, getResumes } from '@/lib/bookmarks'
import { checkImages, healthCheck } from '@/lib/health'
import { toAbsolutePath } from '@/lib/path'
import type { HistoryItem } from '../../../shared/types'
import { fmtTime } from './Panels'

interface Props {
  path: string | null
  docDir: string | null
  getMd(): string
  data: WritingData
  goal: number
  onGoal(n: number): void
  /** 寫入／移除 front matter 的 target */
  onTarget(n: number | null): void
  onToggleTask(index: number, checked: boolean): void
  /** 跳到文中某段文字並高亮 */
  onJumpText(text: string): void
  onJumpPos(pos: number): void
  onRestore(md: string): void
  onExportImage(): void
  onCopyClean(): void
  onStyleCheck(): void
}

/**
 * 寫作儀表盤：全部資料都是從目前文件即時算出來的，沒有任何示範資料。
 * 文件內容以 500ms 為間隔檢查一次有沒有變動，有變才重算，所以打字時不會每個按鍵都跑。
 */
export function Dashboard(p: Props) {
  const [md, setMd] = useState(() => p.getMd())
  useEffect(() => {
    const t = window.setInterval(() => {
      const cur = p.getMd()
      setMd((old) => (old === cur ? old : cur))
    }, 500)
    return () => window.clearInterval(t)
  }, [p.getMd]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dash2">
      <WordsCard md={md} {...p} />
      <ChaptersCard md={md} path={p.path} onJumpText={p.onJumpText} onJumpPos={p.onJumpPos} />
      <TodoCard md={md} onToggleTask={p.onToggleTask} onJumpText={p.onJumpText} />
      <BadgeCard md={md} docDir={p.docDir} onJumpText={p.onJumpText} />
      <SnapCard path={p.path} md={md} onRestore={p.onRestore} />
      <div className="dash-actions">
        <button className="btn ghost" onClick={p.onExportImage}>匯出分享長圖</button>
        <button className="btn ghost" onClick={p.onCopyClean}>複製乾淨 Markdown</button>
        <button className="btn ghost" onClick={p.onStyleCheck}>文風與語病檢查</button>
      </div>
    </div>
  )
}

const Card = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="dash-card">
    <h4>{title}{hint && <small>{hint}</small>}</h4>
    {children}
  </section>
)

/* 1. 字數與目標 */
function WordsCard({ md, data, goal, onGoal, onTarget }: Props & { md: string }) {
  const words = useMemo(() => bodyWords(md), [md])
  const target = useMemo(() => parseTarget(md), [md])
  const [edit, setEdit] = useState<string | null>(null)
  const today = data.days[dayKey()] || 0
  const days = lastDays(data, 14)
  const max = Math.max(goal, ...days.map((d) => d.words), 1)
  return (
    <Card title="字數與目標">
      <div className="dash-top">
        <Ring value={target ? words / target : today / goal} size={104}>
          <b>{words.toLocaleString()}</b>
          <small>{target ? `/ ${target.toLocaleString()} 字` : '字'}</small>
        </Ring>
        <div className="dash-stats">
          <div className="goal-step">
            {edit == null ? (
              <button className="btn ghost sm" onClick={() => setEdit(target ? String(target) : '')}>{target ? `目標 ${target.toLocaleString()} 字（改）` : '設定本文目標字數'}</button>
            ) : (
              <>
                <input
                  className="ai-input sm" autoFocus inputMode="numeric" value={edit} placeholder="例如 3000"
                  onChange={(e) => setEdit(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return
                    if (e.key === 'Enter') { onTarget(edit ? Math.max(1, +edit) : null); setEdit(null) }
                    if (e.key === 'Escape') setEdit(null)
                  }}
                />
                <button className="btn sm" onClick={() => { onTarget(edit ? Math.max(1, +edit) : null); setEdit(null) }}>確定</button>
              </>
            )}
          </div>
          <div className="hist-hint">{target ? `完成 ${Math.min(100, Math.round((words / target) * 100))}%，目標存在文件的 front matter（target）。` : '設定後會寫進文件開頭的 front matter（target: 數字），換電腦也在。'}</div>
        </div>
      </div>
      <div className="dash-row">
        <span>今日新增 <b>{today.toLocaleString()}</b> / {goal.toLocaleString()}</span>
        <span>連續 <b>{streak(data)}</b> 天</span>
        <span className="goal-step">
          <button className="icon-btn sm" onClick={() => onGoal(Math.max(100, goal - 100))}>−</button>
          <button className="icon-btn sm" onClick={() => onGoal(Math.min(20000, goal + 100))}>＋</button>
        </span>
      </div>
      <div className="bars" aria-label="近 14 天">
        {days.map((d) => (
          <div key={d.key} className="bar" title={`${d.key}：${d.words} 字`}>
            <i className={d.words >= goal ? 'hit' : ''} style={{ height: `${Math.max(3, (d.words / max) * 100)}%` }} />
          </div>
        ))}
      </div>
    </Card>
  )
}

/* 2. 章節平衡 + 冷啟動書籤 */
function ChaptersCard({ md, path, onJumpText, onJumpPos }: { md: string; path: string | null; onJumpText(t: string): void; onJumpPos(n: number): void }) {
  const ch = useMemo(() => chapters(md), [md])
  const warn = useMemo(() => imbalanced(ch), [ch])
  const total = ch.reduce((a, c) => a + c.words, 0) || 1
  const latest = path ? getResumes(path)[0] : null
  const bm = path ? getBookmark(path) : null
  const pos = latest?.pos ?? bm?.pos ?? 0
  return (
    <Card title="章節平衡">
      {ch.length === 0 ? (
        <p className="pop-empty">還沒有標題，無法分章。</p>
      ) : (
        <>
          <div className="chap-bar">
            {ch.map((c, i) => (
              <button key={i} style={{ flexGrow: Math.max(c.words, 1) }} className={warn.some((w) => w.title === c.title) ? 'warn' : ''} title={`${c.title}：${c.words} 字（${Math.round((c.words / total) * 100)}%）`} onClick={() => onJumpText(c.title)} />
            ))}
          </div>
          {warn.length > 0 && <div className="hist-hint">{warn.map((w) => `「${w.title}」${w.kind === 'long' ? '明顯偏長' : '明顯偏短'}`).join('、')}</div>}
        </>
      )}
      {pos > 0 && (
        <button className="dash-bm" onClick={() => onJumpPos(pos)}>
          <Icon name="pin" size={14} />
          <span><b>上次寫到這裡</b>{latest?.hint ? `：${latest.hint}` : ''}</span>
        </button>
      )}
    </Card>
  )
}

/* 3. 未完成事項（與文件雙向同步） */
function TodoCard({ md, onToggleTask, onJumpText }: { md: string; onToggleTask(i: number, c: boolean): void; onJumpText(t: string): void }) {
  const todos = useMemo(() => scanTodos(md), [md])
  const counts = useMemo(() => taskCounts(md), [md])
  if (!todos.length) return <Card title="未完成事項"><p className="pop-empty">沒有未完成的任務或標記。</p></Card>
  return (
    <Card title="未完成事項" hint={counts.total ? `${counts.done}/${counts.total} 任務完成` : undefined}>
      <div className="tm-list">
        {todos.slice(0, 60).map((t, i) =>
          t.kind === 'task' ? (
            <label key={i} className="todo-row">
              <input type="checkbox" checked={false} onChange={() => onToggleTask(t.index!, true)} />
              <button onClick={() => onJumpText(t.text)}>{t.text}</button>
            </label>
          ) : (
            <button key={i} className="todo-row mark" onClick={() => onJumpText(t.text.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 30))}>
              <em>{t.kind === 'link' ? '空連結' : '標記'}</em>
              <span>第 {t.line + 1} 行 · {t.text}</span>
            </button>
          )
        )}
      </div>
    </Card>
  )
}

/* 4. 內容徽章 + 版面檢查 */
function BadgeCard({ md, docDir, onJumpText }: { md: string; docDir: string | null; onJumpText(t: string): void }) {
  const b = useMemo(() => badges(md), [md])
  const lay = useMemo(() => layoutIssues(md), [md])
  const [missing, setMissing] = useState<{ src: string; line: number }[]>([])
  useEffect(() => {
    let live = true
    const { images } = healthCheck(md)
    void checkImages(images, (src) => toAbsolutePath(docDir, src), async (a) => (await window.api.statFile(a)) != null).then((m) => {
      if (live) setMissing(m.map((x) => ({ src: x.snippet, line: x.line })))
    })
    return () => { live = false }
  }, [md, docDir])
  const chips: [string, number][] = [['圖片', b.images], ['表格', b.tables], ['代碼塊', b.code], ['公式', b.math], ['連結', b.links], ['腳註', b.footnotes]]
  const lines = md.split('\n')
  return (
    <Card title="內容與版面">
      <div className="badges">{chips.filter(([, n]) => n > 0).map(([k, n]) => <span key={k}>{k} {n}</span>)}{chips.every(([, n]) => !n) && <span>純文字</span>}</div>
      {lay.length === 0 && missing.length === 0 ? (
        <div className="hist-hint">版面沒有發現問題。</div>
      ) : (
        <div className="tm-list">
          {lay.map((i, k) => (
            <button key={`l${k}`} className="diag-row lv-warn" onClick={() => onJumpText(i.snippet)}><b>版面</b><span>{i.message}</span></button>
          ))}
          {missing.map((m, k) => (
            <button key={`m${k}`} className="diag-row lv-error" onClick={() => onJumpText((lines[m.line] ?? '').replace(/!\[|\]\([^)]*\)/g, ' ').trim().slice(0, 30))}><b>缺圖</b><span>第 {m.line + 1} 行 · 找不到 {m.src}</span></button>
          ))}
        </div>
      )}
    </Card>
  )
}

/* 5. 時光機：最近 5 個快照／里程碑 */
function SnapCard({ path, md, onRestore }: { path: string | null; md: string; onRestore(md: string): void }) {
  const [snaps, setSnaps] = useState<{ ts: number; md: string; tag?: string }[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const load = useCallback(() => {
    if (!path) return setSnaps([])
    void Promise.all([window.api.historyReadAll(path, 5), window.api.historyList(path)]).then(([all, list]: [{ ts: number; md: string }[], HistoryItem[]]) => {
      const tags = new Map(list.map((i) => [i.ts, i.tag]))
      setSnaps([...all].sort((a, b) => b.ts - a.ts).slice(0, 5).map((s) => ({ ...s, tag: tags.get(s.ts) })))
    })
  }, [path])
  useEffect(load, [load])
  if (!path) return <Card title="時光機"><p className="pop-empty">先儲存檔案，才會開始記錄版本。</p></Card>
  if (!snaps) return <Card title="時光機"><p className="pop-empty">讀取中…</p></Card>
  if (!snaps.length) return <Card title="時光機"><p className="pop-empty">還沒有歷史版本。</p></Card>
  return (
    <Card title="時光機" hint="最近 5 個版本">
      <div className="tm-list">
        {snaps.map((s) => {
          const hunks = open === s.ts ? diffBlocks(splitBlocks(md), splitBlocks(s.md)).filter((h) => h.kind === 'change') : null
          const n = hunks ? hunks.length : null
          return (
            <div key={s.ts} className="snap-row">
              <div className="snap-head">
                <button onClick={() => setOpen(open === s.ts ? null : s.ts)}>{s.tag ? `★ ${s.tag}` : '快照'} · {fmtTime(s.ts)}</button>
                <button className="btn ghost sm" onClick={() => onRestore(s.md)}>還原</button>
              </div>
              {hunks && (
                <div className="snap-diff">
                  <div className="hist-hint">{n ? `與目前有 ${n} 處不同` : '與目前版本相同'}</div>
                  {hunks.slice(0, 8).map((h, i) => (
                    <div key={i}>
                      {h.cur.length > 0 && <pre className="tm-del">{h.cur.join('\n\n').slice(0, 300)}</pre>}
                      {h.old.length > 0 && <pre className="tm-add">{h.old.join('\n\n').slice(0, 300)}</pre>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
