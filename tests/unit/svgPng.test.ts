import { describe, it, expect } from 'vitest'
import { opaqueBounds, svgSize } from '@/lib/svgPng'

describe('svg → png helpers', () => {
  it('finds the outermost opaque pixels', () => {
    const w = 6, h = 4
    const px = new Uint8Array(w * h * 4)
    const set = (x: number, y: number) => (px[(y * w + x) * 4 + 3] = 255)
    set(1, 1); set(4, 2)
    expect(opaqueBounds(px, w, h)).toEqual({ x: 1, y: 1, w: 4, h: 2 })
    expect(opaqueBounds(new Uint8Array(w * h * 4), w, h)).toBeNull()
  })
  it('reads size from attributes or viewBox', () => {
    expect(svgSize('<svg width="120" height="40"></svg>')).toEqual({ w: 120, h: 40 })
    expect(svgSize('<svg viewBox="0 0 300 90" width="100%"></svg>')).toEqual({ w: 300, h: 90 })
    expect(svgSize('<svg></svg>')).toEqual({ w: 300, h: 150 })
  })
})
