import { PROVIDERS, providerOf, type AiPrefs } from '@/lib/ai'

type Update = (patch: Partial<AiPrefs>) => void

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
