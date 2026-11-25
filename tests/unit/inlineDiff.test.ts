import { describe, it, expect } from 'vitest'
import { diffInline } from '@/lib/inlineDiff'

const join = (s: { t: string; k: string }[], k: string) => s.filter((x) => x.k === k).map((x) => x.t).join('')

describe('inlineDiff', () => {
  it('identical text is one same segment', () => {
    expect(diffInline('abc 你好', 'abc 你好')).toEqual([{ t: 'abc 你好', k: 'same' }])
  })
  it('CJK char-level change', () => {
    const d = diffInline('今天天氣很好', '今天天氣不錯')
    expect(join(d, 'del')).toBe('很好')
    expect(join(d, 'add')).toBe('不錯')
    expect(join(d, 'same')).toBe('今天天氣')
  })
  it('latin word-level change', () => {
    const d = diffInline('the quick fox', 'the slow fox')
    expect(join(d, 'del')).toBe('quick')
    expect(join(d, 'add')).toBe('slow')
  })
  it('reconstructs both sides', () => {
    const a = '第一段 hello world 結尾'
    const b = '第一段 hello brave new world 結束'
    const d = diffInline(a, b)
    expect(d.filter((x) => x.k !== 'add').map((x) => x.t).join('')).toBe(a)
    expect(d.filter((x) => x.k !== 'del').map((x) => x.t).join('')).toBe(b)
  })
  it('empty sides', () => {
    expect(diffInline('', 'x')).toEqual([{ t: 'x', k: 'add' }])
    expect(diffInline('x', '')).toEqual([{ t: 'x', k: 'del' }])
  })
})
