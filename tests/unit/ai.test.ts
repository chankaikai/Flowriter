import { describe, expect, it } from 'vitest'
import { PROVIDERS, providerOf, resolveAi, type AiPrefs } from '@/lib/ai'

const base: AiPrefs = { aiProvider: 'deepseek', aiKeys: {}, aiModels: {}, aiBaseUrls: {} }

describe('resolveAi', () => {
  it('缺金鑰時指出是哪個服務商', () => {
    expect(resolveAi(base).missing).toContain('DeepSeek')
  })
  it('填了金鑰就用預設模型與網址', () => {
    const r = resolveAi({ ...base, aiKeys: { deepseek: ' k ' } })
    expect(r.missing).toBeNull()
    expect(r.apiKey).toBe('k')
    expect(r.model).toBe('deepseek-chat')
    expect(r.kind).toBe('openai')
  })
  it('Claude 走原生介面', () => {
    expect(resolveAi({ ...base, aiProvider: 'anthropic' }).kind).toBe('anthropic')
  })
  it('本機 Ollama 不需要金鑰', () => {
    expect(resolveAi({ ...base, aiProvider: 'ollama' }).missing).toBeNull()
  })
  it('自訂服務必須填網址與模型，網址去掉結尾斜線', () => {
    expect(resolveAi({ ...base, aiProvider: 'custom' }).missing).toContain('Base URL')
    const r = resolveAi({
      ...base, aiProvider: 'custom', aiBaseUrls: { custom: 'https://x.com/v1//' }, aiModels: { custom: 'm' }
    })
    expect(r.missing).toBeNull()
    expect(r.baseUrl).toBe('https://x.com/v1')
  })
  it('使用者填的模型與網址優先於預設', () => {
    const r = resolveAi({
      ...base, aiKeys: { deepseek: 'k' }, aiModels: { deepseek: 'my-model' }, aiBaseUrls: { deepseek: 'http://proxy/v1' }
    })
    expect(r.model).toBe('my-model')
    expect(r.baseUrl).toBe('http://proxy/v1')
  })
  it('未知服務商退回第一個', () => {
    expect(providerOf('nope').id).toBe(PROVIDERS[0].id)
  })
  it('服務商 id 不重複', () => {
    const ids = PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
