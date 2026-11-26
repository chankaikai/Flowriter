import { describe, it, expect } from 'vitest'
import { MAX_PARAS, buildPrompt, outlineToMarkdown, parseReply, prepare, signature, type BlockText } from '@/lib/reverseOutline'

const B = (index: number, text: string, skip = false): BlockText => ({ index, text, skip })

describe('reverse outline', () => {
  it('prepare skips code/short blocks, keeps original indexes, truncates long ones', () => {
    const p = prepare([B(0, '標題標題標題標題'), B(1, 'x = 1', true), B(2, '短'), B(3, '很長'.repeat(300)), B(4, '第二段正文內容在這裡')])
    expect(p.items.map((i) => i.id)).toEqual([0, 3, 4])
    expect(p.truncated).toBe(1)
    expect(p.items[1].text.endsWith('…')).toBe(true)
  })
  it('prepare enforces paragraph cap and reports dropped', () => {
    const many = Array.from({ length: MAX_PARAS + 5 }, (_, i) => B(i, '這是第幾段的內容文字' + i))
    const p = prepare(many)
    expect(p.items.length).toBe(MAX_PARAS)
    expect(p.dropped).toBe(5)
  })
  it('prompt labels paragraphs by id', () => {
    const t = buildPrompt({ items: [{ id: 7, text: 'abc' }], dropped: 0, truncated: 0 }).text
    expect(t).toBe('【7】abc')
  })
  it('parses fenced / chatty JSON and drops invalid ids', () => {
    const raw = '好的：\n```json\n{"thesis":"核心","outline":[{"point":"A","blocks":[1,2,99],"children":[{"point":"A1","blocks":[2]}]},{"point":""}],"redundant":[{"block":2,"of":1,"reason":"重複"},{"block":2},{"block":50},{"block":1,"of":1}],"offtopic":[{"block":1,"reason":"離題"}]}\n```'
    const r = parseReply(raw, new Set([1, 2, 3]))!
    expect(r.thesis).toBe('核心')
    expect(r.outline.length).toBe(1)
    expect(r.outline[0].blocks).toEqual([1, 2])
    expect(r.outline[0].children[0].point).toBe('A1')
    expect(r.redundant).toEqual([{ block: 2, reason: '重複', of: 1 }, { block: 1, reason: '' }])
    expect(r.offtopic).toEqual([{ block: 1, reason: '離題' }])
  })
  it('rejects garbage and empty results', () => {
    expect(parseReply('抱歉我不能', new Set([1]))).toBeNull()
    expect(parseReply('{bad json}', new Set([1]))).toBeNull()
    expect(parseReply('{"outline":[]}', new Set([1]))).toBeNull()
    expect(parseReply('[1,2]', new Set([1]))).toBeNull()
  })
  it('limits depth', () => {
    const deep = '{"thesis":"t","outline":[{"point":"1","children":[{"point":"2","children":[{"point":"3","children":[{"point":"4"}]}]}]}]}'
    const r = parseReply(deep, new Set())!
    expect(r.outline[0].children[0].children[0].children).toEqual([])
  })
  it('signature changes with content; markdown export indents', () => {
    expect(signature([B(0, 'a')])).not.toBe(signature([B(0, 'b')]))
    const md = outlineToMarkdown({ thesis: 'T', outline: [{ point: 'A', blocks: [], children: [{ point: 'B', blocks: [], children: [] }] }], redundant: [], offtopic: [] })
    expect(md).toBe('**核心觀點**：T\n\n- A\n  - B\n')
  })
})
