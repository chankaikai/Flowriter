import { describe, it, expect } from 'vitest'
import { typographyIssues, applyFixes, styleIssues } from '@/lib/lint'

const rules = (md: string) => typographyIssues(md).map((i) => i.rule)

describe('typographyIssues', () => {
  it('flags missing spaces between CJK and Latin, with a fix', () => {
    const r = applyFixes('使用Markdown寫作', typographyIssues('使用Markdown寫作'))
    expect(r.md).toBe('使用 Markdown 寫作')
    expect(r.count).toBe(2)
  })
  it('does not flag 2025年 or 第3章', () => {
    expect(rules('2025年發布，第3章')).toEqual([])
  })
  it('converts half-width punctuation after CJK', () => {
    expect(applyFixes('你好,世界.', typographyIssues('你好,世界.')).md).toBe('你好，世界。')
  })
  it('collapses duplicate punctuation', () => {
    expect(applyFixes('真的嗎？？', typographyIssues('真的嗎？？')).md).toBe('真的嗎？')
  })
  it('ignores code, urls, front matter and fences', () => {
    const md = '---\ntitle: 中文abc\n---\n\n`中文abc` 與 https://x.com/中文abc\n\n```\n中文abc\n```\n'
    expect(typographyIssues(md)).toEqual([])
  })
  it('reports unbalanced quotes without a fix', () => {
    const i = typographyIssues('他說「你好')
    expect(i.some((x) => x.rule === 'pair' && x.fix === undefined)).toBe(true)
  })
})
describe('styleIssues', () => {
  it('flags very long Chinese sentences', () => {
    const s = '這是' + '很長的內容'.repeat(20) + '。'
    expect(styleIssues(s).some((i) => i.rule === 'long-sentence')).toBe(true)
  })
  it('flags three sentences with the same opening', () => {
    expect(styleIssues('我們發現了問題。我們提出了方案。我們完成了驗證。').some((i) => i.rule === 'same-start')).toBe(true)
  })
  it('skips headings and lists', () => {
    expect(styleIssues('# 標題標題標題\n\n- 項目項目項目')).toEqual([])
  })
})
