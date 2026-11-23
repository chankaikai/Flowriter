/** AI 服務商清單。除 Claude 外都走 OpenAI 相容的 /chat/completions 介面。模型名稱只是建議，可自行改。 */
export type AiKind = 'anthropic' | 'openai'

export interface AiProvider {
  id: string
  label: string
  kind: AiKind
  baseUrl: string
  models: string[]
  needsKey: boolean
  keyHint: string
  /** 到這裡看餘額與用量（沒有公開查詢介面的服務商用） */
  consoleUrl?: string
}

export const PROVIDERS: AiProvider[] = [
  {
    id: 'anthropic', label: 'Claude', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', needsKey: true,
    models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-2'],
    keyHint: '在 console.anthropic.com 建立，格式 sk-ant-…',
    consoleUrl: 'https://console.anthropic.com/settings/billing'
  },
  {
    id: 'deepseek', label: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true,
    models: ['deepseek-chat', 'deepseek-reasoner'], keyHint: '在 platform.deepseek.com 建立',
    consoleUrl: 'https://platform.deepseek.com/usage'
  },
  {
    id: 'qwen', label: '通義千問 Qwen', kind: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', needsKey: true,
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
    keyHint: '阿里雲百鍊（DashScope）。國際站請把網址改成 dashscope-intl.aliyuncs.com',
    consoleUrl: 'https://bailian.console.aliyun.com/'
  },
  {
    id: 'openai', label: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true,
    models: ['gpt-4o', 'gpt-4o-mini'], keyHint: '在 platform.openai.com 建立',
    consoleUrl: 'https://platform.openai.com/settings/organization/billing/overview'
  },
  {
    id: 'moonshot', label: 'Kimi（月之暗面）', kind: 'openai', baseUrl: 'https://api.moonshot.cn/v1', needsKey: true,
    models: ['moonshot-v1-32k', 'kimi-latest'], keyHint: '在 platform.moonshot.cn 建立',
    consoleUrl: 'https://platform.moonshot.cn/console/info'
  },
  {
    id: 'zhipu', label: '智譜 GLM', kind: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', needsKey: true,
    models: ['glm-4-plus', 'glm-4-flash'], keyHint: '在 open.bigmodel.cn 建立',
    consoleUrl: 'https://open.bigmodel.cn/finance-center/finance/overview'
  },
  {
    id: 'gemini', label: 'Gemini', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true,
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'], keyHint: '在 aistudio.google.com 建立',
    consoleUrl: 'https://aistudio.google.com/'
  },
  {
    id: 'siliconflow', label: 'SiliconFlow（矽基流動）', kind: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', needsKey: true,
    models: ['Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3'], keyHint: '在 cloud.siliconflow.cn 建立',
    consoleUrl: 'https://cloud.siliconflow.cn/account/billing'
  },
  {
    id: 'openrouter', label: 'OpenRouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true,
    models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4.5'], keyHint: '在 openrouter.ai/keys 建立；模型名稱格式為 廠商/模型',
    consoleUrl: 'https://openrouter.ai/credits'
  },
  {
    id: 'ollama', label: 'Ollama（本機）', kind: 'openai', baseUrl: 'http://localhost:11434/v1', needsKey: false,
    models: ['qwen2.5', 'llama3.1', 'deepseek-r1'], keyHint: '本機執行，不需要金鑰；請先 ollama pull 對應模型'
  },
  {
    id: 'custom', label: '自訂（OpenAI 相容）', kind: 'openai', baseUrl: '', needsKey: false,
    models: [], keyHint: '任何相容 /chat/completions 的服務，例如 OpenRouter、SiliconFlow、vLLM'
  }
]

export const providerOf = (id: string): AiProvider => PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]

export interface AiPrefs {
  aiProvider: string
  aiKeys: Record<string, string>
  aiModels: Record<string, string>
  aiBaseUrls: Record<string, string>
  aiMaxTokens?: number
}

export interface ResolvedAi {
  provider: AiProvider
  kind: AiKind
  baseUrl: string
  apiKey: string
  model: string
  maxTokens: number
  /** 缺少什麼設定；null 表示可以呼叫 */
  missing: string | null
}

export function resolveAi(s: AiPrefs): ResolvedAi {
  const provider = providerOf(s.aiProvider)
  const baseUrl = (s.aiBaseUrls[provider.id] || provider.baseUrl).trim().replace(/\/+$/, '')
  const apiKey = (s.aiKeys[provider.id] || '').trim()
  const model = (s.aiModels[provider.id] || provider.models[0] || '').trim()
  let missing: string | null = null
  if (!baseUrl) missing = '請填入服務網址（Base URL）'
  else if (provider.needsKey && !apiKey) missing = `請先到「偏好設定 → AI 改寫」填入 ${provider.label} 的 API 金鑰`
  else if (!model) missing = '請填入模型名稱'
  const maxTokens = Math.max(256, Math.min(32768, Math.floor(s.aiMaxTokens || 4096)))
  return { provider, kind: provider.kind, baseUrl, apiKey, model, maxTokens, missing }
}
