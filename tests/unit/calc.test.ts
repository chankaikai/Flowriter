import { describe, it, expect } from 'vitest'
import { evaluate, collectVars, applyInlineCalcs, formatNumber } from '@/lib/calc'

describe('calc', () => {
  it('evaluates arithmetic with precedence', () => {
    expect(evaluate('1 + 2 * 3', {})).toBe(7)
    expect(evaluate('(1 + 2) * 3', {})).toBe(9)
    expect(evaluate('2 \\* 4', {})).toBe(8)
  })
  it('supports variables and functions', () => {
    expect(evaluate('price * 2', { price: 5 })).toBe(10)
    expect(evaluate('round(2.6) + max(1, 3)', {})).toBe(6)
  })
  it('returns null for invalid or unsafe input', () => {
    expect(evaluate('foo + 1', {})).toBeNull()
    expect(evaluate('process.exit()', {})).toBeNull()
    expect(evaluate('1 +', {})).toBeNull()
  })
  it('collects @vars', () => {
    expect(collectVars(['@price = 10', 'x', '@n=2'])).toEqual({ price: 10, n: 2 })
  })
  it('formats numbers', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
  })
  it('expands inline calcs but not in code fences', () => {
    const md = '@a = 3\n\n{{a * 2}}\n\n```\n{{a * 2}}\n```\n\n{{bad}}'
    const out = applyInlineCalcs(md)
    expect(out).toContain('6')
    expect(out).toContain('{{bad}}')
    expect(out.match(/\{\{a \* 2\}\}/g)?.length).toBe(1)
  })
})
