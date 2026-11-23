import { describe, it, expect } from 'vitest'
import { addUsage, readUsage, fmtTokens } from '@/lib/aiUsage'
import { balanceKind, isLocalUrl } from '../../src/shared/aiHosts'

describe('aiUsage', () => {
  it('accumulates and resets today on a new day', () => {
    let s = addUsage({}, 'x', { in: 10, out: 5 }, '2026-01-01')
    s = addUsage(s, 'x', { in: 1, out: 2 }, '2026-01-01')
    expect(readUsage(s, 'x', '2026-01-01')).toMatchObject({ todayIn: 11, todayOut: 7, totalIn: 11, calls: 2 })
    s = addUsage(s, 'x', { in: 3, out: 3 }, '2026-01-02')
    expect(readUsage(s, 'x', '2026-01-02')).toMatchObject({ todayIn: 3, totalIn: 14, calls: 3 })
    expect(readUsage(s, 'x', '2026-01-03').todayIn).toBe(0)
  })
  it('formats tokens', () => {
    expect(fmtTokens(999)).toBe('999')
    expect(fmtTokens(12345)).toBe('12.3k')
  })
})
describe('aiHosts', () => {
  it('detects balance-capable hosts', () => {
    expect(balanceKind('https://api.deepseek.com/v1')).toBe('deepseek')
    expect(balanceKind('https://api.moonshot.cn/v1')).toBe('moonshot')
    expect(balanceKind('https://openrouter.ai/api/v1')).toBe('openrouter')
    expect(balanceKind('https://api.openai.com/v1')).toBeNull()
  })
  it('detects local urls', () => {
    expect(isLocalUrl('http://localhost:11434/v1')).toBe(true)
    expect(isLocalUrl('http://192.168.1.5:8000/v1')).toBe(true)
    expect(isLocalUrl('http://172.20.0.2/v1')).toBe(true)
    expect(isLocalUrl('http://172.32.0.2/v1')).toBe(false)
    expect(isLocalUrl('https://api.deepseek.com')).toBe(false)
  })
})
