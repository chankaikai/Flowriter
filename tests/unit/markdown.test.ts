import { describe, expect, it } from 'vitest'
import { computeStats, fuzzyScore, moveSection, parseOutline, sectionRange } from '@/lib/markdown'

describe('parseOutline', () => {
  it('解析各級標題並去掉行內標記', () => {
    const o = parseOutline('# 標題 **粗**\n\n## [連結](http://x.com)\n### `code` ###')
    expect(o.map((x) => [x.level, x.text])).toEqual([
      [1, '標題 粗'],
      [2, '連結'],
      [3, 'code']
    ])
  })

  it('略過 YAML front matter', () => {
    const o = parseOutline('---\ntitle: x\n# 不是標題\n---\n# 真標題')
    expect(o).toHaveLength(1)
    expect(o[0].text).toBe('真標題')
    expect(o[0].line).toBe(4)
  })

  it('略過圍欄程式碼塊內的 #', () => {
    const o = parseOutline('# A\n```sh\n# comment\n```\n~~~\n# 也是註解\n~~~\n## B')
    expect(o.map((x) => x.text)).toEqual(['A', 'B'])
  })

  it('不把沒有空格的 #tag 當標題', () => {
    expect(parseOutline('#tag\n# 好')).toHaveLength(1)
  })
})

describe('computeStats', () => {
  it('中文按字、英文按詞計', () => {
    expect(computeStats('你好世界 hello world').words).toBe(4 + 2)
  })
  it('空文件', () => {
    expect(computeStats('')).toEqual({ chars: 0, words: 0, minutes: 0 })
  })
  it('chars 不含空白', () => {
    expect(computeStats('a b\n c').chars).toBe(3)
  })
})

describe('fuzzyScore', () => {
  it('空查詢永遠匹配', () => expect(fuzzyScore('', 'abc')).toBeGreaterThan(0))
  it('連續子字串得分高於散落匹配', () => {
    expect(fuzzyScore('abc', 'xabcx')).toBeGreaterThan(fuzzyScore('abc', 'a-b-c'))
  })
  it('位置越前、文字越短得分越高', () => {
    expect(fuzzyScore('ab', 'ab')).toBeGreaterThan(fuzzyScore('ab', 'xxab'))
  })
  it('不匹配回傳 -1', () => expect(fuzzyScore('zz', 'abc')).toBe(-1))
})

describe('moveSection', () => {
  const md = '# A\na\n## A1\nx\n# B\nb\n# C\nc'

  it('sectionRange 含子標題', () => {
    expect(sectionRange(md, parseOutline(md), 0)).toEqual([0, 4])
    expect(sectionRange(md, parseOutline(md), 1)).toEqual([2, 4])
    expect(sectionRange(md, parseOutline(md), 3)).toEqual([6, 8])
  })

  it('把 A（含 A1）搬到 C 之前', () => {
    expect(moveSection(md, 0, 3)).toBe('# B\nb\n# A\na\n## A1\nx\n# C\nc')
  })

  it('把 C 搬到最前面', () => {
    expect(moveSection(md, 3, 0)).toBe('# C\nc\n# A\na\n## A1\nx\n# B\nb')
  })

  it('搬到文末，並與前一段保持空行', () => {
    expect(moveSection(md, 1, 4)).toBe('# A\na\n# B\nb\n# C\nc\n\n## A1\nx')
  })

  it('目標落在自己的範圍內回傳 null', () => {
    expect(moveSection(md, 0, 2)).toBeNull()
    expect(moveSection(md, 2, 2)).toBeNull()
  })

  it('索引越界回傳 null', () => {
    expect(moveSection(md, -1, 0)).toBeNull()
    expect(moveSection(md, 9, 0)).toBeNull()
    expect(moveSection(md, 0, 9)).toBeNull()
  })

  it('搬動後標題數量不變、內容行不遺失', () => {
    const r = moveSection(md, 0, 3)!
    expect(parseOutline(r)).toHaveLength(parseOutline(md).length)
    expect(r.split('\n').sort()).toEqual(md.split('\n').sort())
  })
})
