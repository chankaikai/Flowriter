import { useState } from 'react'
import { PROVIDERS, providerOf, resolveAi, type AiPrefs } from '@/lib/ai'

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
          <span>服務商</span>
          <select className="ai-input" value={p.id} onChange={(e) => update({ aiProvider: e.target.value })}>
            {PROVIDERS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>模型</span>
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
      {!compact && (
        <>
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
            <span>服務網址（Base URL）</span>
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
