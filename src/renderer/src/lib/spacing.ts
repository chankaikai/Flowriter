/** 行高設定：段落內（正文行高）、段落間（相鄰區塊的間距）、清單（清單項目行高）。三者各自獨立，並限制下限避免文字擠成一團。 */
export interface Spacing {
  /** 段落內行高（倍數） */
  lineHeight: number
  /** 段落間距（em） */
  paraGap: number
  /** 清單行高（倍數） */
  listLineHeight: number
}

export const SPACING_DEFAULT: Spacing = { lineHeight: 1.85, paraGap: 0.85, listLineHeight: 1.85 }

export const LH_MIN = 1.2
export const LH_MAX = 3
export const GAP_MAX = 2.4

/** 段落間距的下限：行高很小的時候，間距要更大，才分得出段落 */
export const gapMin = (lineHeight: number): number => (lineHeight < 1.4 ? 0.6 : 0.35)

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** 把任意輸入整理成安全範圍（讀取舊設定、使用者亂拉滑桿都用它） */
export function safeSpacing(s: Partial<Spacing>): Spacing {
  const lineHeight = clamp(num(s.lineHeight, SPACING_DEFAULT.lineHeight), LH_MIN, LH_MAX)
  return {
    lineHeight,
    paraGap: clamp(num(s.paraGap, SPACING_DEFAULT.paraGap), gapMin(lineHeight), GAP_MAX),
    listLineHeight: clamp(num(s.listLineHeight, SPACING_DEFAULT.listLineHeight), LH_MIN, LH_MAX)
  }
}
