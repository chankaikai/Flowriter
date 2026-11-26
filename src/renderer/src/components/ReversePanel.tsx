import { useState } from 'react'
import { AiSetup } from './AiSetup'
import { resolveAi, type AiPrefs } from '@/lib/ai'
import { recordUsage } from '@/lib/aiUsage'
import { dayKey } from '@/lib/writing'
import { buildPrompt, outlineToMarkdown, parseReply, prepare, signature, type BlockText, type Flag, type OutlineNode, type ReverseResult } from '@/lib/reverseOutline'
import { tr, trf } from '@/lib/i18n'

interface Cached {
  res: ReverseResult
  sig: string
  info: string
  /** 編號 → 開頭文字，列表顯示用（不依賴之後的文件狀態） */
  heads: Record<number, string>
  lens: Record<number, number>
}
/** 關掉面板再開不用重跑（只存在記憶體，不寫檔） */
const cache = new Map<string, Cached>()

export function ReversePanel({
  docKey, prefs, update, getBlocks, onJump, onCopy
}: {
  docKey: string
  prefs: AiPrefs
  update(patch: Partial<AiPrefs>): void
  getBlocks(): BlockText[]
  onJump(blockIndex: number, len: number): void
  onCopy(md: string): void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<Cached | null>(cache.get(docKey) ?? null)
  const cfg = resolveAi(prefs)
  const stale = data ? signature(getBlocks()) !== data.sig : false

  const run = async () => {
    if (busy || cfg.missing) return
    const blocks = getBlocks()
    const p = prepare(blocks)
    if (p.items.length < 3) return setErr(tr('文字段落太少（至少 3 段），不需要逆向大綱'))
    const req = buildPrompt(p)
    setBusy(true)
    setErr(null)
    const r = await window.api.aiRewrite({
      kind: cfg.kind, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, maxTokens: Math.max(cfg.maxTokens, 4096),
      instruction: req.instruction, text: req.text
    })
    setBusy(false)
    if ('error' in r) return setErr(r.error)
    if (r.usage && (r.usage.in || r.usage.out)) recordUsage(cfg.provider.id, r.usage, dayKey())
    const res = parseReply(r.text, new Set(p.items.map((i) => i.id)))
    if (!res) return setErr(tr('模型沒有回傳可用的 JSON。可以再按一次，或換一個比較強的模型。'))
    const heads: Record<number, string> = {}
    const lens: Record<number, number> = {}
    for (const b of blocks) {
      heads[b.index] = b.text.replace(/\s+/g, ' ').trim().slice(0, 28)
      lens[b.index] = b.text.length
    }
    const notes: string[] = []
    if (p.dropped) notes.push(trf('文章太長，有 {0} 段沒有送出', p.dropped))
    if (p.truncated) notes.push(trf('{0} 段只送了開頭', p.truncated))
    const c: Cached = { res, sig: signature(blocks), info: notes.join('；'), heads, lens }
    cache.set(docKey, c)
    setData(c)
  }

  const jump = (i: number) => data && onJump(i, Math.min(data.lens[i] ?? 0, 200))
  const head = (i: number) => (data?.heads[i] ? `${data.heads[i]}…` : `#${i}`)

  const tree = (ns: OutlineNode[], d: number): JSX.Element[] =>
    ns.map((n, k) => (
      <div key={`${d}-${k}`} style={{ marginLeft: d * 14 }}>
        <div className="rv-point">
          <button className="rv-link" disabled={!n.blocks.length || stale} onClick={() => jump(n.blocks[0])} title={n.blocks.length ? head(n.blocks[0]) : ''}>
            {n.point}
          </button>
          {n.blocks.length > 1 && <span className="rv-refs">{n.blocks.map((b, i) => <button key={b} className="rv-ref" disabled={stale} onClick={() => jump(b)}>{i + 1}</button>)}</span>}
        </div>
        {tree(n.children, d + 1)}
      </div>
    ))

  const flags = (title: string, list: Flag[], showOf: boolean) =>
    list.length > 0 && (
      <>
        <div className="set-sep" />
        <div className="hist-hint">{title}</div>
        {list.map((f) => (
          <div key={f.block} className="rv-flag">
            <button className="rv-link" disabled={stale} onClick={() => jump(f.block)}>{head(f.block)}</button>
            <div className="rv-why">
              {f.reason}
              {showOf && f.of !== undefined && (
                <> · {tr('重複自')} <button className="rv-link" disabled={stale} onClick={() => jump(f.of!)}>{head(f.of)}</button></>
              )}
            </div>
          </div>
        ))}
      </>
    )

  return (
    <>
      <AiSetup s={prefs} update={update} compact />
      {cfg.missing && <p className="pop-empty">{cfg.missing}。</p>}
      <div className="hist-hint">{tr('按下後，全文的文字段落（不含程式碼）會送到你設定的 AI 服務。結果只用來參考，不會改動文件。')}</div>
      <div className="pop-actions">
        <button className="btn" disabled={busy || !!cfg.missing} onClick={() => void run()}>{data ? tr('重新分析') : tr('分析全文')}</button>
        {data && <button className="btn ghost" onClick={() => onCopy(outlineToMarkdown(data.res))}>{tr('複製大綱')}</button>}
      </div>
      {busy && <div className="ai-busy"><i /><span>{trf('{0} 正在讀全文…', cfg.provider.label)}</span></div>}
      {err && <div className="ai-err">{err}</div>}
      {data && (
        <>
          {stale && <div className="ai-err">{tr('文件在分析後改過了，點擊跳轉已停用。請重新分析。')}</div>}
          {data.info && <div className="hist-hint">{data.info}</div>}
          {data.res.thesis && <div className="ai-out rv-thesis"><b>{tr('核心觀點')}</b>：{data.res.thesis}</div>}
          <div className="rv-tree">{tree(data.res.outline, 0)}</div>
          {flags(tr('內容重複的段落'), data.res.redundant, true)}
          {flags(tr('可能偏離主題的段落'), data.res.offtopic, false)}
          {!data.res.redundant.length && !data.res.offtopic.length && <div className="hist-hint">{tr('沒有發現重複或離題的段落。')}</div>}
        </>
      )}
    </>
  )
}
