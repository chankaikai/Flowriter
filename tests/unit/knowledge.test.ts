import { describe, expect, it } from 'vitest'
import { buildIndex } from '../../src/renderer/src/lib/radar'
import { checkOverlap, parseOutline, queryParas } from '../../src/renderer/src/lib/knowledge'

const idx = buildIndex([
  { path: '/a.md', name: 'a.md', rel: 'a.md', content: '# A\n\n光合作用是植物利用光能把二氧化碳和水轉換成有機物並釋放氧氣的過程。\n\n今天天氣很好。' },
  { path: '/b.md', name: 'b.md', rel: 'b.md', content: '# B\n\n牛頓第二定律說明力等於質量乘以加速度，是古典力學的核心。' }
])

describe('knowledge', () => {
  it('queryParas finds the relevant paragraph', () => {
    const h = queryParas(idx, '光合作用 是什麼')
    expect(h[0].name).toBe('a')
    expect(h[0].text).toContain('光合作用')
  })
  it('checkOverlap flags copied paragraph and ignores original', () => {
    const r = checkOverlap(
      [
        { index: 0, text: '光合作用是植物利用光能把二氧化碳和水轉換成有機物並釋放氧氣的過程。' },
        { index: 1, text: '這是一段完全原創而且沒有出現在任何地方的文字內容，用來測試。' }
      ],
      idx
    )
    expect(r.flags.map((f) => f.block)).toEqual([0])
    expect(r.flags[0].from).toBe('a.md')
  })
  it('checkOverlap excludes the current document itself', () => {
    const r = checkOverlap([{ index: 0, text: '光合作用是植物利用光能把二氧化碳和水轉換成有機物並釋放氧氣的過程。' }], idx, { exclude: '/a.md' })
    expect(r.flags).toHaveLength(0)
  })
  it('parseOutline keeps only heading lines', () => {
    expect(parseOutline('```\n# 一\n說明文字\n## 二\n```')).toEqual(['# 一', '## 二'])
  })
})
