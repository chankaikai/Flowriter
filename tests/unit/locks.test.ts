import { describe, it, expect } from 'vitest'
import { emptyLocks, normLock, parseLocks, serializeLocks, setLocked, touchesLocked } from '@/lib/locks'

describe('locks', () => {
  it('normalizes whitespace', () => {
    expect(normLock('  a \n  b ')).toBe('a b')
  })
  it('locks and unlocks per file and round-trips', () => {
    let f = setLocked(emptyLocks(), 'a.md', '  hello   world ', true)
    expect(f.files['a.md']).toEqual(['hello world'])
    f = setLocked(f, 'a.md', 'hello world', true)
    expect(f.files['a.md'].length).toBe(1)
    expect(parseLocks(serializeLocks(f)).files['a.md']).toEqual(['hello world'])
    f = setLocked(f, 'a.md', 'hello world', false)
    expect(f.files['a.md']).toBe(undefined)
    expect(parseLocks('bad').files).toEqual({})
  })
  it('ignores empty text', () => {
    expect(setLocked(emptyLocks(), 'a.md', '   ', true).files).toEqual({})
  })
  it('blocks edits inside a locked range but allows the borders', () => {
    const r = [{ from: 10, to: 20 }]
    expect(touchesLocked(12, 14, r)).toBe(true) // 改字
    expect(touchesLocked(15, 15, r)).toBe(true) // 內部插入／Enter
    expect(touchesLocked(5, 12, r)).toBe(true) // 跨進鎖定範圍
    expect(touchesLocked(8, 25, r)).toBe(true) // 整段刪除
    expect(touchesLocked(10, 10, r)).toBe(false) // 前緣插入
    expect(touchesLocked(20, 20, r)).toBe(false) // 後緣插入
    expect(touchesLocked(0, 10, r)).toBe(false)
    expect(touchesLocked(20, 30, r)).toBe(false)
  })
})
