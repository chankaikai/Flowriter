import { describe, it, expect } from 'vitest'
import { keyToAlpha, parseCssColor } from '@/lib/keyAlpha'

describe('keyToAlpha', () => {
  it('turns black-on-white into transparent with black ink', () => {
    const px = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255])
    keyToAlpha(px, [255, 255, 255], [0, 0, 0])
    expect(px[3]).toBe(0) // 白底 → 全透明
    expect(px[7]).toBe(255) // 黑字 → 不透明
    expect(px[11]).toBeGreaterThan(120) // 灰色抗鋸齒 → 半透明
    expect(px[11]).toBeLessThan(135)
    expect([px[4], px[5], px[6]]).toEqual([0, 0, 0])
  })
  it('works on dark backgrounds with light ink and keeps existing alpha', () => {
    const px = new Uint8Array([20, 20, 20, 255, 240, 240, 240, 100])
    keyToAlpha(px, [20, 20, 20], [240, 240, 240])
    expect(px[3]).toBe(0)
    expect(px[7]).toBe(100)
    expect([px[4], px[5], px[6]]).toEqual([240, 240, 240])
  })
  it('falls back to black/white ink when fg equals bg', () => {
    const px = new Uint8Array([250, 250, 250, 255, 0, 0, 0, 255])
    keyToAlpha(px, [250, 250, 250], [250, 250, 250])
    expect(px[7]).toBe(255)
  })
  it('parses css colors', () => {
    expect(parseCssColor('rgb(1, 2, 3)')).toEqual([1, 2, 3, 1])
    expect(parseCssColor('rgba(1,2,3,0.5)')).toEqual([1, 2, 3, 0.5])
    expect(parseCssColor('transparent')).toBeNull()
  })
})
