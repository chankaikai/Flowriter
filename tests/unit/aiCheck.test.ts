import { describe, it, expect } from 'vitest'
import { buildCheckPrompt, parseCheckReply } from '@/lib/aiCheck'

describe('ai check', () => {
  it('parses issues, drops unknown blocks and empty fixes', () => {
    const raw = '```json\n{"issues":[{"block":2,"kind":"錯字","text":"帳號","fix":"應為「賬號」"},{"block":9,"kind":"語法","fix":"x"},{"block":2,"kind":"亂寫","text":"a","fix":"b"},{"block":2,"fix":""}]}\n```'
    const r = parseCheckReply(raw, new Set([1, 2]))!
    expect(r.length).toBe(2)
    expect(r[0]).toEqual({ block: 2, kind: '錯字', text: '帳號', fix: '應為「賬號」' })
    expect(r[1].kind).toBe('其他')
  })
  it('rejects non-json and wrong shapes; empty list is valid', () => {
    expect(parseCheckReply('沒有問題', new Set([1]))).toBeNull()
    expect(parseCheckReply('{"x":1}', new Set([1]))).toBeNull()
    expect(parseCheckReply('{"issues":[]}', new Set([1]))).toEqual([])
  })
  it('labels paragraphs by id', () => {
    expect(buildCheckPrompt({ items: [{ id: 3, text: 'abc' }], dropped: 0, truncated: 0 }).text).toBe('【3】abc')
  })
})
