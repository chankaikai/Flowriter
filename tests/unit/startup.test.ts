import { describe, it, expect } from 'vitest'
import { safeFileBase, suggestedName } from '@/lib/startup'

describe('suggested file name', () => {
  it('uses the first level-1 heading', () => {
    expect(suggestedName('前言\n\n# 我的 **論文**: 標題\n\n## 小節\n# 第二個')).toBe('我的 論文 標題')
  })
  it('ignores headings inside code fences and level 2+', () => {
    expect(suggestedName('```\n# not a title\n```\n## sub')).toBe('未命名')
  })
  it('falls back to 未命名 for empty or unusable titles', () => {
    expect(suggestedName('')).toBe('未命名')
    expect(suggestedName('# ???')).toBe('未命名')
  })
  it('strips links, trailing hashes and illegal characters', () => {
    expect(suggestedName('# [文檔](http://a.b) ##')).toBe('文檔')
    expect(safeFileBase('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
    expect(safeFileBase('x'.repeat(200)).length).toBe(80)
    expect(safeFileBase('名字...')).toBe('名字')
  })
})
