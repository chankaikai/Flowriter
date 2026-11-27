import { useEffect, useMemo, useState } from 'react'
import { applyFixes, styleIssues, typographyIssues, type Issue } from '@/lib/lint'
import { checkImages, healthCheck, type HealthIssue } from '@/lib/health'
import { toAbsolutePath } from '@/lib/path'
import { buildIndex, queryIndex, type RadarIndex } from '@/lib/radar'
import { buildStitch, type StitchStyle } from '@/lib/stitch'
import { resolveAi, type AiPrefs } from '@/lib/ai'
import { recordUsage } from '@/lib/aiUsage'
import { dayKey } from '@/lib/writing'
import { tr, trf } from '@/lib/i18n'
import { AiSetup } from './AiSetup'
import { buildCheckPrompt, parseCheckReply, prepare, type AiIssue, type BlockText } from '@/lib/aiCheck'
import { signature } from '@/lib/reverseOutline'

type Tab = 'health' | 'typo' | 'style' | 'ai'

/** 診斷結果跳轉用的純文字：去掉 Markdown 標記，取前 40 字。 */
const plain = (s: string) => s.replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '').replace(/[*_`~[\]()#>|]/g, '').trim().slice(0, 40)
const lineText = (md: string, line: number) => plain(md.split(/\r?\n/)[line] ?? '')

const LEVEL: Record<string, string> = { error: '錯誤', warn: '注意', info: '建議' }

export function DiagnosticsPanel({
  md, docDir, onJump, onReplace, prefs, update, getBlocks, onJumpBlock
}: {
  md: string
  docDir: string | null
  onJump(text: string): void
  onReplace(md: string): void
  prefs: AiPrefs
  update(p: Partial<AiPrefs>): void
  getBlocks(): BlockText[]
  onJumpBlock(index: number, len: number): void
}) {
  const [tab, setTab] = useState<Tab>('health')
  return (
    <>
      <div className="chips tm-tabs">
        {([['health', '排版檢驗'], ['typo', '排版'], ['style', '文風'], ['ai', 'AI 檢查']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'health' && <HealthTab md={md} docDir={docDir} onJump={onJump} />}
      {tab === 'typo' && <TypoTab md={md} onJump={onJump} onReplace={onReplace} />}
      {tab === 'style' && <StyleTab md={md} onJump={onJump} />}
      {tab === 'ai' && <AiCheckTab prefs={prefs} update={update} getBlocks={getBlocks} onJumpBlock={onJumpBlock} />}
    </>
  )
}

function Row({ level, text, onClick }: { level: string; text: string; onClick(): void }) {
  return (
    <button className={`diag-row lv-${level}`} onClick={onClick}>
      <b>{LEVEL[level]}</b>
      <span>{text}</span>
    </button>
  )
}

export function useHealth(md: string, docDir: string | null): HealthIssue[] | null {
  const [issues, setIssues] = useState<HealthIssue[] | null>(null)
  useEffect(() => {
    let live = true
    setIssues(null)
    const { issues: base, images } = healthCheck(md)
    void checkImages(images, (src) => toAbsolutePath(docDir, src), async (p) => (await window.api.statFile(p)) != null).then((missing) => {
      if (live) setIssues([...missing, ...base].sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.level] - { error: 0, warn: 1, info: 2 }[b.level]) || a.line - b.line))
    })
    return () => {
      live = false
    }
  }, [md, docDir])
  return issues
}

function HealthTab({ md, docDir, onJump }: { md: string; docDir: string | null; onJump(t: string): void }) {
  const issues = useHealth(md, docDir)
  if (!issues) return <p className="pop-empty">{tr('檢查中…')}</p>
  if (!issues.length) return <p className="pop-empty">{tr('沒有發現問題，可以放心匯出。')}</p>
  const n = (l: string) => issues.filter((i) => i.level === l).length
  return (
    <>
      <div className="hist-hint">{n('error')} 個錯誤、{n('warn')} 個注意、{n('info')} 個建議。點一項跳到該處。</div>
      <div className="tm-list">
        {issues.map((i, k) => (
          <Row key={k} level={i.level} text={`第 ${i.line + 1} 行 · ${i.message}`} onClick={() => onJump(plain(i.snippet) || lineText(md, i.line))} />
        ))}
      </div>
    </>
  )
}

function TypoTab({ md, onJump, onReplace }: { md: string; onJump(t: string): void; onReplace(md: string): void }) {
  const issues = useMemo(() => typographyIssues(md), [md])
  const fixable = issues.filter((i) => i.fix !== undefined).length
  if (!issues.length) return <p className="pop-empty">{tr('排版沒有問題。')}</p>
  return (
    <>
      <div className="hist-hint">{tr('中英文空格、全半形標點、重複標點、括號配對。程式碼、網址、front matter 不檢查。')}</div>
      <div className="pop-actions">
        <button className="btn" disabled={!fixable} onClick={() => onReplace(applyFixes(md, issues).md)}>一鍵修正 {fixable} 處</button>
      </div>
      <div className="tm-list">
        {issues.slice(0, 200).map((i: Issue, k) => (
          <Row key={k} level={i.level} text={`第 ${i.line + 1} 行 · ${i.message}${i.fix === undefined ? '（需手動改）' : ''}`} onClick={() => onJump(plain(i.snippet))} />
        ))}
      </div>
    </>
  )
}

function StyleTab({ md, onJump }: { md: string; onJump(t: string): void }) {
  const issues = useMemo(() => styleIssues(md), [md])
  if (!issues.length) return <p className="pop-empty">{tr('沒有明顯的文風問題。')}</p>
  return (
    <>
      <div className="hist-hint">{tr('只提示，不會改你的文字。長句、「的」過多、連續同開頭、弱化詞、重複用詞。')}</div>
      <div className="tm-list">
        {issues.slice(0, 100).map((i, k) => (
          <Row key={k} level={i.level} text={`第 ${i.line + 1} 行 · ${i.message}`} onClick={() => onJump(plain(i.snippet) || lineText(md, i.line))} />
        ))}
      </div>
    </>
  )
}

/* ------------------------------ 剪貼簿收集 ------------------------------ */

export function useClipStack() {
  const [on, setOn] = useState(false)
  const [items, setItems] = useState<string[]>([])
  useEffect(() => {
    if (!on) return
    return window.api.onClip((t) => setItems((l) => [t, ...l.filter((x) => x !== t)].slice(0, 30)))
  }, [on])
  const toggle = () => {
    const next = !on
    void window.api.clipWatch(next)
    setOn(next)
  }
  return {
    on, items, toggle,
    remove: (i: number) => setItems((l) => l.filter((_, k) => k !== i)),
    clear: () => setItems([])
  }
}

export function ClipPanel({
  stack, onInsert, prefs
}: { stack: ReturnType<typeof useClipStack>; onInsert(t: string): void; prefs: AiPrefs }) {
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [style, setStyle] = useState<StitchStyle>('plain')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cfg = resolveAi(prefs)
  const chosen = stack.items.filter((_, i) => picked.has(i))
  const toggle = (i: number) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

  const stitch = async () => {
    if (busy || cfg.missing || chosen.length < 2) return
    const req = buildStitch(chosen, style)
    setBusy(true)
    setErr(null)
    setOut(null)
    const r = await window.api.aiRewrite({
      kind: cfg.kind, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, maxTokens: cfg.maxTokens,
      instruction: req.instruction, text: req.text
    })
    setBusy(false)
    if ('error' in r) setErr(r.error)
    else {
      setOut(r.text.trim())
      if (r.usage && (r.usage.in || r.usage.out)) recordUsage(cfg.provider.id, r.usage, dayKey())
      if (req.truncated) setErr(`有 ${req.truncated} 則片段因長度被截短或略過`)
    }
  }

  return (
    <>
      <div className="hist-hint">
        開啟後，你在任何程式裡複製的文字都會收進來（最多 30 則，只存在記憶體，關閉程式就清掉）。
        複製密碼或機密內容前請先關閉。
      </div>
      <div className="pop-actions">
        <button className={`btn${stack.on ? '' : ' ghost'}`} onClick={stack.toggle}>{stack.on ? '收集中，點擊停止' : '開始收集'}</button>
        <button className="btn ghost" disabled={!stack.items.length} onClick={() => { stack.clear(); setPicked(new Set()) }}>{tr('清空')}</button>
      </div>
      <div className="tm-list">
        {stack.items.map((t, i) => (
          <div key={i} className="tm-card">
            <label className="clip-pick">
              <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} /> 選取以縫合
            </label>
            <div style={{ whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'hidden' }}>{t.length > 300 ? t.slice(0, 300) + '…' : t}</div>
            <div className="pop-actions">
              <button className="btn ghost" onClick={() => onInsert(t)}>{tr('插入游標處')}</button>
              <button className="btn ghost" onClick={() => { stack.remove(i); setPicked(new Set()) }}>{tr('移除')}</button>
            </div>
          </div>
        ))}
        {stack.on && !stack.items.length && <p className="pop-empty">{tr('等你複製…')}</p>}
      </div>
      {stack.items.length > 1 && (
        <>
          <div className="set-sep" />
          <div className="hist-hint">{tr('AI 片段縫合：勾選 2 則以上，合成一段。按下後選取的片段會送到你設定的 AI 服務。')}</div>
          <div className="pop-actions">
            <select className="sb-select" value={style} onChange={(e) => setStyle(e.target.value as StitchStyle)}>
              <option value="plain">{tr('連貫段落')}</option>
              <option value="bullets">{tr('條列整理')}</option>
              <option value="outline">{tr('大綱')}</option>
            </select>
            <button className="btn" disabled={busy || chosen.length < 2 || !!cfg.missing} onClick={() => void stitch()}>
              {busy ? '縫合中…' : `縫合 ${chosen.length} 則`}
            </button>
          </div>
          {cfg.missing && <p className="pop-empty">{cfg.missing}</p>}
          {err && <p className="pop-empty">{err}</p>}
          {out && (
            <div className="tm-card">
              <div style={{ whiteSpace: 'pre-wrap' }}>{out}</div>
              <div className="pop-actions">
                <button className="btn" onClick={() => onInsert(out)}>{tr('插入游標處')}</button>
                <button className="btn ghost" onClick={() => setOut(null)}>{tr('捨棄')}</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

/* ------------------------------ 本地知識雷達 ------------------------------ */

const radarCache = new Map<string, RadarIndex>()
const RADAR_MAX_FILES = 500
const RADAR_MAX_BYTES = 200_000

export function RadarPanel({
  folder, docPath, query, onOpen
}: { folder: string | null; docPath: string | null; query: string; onOpen(path: string): void }) {
  const [idx, setIdx] = useState<RadarIndex | null>(() => (folder ? radarCache.get(folder) ?? null : null))
  const [building, setBuilding] = useState(false)
  const [q, setQ] = useState(query)
  useEffect(() => setQ(query), [query])

  const build = async () => {
    if (!folder || building) return
    setBuilding(true)
    const list = (await window.api.listAll(folder)).filter((f) => /\.(md|markdown|txt)$/i.test(f.name)).slice(0, RADAR_MAX_FILES)
    const docs = []
    for (const f of list) {
      const r = await window.api.readFile(f.path)
      if (r) docs.push({ path: f.path, name: f.name, rel: f.rel, content: r.content.slice(0, RADAR_MAX_BYTES) })
    }
    const built = buildIndex(docs)
    radarCache.set(folder, built)
    setIdx(built)
    setBuilding(false)
  }
  useEffect(() => {
    if (folder && !idx) void build()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder])

  const hits = useMemo(() => (idx ? queryIndex(idx, q, { exclude: docPath ?? undefined }) : []), [idx, q, docPath])

  if (!folder) return <p className="pop-empty">{tr('先開啟一個資料夾，雷達才有範圍可以掃描。')}</p>
  return (
    <>
      <div className="hist-hint">
        以選取的文字（沒選取則用游標之後的段落）在資料夾內找相關筆記。索引只存在記憶體，全程在本機計算，不會上傳。
      </div>
      <textarea
        className="radar-q"
        rows={3}
        value={q}
        placeholder={tr('輸入想找的內容…')}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="pop-actions">
        <button className="btn ghost" disabled={building} onClick={() => void build()}>
          {building ? '建立索引中…' : idx ? `重新建立索引（${idx.docs.length} 篇）` : '建立索引'}
        </button>
      </div>
      <div className="link-list col">
        {hits.map((h) => (
          <button key={h.path} onClick={() => onOpen(h.path)}>
            <b>{h.name.replace(/\.[^.]+$/, '')}</b>
            <small>{h.snippet}</small>
            <small>相符：{h.terms.join('、')}</small>
          </button>
        ))}
        {idx && q.trim() && !hits.length && <p className="pop-empty">{tr('沒有找到相關筆記。')}</p>}
      </div>
    </>
  )
}

const aiCache = new Map<string, { sig: string; issues: AiIssue[]; info: string }>()

/** AI 檢查：把全文文字段落送到使用者自己設定的 AI 服務，找錯字、語法、用詞不一致與前後矛盾。結果只供參考，不會改動文件。 */
function AiCheckTab({ prefs, update, getBlocks, onJumpBlock }: { prefs: AiPrefs; update(p: Partial<AiPrefs>): void; getBlocks(): BlockText[]; onJumpBlock(i: number, len: number): void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState(() => aiCache.get('cur') ?? null)
  const cfg = resolveAi(prefs)
  const stale = data ? signature(getBlocks()) !== data.sig : false
  const run = async () => {
    if (busy || cfg.missing) return
    const blocks = getBlocks()
    const p = prepare(blocks)
    if (p.items.length < 1) return setErr(tr('沒有可檢查的文字段落'))
    const req = buildCheckPrompt(p)
    setBusy(true)
    setErr(null)
    const r = await window.api.aiRewrite({ kind: cfg.kind, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, maxTokens: Math.max(cfg.maxTokens, 4096), instruction: req.instruction, text: req.text })
    setBusy(false)
    if ('error' in r) return setErr(r.error)
    if (r.usage && (r.usage.in || r.usage.out)) recordUsage(cfg.provider.id, r.usage, dayKey())
    const issues = parseCheckReply(r.text, new Set(p.items.map((i) => i.id)))
    if (!issues) return setErr(tr('模型沒有回傳可用的 JSON。可以再按一次，或換一個比較強的模型。'))
    const notes: string[] = []
    if (p.dropped) notes.push(trf('文章太長，有 {0} 段沒有送出', p.dropped))
    if (p.truncated) notes.push(trf('{0} 段只送了開頭', p.truncated))
    const d = { sig: signature(blocks), issues, info: notes.join('；') }
    aiCache.set('cur', d)
    setData(d)
  }
  return (
    <>
      <AiSetup s={prefs} update={update} compact />
      {cfg.missing && <p className="pop-empty">{cfg.missing}。</p>}
      <div className="hist-hint">{tr('按下後，全文的文字段落（不含程式碼）會送到你設定的 AI 服務。結果只供參考，不會改動文件。')}</div>
      <div className="pop-actions">
        <button className="btn" disabled={busy || !!cfg.missing} onClick={() => void run()}>{data ? tr('重新檢查') : tr('開始 AI 檢查')}</button>
      </div>
      {busy && <div className="ai-busy"><i /><span>{trf('{0} 正在檢查全文…', cfg.provider.label)}</span></div>}
      {err && <div className="ai-err">{err}</div>}
      {data && (
        <>
          {stale && <div className="ai-err">{tr('文件在檢查後改過了，點擊跳轉已停用。請重新檢查。')}</div>}
          {data.info && <div className="hist-hint">{data.info}</div>}
          {data.issues.length === 0 ? (
            <p className="pop-empty">{tr('AI 沒有發現問題。')}</p>
          ) : (
            <div className="tm-list">
              {data.issues.map((i, k) => (
                <button key={k} className="diag-row lv-info" disabled={stale} onClick={() => onJumpBlock(i.block, Math.min(i.text.length || 40, 200))}>
                  <b>{i.kind}</b>
                  <span>{i.text ? `「${i.text}」 · ` : ''}{i.fix}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
