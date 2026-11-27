/** 排版檢驗的 AI 檢查：錯字、語法、用詞不一致、前後矛盾。回傳 JSON，編號對應編輯器的文字區塊。 */
import { prepare, type BlockText, type Prepared } from './reverseOutline'

export interface AiIssue {
  block: number
  kind: string
  /** 有問題的原文片段（短） */
  text: string
  /** 建議怎麼改（一句話） */
  fix: string
}

export { prepare }
export type { BlockText, Prepared }

export const KINDS = ['錯字', '語法', '用詞', '標點', '邏輯', '矛盾'] as const

export function buildCheckPrompt(p: Prepared): { instruction: string; text: string } {
  return {
    instruction: [
      '你是嚴謹的中文校對編輯。下面是一篇文章，每段前面有編號【編號】。請找出：錯字、語法錯誤、用詞或術語前後不一致、標點誤用、邏輯不通順、前後矛盾。',
      '只輸出一個 JSON 物件，不要任何說明、不要程式碼圍欄：{"issues":[{"block":段落編號,"kind":"錯字|語法|用詞|標點|邏輯|矛盾","text":"有問題的原文片段（不超過 30 字，必須是原文裡真的出現的連續文字）","fix":"一句話說明怎麼改"}]}',
      '規則：block 只能用下面出現過的編號；沒有問題就回傳 {"issues":[]}；只報你有把握的，不要為了湊數而硬挑；風格偏好不算錯。'
    ].join('\n'),
    text: p.items.map((i) => `【${i.id}】${i.text}`).join('\n\n')
  }
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export function parseCheckReply(raw: string, valid: Set<number>): AiIssue[] | null {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  s = s.slice(a, b + 1)
  let j: any
  try {
    j = JSON.parse(s)
  } catch {
    return null
  }
  if (!j || !Array.isArray(j.issues)) return null
  const out: AiIssue[] = []
  for (const it of j.issues) {
    const block = Number(it?.block)
    if (!Number.isInteger(block) || !valid.has(block)) continue
    const fix = clean(it?.fix, 200)
    if (!fix) continue
    const kind = (KINDS as readonly string[]).includes(it?.kind) ? it.kind : '其他'
    out.push({ block, kind, text: clean(it?.text, 60), fix })
    if (out.length >= 80) break
  }
  return out
}
