import { describe, expect, it } from 'vitest'
import { locate, ordinalOf, snippetOf, stripMd } from '../../src/renderer/src/lib/caretMap'

describe('caretMap', () => {
  it('stripMd 去掉標題／清單／引用符號', () => {
    expect(stripMd('## 第二章 概述')).toBe('第二章 概述')
    expect(stripMd('  - [x] 完成事項')).toBe('完成事項')
    expect(stripMd('> > 引用內容')).toBe('引用內容')
    expect(stripMd('12. 項目')).toBe('項目')
  })
  it('snippetOf 遇到 Markdown 符號截斷，太短不當錨點', () => {
    expect(snippetOf('你好世界 **粗體**')).toBe('你好世界')
    expect(snippetOf('a**b**')).toBe('')
    expect(snippetOf('x'.repeat(40))).toHaveLength(24)
  })
  it('重複文字用 ordinal 區分', () => {
    const lines = ['重複的一行', '別的', '重複的一行', '重複的一行']
    expect(ordinalOf(lines, 3, '重複的一行')).toBe(2)
    expect(locate(lines, '重複的一行', 2)).toEqual({ item: 3, at: 0 })
    expect(locate(lines, '不存在', 0)).toBeNull()
  })
})
