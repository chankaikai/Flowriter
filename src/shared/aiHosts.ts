/** 依服務網址判斷這個服務商有沒有公開的「餘額查詢」介面，以及本機服務。主程序與渲染端共用。 */
export type BalanceKind = 'deepseek' | 'moonshot' | 'siliconflow' | 'openrouter'

export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function balanceKind(baseUrl: string): BalanceKind | null {
  const h = hostOf(baseUrl)
  if (h === 'api.deepseek.com') return 'deepseek'
  if (h === 'api.moonshot.cn' || h === 'api.moonshot.ai') return 'moonshot'
  if (h === 'api.siliconflow.cn' || h === 'api.siliconflow.com') return 'siliconflow'
  if (h === 'openrouter.ai') return 'openrouter'
  return null
}

/** localhost、迴圈位址與區域網路位址都算本機服務（沒有帳戶額度）。 */
export function isLocalUrl(baseUrl: string): boolean {
  const h = hostOf(baseUrl)
  if (!h) return false
  if (h === 'localhost' || h === '::1' || h === '[::1]' || h.endsWith('.local')) return true
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h)
  if (!m) return false
  const a = +m[1]
  const b = +m[2]
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}
