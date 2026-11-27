import { describe, it, expect } from 'vitest'
import { nextIndex } from '@/lib/musicPlayer'

describe('nextIndex', () => {
  it('order stops after the last track', () => {
    expect(nextIndex(3, 0, 'order')).toBe(1)
    expect(nextIndex(3, 2, 'order')).toBeNull()
    expect(nextIndex(3, 0, 'order', -1)).toBeNull()
  })
  it('loop wraps both directions', () => {
    expect(nextIndex(3, 2, 'loop')).toBe(0)
    expect(nextIndex(3, 0, 'loop', -1)).toBe(2)
  })
  it('one repeats the same track', () => {
    expect(nextIndex(3, 1, 'one')).toBe(1)
  })
  it('shuffle never repeats the current track', () => {
    for (const r of [0, 0.3, 0.5, 0.99]) expect(nextIndex(4, 2, 'shuffle', 1, () => r) === 2).toBe(false)
    expect(nextIndex(1, 0, 'shuffle')).toBe(0)
  })
  it('empty queue', () => {
    expect(nextIndex(0, 0, 'loop')).toBeNull()
  })
})
