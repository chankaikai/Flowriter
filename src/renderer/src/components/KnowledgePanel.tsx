import { useEffect, useState } from 'react'
import { AiSetup } from './AiSetup'
import { resolveAi, type AiPrefs } from '@/lib/ai'
import { recordUsage } from '@/lib/aiUsage'
import { dayKey } from '@/lib/writing'
import { cachedIndex, loadIndex, type RadarIndex } from '@/lib/radar'
import { buildAskPrompt, buildOutlinePrompt, checkOverlap, parseOutline, queryParas, type OverlapReport, type ParaHit } from '@/lib/knowledge'
import type { BlockText } from '@/lib/reverseOutline'
import { tr, trf } from '@/lib/i18n'

type Tab = 'ask' | 'dup' | 'outline'

/**
 * 知識庫：以目前資料夾的筆記為資料來源。
 * - 問答：本機檢索相關段落，只把這些段落與問題送給你設定的 AI。
 * - 查重：完全在本機比對，不上傳；只和資料夾內的其他筆記比，不是線上查重服務。
 * - 大綱：依主題或目前全文擬大綱，確認後才插入文件。
 */
export function KnowledgePanel({
  folder, docPath, prefs, update, getBlocks, onJump, onOpen, onInsert
}: {
  folder: string | null
  docPath: string | null
  prefs: AiPrefs
  update(patch: Partial<AiPrefs>): void
  getBlocks(): BlockText[]
  onJump(blockIndex: number, len: number): void
  onOpen(path: string): void
  onInsert(md: string): void
}) {
  const [tab, setTab] = useState<Tab>('ask')
  const [idx, setIdx] = useState<RadarIndex | null>(() => (folder ? cachedIndex(folder) : null))
  const [building, setBuilding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cfg = resolveAi(prefs)

  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<{ text: string; hits: ParaHit[] } | null>(null)
  const [dup, setDup] = useState<OverlapReport | null>(null)
  const [topic, setTopic] = useState('')
  const [outline, setOutline] = useState<string[] | null>(null)

  const build = async (force: boolean) => {
    if (!folder || building) return
    setBuilding(true)
    try {
      setIdx(await loadIndex(folder, force))
    } finally {
      setBuilding(false)
    }
  }
  useEffect(() => {
    if (folder && !idx) void build(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder])

  async function callAi(req: { instruction: string; text: string }): Promise<string | null> {
    setBusy(true)
    setErr(null)
    try {
      const r = await window.api.aiRewrite({
        kind: cfg.kind, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, maxTokens: Math.max(cfg.maxTokens, 2048),
        instruction: req.instruction, text: req.text
      })
      if ('error' in r) {
        setErr(r.error)
        return null
      }
      if (r.usage && (r.usage.in || r.usage.out)) recordUsage(cfg.provider.id, r.usage, dayKey())
      return r.text
    } finally {
      setBusy(false)
    }
  }

  async function ask() {
    if (!idx || busy || cfg.missing || !q.trim()) return
    const hits = queryParas(idx, q, { exclude: docPath ?? undefined, limit: 6 })
    if (!hits.length) {
      setAnswer(null)
      return setErr(tr('筆記裡沒有找到相關內容，換個說法試試。'))
    }
    const t = await callAi(buildAskPrompt(q.trim(), hits))
    if (t != null) setAnswer({ text: t.trim(), hits })
  }

  function runDup() {
    if (!idx) return
    const blocks = getBlocks()
    if (!blocks.length) return setErr(tr('文件裡沒有文字段落'))
    setErr(null)
    setDup(checkOverlap(blocks, idx, { exclude: docPath ?? undefined }))
  }

  async function makeOutline() {
    if (busy || cfg.missing) return
    const blocks = getBlocks()
    const body = blocks.map((b) => b.text).join('\n').slice(0, 12000)
    const src = topic.trim() ? topic.trim() : body
    if (!src) return setErr(tr('請輸入主題，或先在文件裡寫一些內容'))
    const t = await callAi(buildOutlinePrompt(src, !topic.trim()))
    if (t == null) return
    const lines = parseOutline(t)
    if (!lines.length) return setErr(tr('模型沒有回傳可用的標題。可以再按一次，或換一個比較強的模型。'))
    setOutline(lines)
  }

  if (!folder) return <p className="pop-empty">{tr('先開啟一個資料夾，知識庫才有範圍可以讀取。')}</p>

  return (
    <>
      <div className="pop-actions" style={{ justifyContent: 'flex-start' }}>
        {(['ask', 'dup', 'outline'] as Tab[]).map((t) => (
          <button key={t} className={`btn ${tab === t ? '' : 'ghost'}`} onClick={() => { setTab(t); setErr(null) }}>
            {t === 'ask' ? tr('問知識庫') : t === 'dup' ? tr('查重') : tr('自動大綱')}
          </button>
        ))}
        <button className="btn ghost" disabled={building} onClick={() => void build(true)}>
          {building ? tr('建立索引中…') : trf('重建索引（{0} 篇）', idx?.docs.length ?? 0)}
        </button>
      </div>

      {tab !== 'dup' && (
        <>
          <AiSetup s={prefs} update={update} compact />
          {cfg.missing && <p className="pop-empty">{cfg.missing}。</p>}
        </>
      )}

      {tab === 'ask' && (
        <>
          <div className="hist-hint">{tr('先在本機找出最相關的段落，只把這些段落與問題送給你設定的 AI；回答會標註來源編號。')}</div>
          <textarea className="radar-q" rows={3} value={q} placeholder={tr('問一個問題…')} onChange={(e) => setQ(e.target.value)} />
          <div className="pop-actions">
            <button className="btn" disabled={busy || !idx || !!cfg.missing || !q.trim()} onClick={() => void ask()}>{busy ? tr('思考中…') : tr('提問')}</button>
          </div>
          {answer && (
            <>
              <div className="kb-answer" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>{answer.text}</div>
              <div className="set-sep" />
              <div className="hist-hint">{tr('來源')}</div>
              <div className="link-list col">
                {answer.hits.map((h, i) => (
                  <button key={i} onClick={() => onOpen(h.path)}>
                    <b>[{i + 1}] {h.name}</b>
                    <small>{h.text.replace(/\s+/g, ' ').slice(0, 120)}</small>
                  </button>
                ))}
              </div>
              <div className="pop-actions">
                <button className="btn ghost" onClick={() => onInsert(answer.text)}>{tr('插入到游標處')}</button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'dup' && (
        <>
          <div className="hist-hint">{tr('把目前文件的每個段落與資料夾內其他筆記比對（字元 5 連詞重疊）。完全在本機計算、不上傳；它只能找出和你自己筆記的重複，不等於線上查重或學術查重。')}</div>
          <div className="pop-actions">
            <button className="btn" disabled={!idx} onClick={runDup}>{dup ? tr('重新檢查') : tr('開始查重')}</button>
          </div>
          {dup && (
            <>
              <div className="hist-hint">
                {trf('已檢查 {0} 字，疑似重複約 {1}%，共 {2} 段。', dup.checked, Math.round(dup.ratio * 100), dup.flags.length)}
              </div>
              {dup.flags.map((f) => (
                <div key={f.block} className="rv-flag">
                  <button className="rv-link" onClick={() => onJump(f.block, Math.min(f.len, 200))}>{f.head}…</button>
                  <div className="rv-why">
                    {Math.round(f.ratio * 100)}% · {tr('相似於')} <button className="rv-link" onClick={() => onOpen(f.path)}>{f.from}</button>
                  </div>
                </div>
              ))}
              {!dup.flags.length && <p className="pop-empty">{tr('沒有發現和其他筆記高度重複的段落。')}</p>}
            </>
          )}
        </>
      )}

      {tab === 'outline' && (
        <>
          <div className="hist-hint">{tr('填主題就依主題擬大綱；留空則依目前全文（最多前 12000 字）重新整理。結果先預覽，按插入才會寫進文件。')}</div>
          <input className="radar-q" value={topic} placeholder={tr('主題（可留空）')} onChange={(e) => setTopic(e.target.value)} />
          <div className="pop-actions">
            <button className="btn" disabled={busy || !!cfg.missing} onClick={() => void makeOutline()}>{busy ? tr('思考中…') : tr('產生大綱')}</button>
          </div>
          {outline && (
            <>
              <pre className="kb-outline" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>{outline.join('\n')}</pre>
              <div className="pop-actions">
                <button className="btn" onClick={() => onInsert(outline.join('\n\n') + '\n')}>{tr('插入到游標處')}</button>
                <button className="btn ghost" onClick={() => void navigator.clipboard.writeText(outline.join('\n'))}>{tr('複製')}</button>
              </div>
            </>
          )}
        </>
      )}

      {err && <p className="pop-empty">{err}</p>}
    </>
  )
}
