import { describe, it, expect } from 'vitest'
import { splitBlocks, diffBlocks, mergeHunks, findDeleted, joinBlocks } from '@/lib/diff'
import { pickMemories } from '@/lib/memories'

describe('splitBlocks', () => {
  it('keeps code fences whole', () => {
    expect(splitBlocks('a\n\n```\nx\n\ny\n```\n\nb')).toEqual(['a', '```\nx\n\ny\n```', 'b'])
  })
})
describe('diffBlocks / mergeHunks', () => {
  const cur = ['A', 'B2', 'C', 'D']
  const old = ['A', 'B', 'C', 'X', 'D']
  const h = diffBlocks(cur, old)
  it('finds change hunks', () => {
    expect(h.filter((x) => x.kind === 'change').length).toBe(2)
  })
  it('accepting nothing keeps current', () => {
    expect(mergeHunks(h, new Set())).toBe(joinBlocks(cur))
  })
  it('accepting all gives old', () => {
    const all = new Set(h.map((_, i) => i))
    expect(mergeHunks(h, all)).toBe(joinBlocks(old))
  })
  it('accepting one hunk only reverts that paragraph', () => {
    const idx = h.findIndex((x) => x.kind === 'change' && x.old[0] === 'B')
    expect(mergeHunks(h, new Set([idx]))).toBe(joinBlocks(['A', 'B', 'C', 'D']))
  })
})
describe('findDeleted', () => {
  it('lists paragraphs that existed before but are gone, newest snapshot first', () => {
    const r = findDeleted('keep this paragraph here', [
      { ts: 2, md: 'keep this paragraph here\n\nremoved long paragraph two' },
      { ts: 1, md: 'removed long paragraph two\n\nremoved long paragraph one' }
    ])
    expect(r.map((x) => [x.text, x.ts])).toEqual([['removed long paragraph two', 2], ['removed long paragraph one', 1]])
  })
})
describe('pickMemories', () => {
  it('picks a snapshot about one month ago', () => {
    const now = Date.UTC(2026, 10, 23, 12)
    const m = pickMemories([{ key: 'k', name: 'a.md', ts: now - 30 * 86_400_000 + 3600_000, size: 1 }, { key: 'k', name: 'a.md', ts: now - 5 * 86_400_000, size: 1 }], now)
    expect(m.map((x) => x.label)).toEqual(['一個月前'])
  })
})
