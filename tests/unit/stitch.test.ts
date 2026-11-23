import { describe, it, expect } from 'vitest'
import { buildStitch } from '@/lib/stitch'

describe('stitch', () => {
  it('numbers snippets and drops empties', () => {
    const r = buildStitch(['  a ', '', 'b'], 'plain')
    expect(r.text).toBe('【片段 1】\na\n\n【片段 2】\nb')
    expect(r.truncated).toBe(0)
  })
  it('instruction forbids inventing facts', () => {
    expect(buildStitch(['x'], 'bullets').instruction).toContain('不要新增事實')
  })
  it('caps each snippet and the total, reporting truncation', () => {
    const big = 'x'.repeat(5000)
    const r = buildStitch([big, big, big, big, big], 'outline')
    expect(r.truncated >= 1).toBe(true)
    expect(r.text.length <= 12_000 + 200).toBe(true)
  })
})
