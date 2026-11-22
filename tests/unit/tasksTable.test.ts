import { describe, it, expect } from 'vitest'
import { collectTasks } from '@/lib/tasks'
import { sortOrder } from '@/lib/tableSort'
import { parseFrontMatter, toggleBool } from '@/lib/frontMatter'

describe('collectTasks', () => {
  it('finds tasks and skips code fences', () => {
    const t = collectTasks('- [ ] a\n- [x] b\n```\n- [ ] no\n```\n  1. [ ] c')
    expect(t.map((x) => [x.text, x.checked, x.line])).toEqual([['a', false, 0], ['b', true, 1], ['c', false, 5]])
  })
})
describe('sortOrder', () => {
  it('sorts numerically', () => { expect(sortOrder(['10', '9', '100'], 'asc')).toEqual([1, 0, 2]) })
  it('desc and stable', () => { expect(sortOrder(['1', '1', '2'], 'desc')).toEqual([2, 0, 1]) })
  it('sorts text', () => { expect(sortOrder(['b', 'a'], 'asc')).toEqual([1, 0]) })
  it('blanks go last numerically', () => { expect(sortOrder(['', '3', '1'], 'asc')).toEqual([2, 1, 0]) })
})
describe('frontMatter', () => {
  const fm = 'title: Hi\ndraft: true\ntags: [a, "b c"]\nlist:\n  - x\n  - y\n# c'
  it('parses fields', () => {
    const f = parseFrontMatter(fm)
    expect(f.map((x) => x.key)).toEqual(['title', 'draft', 'tags', 'list'])
    expect(f[1].value).toBe(true)
    expect(f[2].items).toEqual(['a', 'b c'])
    expect(f[3].items).toEqual(['x', 'y'])
  })
  it('toggles bool preserving the rest', () => {
    expect(toggleBool(fm, 'draft')).toBe(fm.replace('draft: true', 'draft: false'))
    expect(toggleBool(fm, 'title')).toBeNull()
  })
})
