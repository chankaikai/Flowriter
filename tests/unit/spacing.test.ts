import { describe, expect, it } from 'vitest'
import { gapMin, safeSpacing, SPACING_DEFAULT } from '../../src/renderer/src/lib/spacing'

describe('spacing', () => {
  it('預設值原樣通過', () => expect(safeSpacing(SPACING_DEFAULT)).toEqual(SPACING_DEFAULT))
  it('超出範圍會被夾住，三者互不影響', () => {
    const s = safeSpacing({ lineHeight: 9, paraGap: 99, listLineHeight: 0 })
    expect(s).toEqual({ lineHeight: 3, paraGap: 2.4, listLineHeight: 1.2 })
  })
  it('行高很小時段落間距下限提高，避免擠在一起', () => {
    expect(gapMin(1.3)).toBeGreaterThan(gapMin(1.9))
    expect(safeSpacing({ lineHeight: 1.3, paraGap: 0.1 }).paraGap).toBe(0.6)
  })
  it('壞資料退回預設', () => expect(safeSpacing({ lineHeight: NaN as number })).toEqual(SPACING_DEFAULT))
})
