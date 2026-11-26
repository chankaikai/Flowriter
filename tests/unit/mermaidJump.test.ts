import { describe, it, expect } from 'vitest'
import { findLineForLabel } from '@/lib/mermaidJump'
import { padRect } from '@/lib/regionRect'

const CODE = 'graph TD\n  A[Start] --> B{Is it ok?}\n  B -->|Yes| C[Alpha]\n  B -->|No| D[開始]'

describe('mermaid click to code line', () => {
  it('finds the line and its offset', () => {
    const h = findLineForLabel(CODE, 'Start')!
    expect(h.line).toBe(1)
    expect(CODE.slice(h.offset, h.offset + 4)).toBe('  A[')
  })
  it('prefers whole words and is case/space-insensitive', () => {
    expect(findLineForLabel(CODE, 'a')?.line).toBe(1) // 不會先命中 Alpha / graph 裡的 a
    expect(findLineForLabel(CODE, '  is   IT ok? ')?.line).toBe(1)
    expect(findLineForLabel(CODE, 'alpha')?.line).toBe(2)
  })
  it('handles Chinese, misses and empty', () => {
    expect(findLineForLabel(CODE, '開始')?.line).toBe(3)
    expect(findLineForLabel(CODE, 'nope')).toBeNull()
    expect(findLineForLabel(CODE, '   ')).toBeNull()
  })
})

describe('padRect', () => {
  it('pads and clamps to the viewport with integers', () => {
    expect(padRect({ left: 10.4, top: 3, width: 100.2, height: 20 }, 8, 800, 600)).toEqual({ x: 2, y: 0, width: 117, height: 31 })
    expect(padRect({ left: 790, top: 590, width: 50, height: 50 }, 8, 800, 600)).toEqual({ x: 782, y: 582, width: 18, height: 18 })
  })
})
