import { useState } from 'react'
import { PROVIDERS, providerOf, resolveAi, type AiPrefs } from '@/lib/ai'
import { balanceKind, isLocalUrl } from '../../../shared/aiHosts'
import { fmtTokens, loadUsage, readUsage } from '@/lib/aiUsage'
import { dayKey } from '@/lib/writing'
import { tr } from '@/lib/i18n'

type Update = (patch: Partial<AiPrefs>) => void

type TestState = { s: 'idle' } | { s: 'busy' } | { s: 'ok'; ms: number; reply: string } | { s: 'err'; msg: string }

/** 送一個極短的請求，確認網址、金鑰與模型名稱都能用。 */
function TestButton({ prefs }: { prefs: AiPrefs }) {
  const [t, setT] = useState<TestState>({ s: 'idle' })
  const cfg = resolveAi(prefs)
  const run = async () => {
    if (cfg.missing) return setT({ s: 'err', msg: cfg.missing })
    setT({ s: 'busy' })
    const r = await window.api.aiTest({ kind: cfg.kind, baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model, instruction: '', text: '' })
    setT(r.ok ? { s: 'ok', ms: r.ms, reply: r.reply } : { s: 'err', msg: r.error })
  }
  return (
    <div className="ai-test">
      <button className="btn ghost" disabled={t.s === 'busy'} onClick={() => void run()}>
        {t.s === 'busy' ? '測試中…' : '測試連線'}
      </button>
      {t.s === 'ok' && <span className="ai-test-ok">連線成功（{t.ms} 毫秒）{t.reply ? `，模型回覆：${t.reply}` : ''}</span>}
      {t.s === 'err' && <span className="ai-test-err">{t.msg}</span>}
    </div>
  )
}

type BalState = { s: 'idle' } | { s: 'busy' } | { s: 'ok'; lines: string[] } | { s: 'err'; msg: string }

/** 額度與用量：本機模型顯示「無額度限制」；有公開餘額介面的服務商可直接查；其餘引導到控制台。累計 token 用量一律顯示。 */
function QuotaBlock({ prefs }: { prefs: AiPrefs }) {
  const cfg = resolveAi(prefs)
  const [bal, setBal] = useState<BalState>({ s: 'idle' })
  const local = isLocalUrl(cfg.baseUrl)
  const canQuery = !local && balanceKind(cfg.baseUrl) != null
  const u = readUsage(loadUsage(), cfg.provider.id, dayKey())
  const query = async () => {
    setBal({ s: 'busy' })
    const r = await window.api.aiBalance({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey })
    if (r.ok) setBal({ s: 'ok', lines: r.lines })
    else setBal({ s: 'err', msg: r.unsupported ? '這個服務沒有公開的餘額查詢介面。' : r.error })
  }
  return (
    <div className="ai-quota">
      <div className="ai-quota-title">{tr('額度與用量')}</div>
      {local ? (
        <p className="hist-hint">{tr('本機模型沒有帳戶額度，不計費；實際上限取決於模型的上下文長度與你的記憶體。')}</p>
      ) : canQuery ? (
        <div className="ai-test">
          <button className="btn ghost" disabled={bal.s === 'busy'} onClick={() => void query()}>
            {bal.s === 'busy' ? '查詢中…' : '查詢帳戶餘額'}
          </button>
          {bal.s === 'ok' && <span className="ai-test-ok">{bal.lines.join('；')}</span>}
          {bal.s === 'err' && <span className="ai-test-err">{bal.msg}</span>}
        </div>
      ) : (
        <p className="hist-hint">
          {cfg.provider.label} 沒有公開的餘額查詢介面，無法在這裡顯示剩餘額度。
          {cfg.provider.consoleUrl && (
            <> <a href="#" onClick={(e) => { e.preventDefault(); window.api.openExternal(cfg.provider.consoleUrl!) }}>{tr('到控制台查看餘額與用量')}</a></>
          )}
        </p>
      )}
      <p className="hist-hint">
        在 Inkwell 的用量（本機統計）：今日 輸入 {fmtTokens(u.todayIn)} / 輸出 {fmtTokens(u.todayOut)} tokens；
        累計 {fmtTokens(u.totalIn + u.totalOut)} tokens，共 {u.calls} 次。
      </p>
    </div>
  )
}

/** 服務商 + 模型選擇。compact 用在 AI 面板；完整版（含金鑰、網址）用在偏好設定。 */
export function AiSetup({ s, update, compact }: { s: AiPrefs; update: Update; compact?: boolean }) {
  const p = providerOf(s.aiProvider)
  const setMap = (k: 'aiKeys' | 'aiModels' | 'aiBaseUrls', v: string) =>
    update({ [k]: { ...s[k], [p.id]: v } } as Partial<AiPrefs>)
  const listId = `models-${p.id}`
  return (
    <div className={`ai-setup${compact ? ' compact' : ''}`}>
      <div className="ai-grid">
        <label>
          <span>{tr('服務商')}</span>
          <select className="ai-input" value={p.id} onChange={(e) => update({ aiProvider: e.target.value })}>
            {PROVIDERS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{tr('模型')}</span>
          <input
            className="ai-input" list={listId} spellCheck={false}
            placeholder={p.models[0] || '模型名稱'}
            value={s.aiModels[p.id] ?? ''}
            onChange={(e) => setMap('aiModels', e.target.value)}
          />
          <datalist id={listId}>
            {p.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>
      <TestButton prefs={s} />
      <QuotaBlock prefs={s} />
      {!compact && (
        <>
          <label>
            <span>{tr('回覆長度上限（max tokens）')}</span>
            <input
              className="ai-input" type="number" min={256} max={32768} step={256}
              value={s.aiMaxTokens ?? 4096}
              onChange={(e) => update({ aiMaxTokens: Math.max(256, Math.min(32768, Math.floor(+e.target.value || 4096))) })}
            />
          </label>
          <p className="hist-hint">{tr('推理型模型（會先「思考」再回答）常把額度花在思考上；若改寫結果是空的，請調大這個值，或換成非推理模型。')}</p>
          <label>
            <span>{p.needsKey ? 'API 金鑰' : 'API 金鑰（可留空）'}</span>
            <input
              className="ai-input" type="password" autoComplete="off" spellCheck={false}
              placeholder={p.needsKey ? '貼上金鑰' : '本機服務通常不需要'}
              value={s.aiKeys[p.id] ?? ''}
              onChange={(e) => setMap('aiKeys', e.target.value.trim())}
            />
          </label>
          <label>
            <span>{tr('服務網址（Base URL）')}</span>
            <input
              className="ai-input" spellCheck={false} placeholder={p.baseUrl || 'https://…/v1'}
              value={s.aiBaseUrls[p.id] ?? ''}
              onChange={(e) => setMap('aiBaseUrls', e.target.value.trim())}
            />
          </label>
          <p className="hist-hint">{p.keyHint}。金鑰只保存在這台電腦，請求由本機程序直連服務商。</p>
        </>
      )}
    </div>
  )
}
