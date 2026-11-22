import { describe, expect, it } from 'vitest'
import { fmtClock, PRESETS } from '@/lib/pomodoro'

describe('fmtClock', () => {
  it('分:秒，向上取整', () => {
    expect(fmtClock(25 * 60_000)).toBe('25:00')
    expect(fmtClock(59_001)).toBe('01:00')
    expect(fmtClock(1)).toBe('00:01')
  })
  it('超過一小時顯示小時', () => expect(fmtClock(90 * 60_000)).toBe('1:30:00'))
  it('負數當作 0', () => expect(fmtClock(-500)).toBe('00:00'))
})

describe('預設組合', () => {
  it('休息比專注短，且標籤與數值一致', () => {
    for (const p of PRESETS) {
      expect(p.rest).toBeLessThan(p.work)
      expect(p.label).toBe(`${p.work} / ${p.rest}`)
    }
  })
})
