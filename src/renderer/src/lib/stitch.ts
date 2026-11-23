/** 片段縫合：把剪貼簿收集到的零散片段，交給 AI 合成一段連貫文字。 */
export type StitchStyle = 'plain' | 'bullets' | 'outline'

const MAX_TOTAL = 12_000
const MAX_EACH = 3_000

const STYLE_HINT: Record<StitchStyle, string> = {
  plain: '縫合成通順連貫的段落，必要時加上簡短的銜接語。',
  bullets: '整理成條列，相近的片段合併為同一項。',
  outline: '整理成有層次的大綱（用 Markdown 標題與條列）。'
}

export interface StitchRequest {
  instruction: string
  text: string
  /** 因長度被截掉的片段數，讓介面提醒使用者 */
  truncated: number
}

export function buildStitch(snippets: string[], style: StitchStyle): StitchRequest {
  const clean = snippets.map((s) => s.trim()).filter(Boolean)
  let total = 0
  let truncated = 0
  const parts: string[] = []
  clean.forEach((s, i) => {
    const piece = s.length > MAX_EACH ? s.slice(0, MAX_EACH) : s
    if (piece.length < s.length) truncated++
    if (total + piece.length > MAX_TOTAL) {
      truncated++
      return
    }
    total += piece.length
    parts.push(`【片段 ${i + 1}】\n${piece}`)
  })
  return {
    instruction:
      `以下是從不同地方收集來的零散片段。請${STYLE_HINT[style]}` +
      '只能使用片段裡已有的資訊，不要新增事實、數字或來源；保持原本的語言；片段之間互相矛盾時，保留兩種說法並註明。' +
      '只輸出結果本身，不要加說明，也不要輸出「片段 N」標記。',
    text: parts.join('\n\n'),
    truncated
  }
}
