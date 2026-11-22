import { beforeEach, describe, expect, it } from 'vitest'
import { addWords, dayKey, lastDays, loadWriting, streak } from '@/lib/writing'

beforeEach(() => localStorage.clear())

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return dayKey(d)
}

describe('writing stats', () => {
  it('同一天累加', () => {
    addWords(10)
    addWords(5)
    expect(loadWriting().days[dayKey()]).toBe(15)
  })

  it('損壞的儲存內容不會拋錯', () => {
    localStorage.setItem('inkwell.writing.v1', '{oops')
    expect(loadWriting()).toEqual({ days: {} })
  })

  it('連續天數：今天還沒寫不中斷', () => {
    const d = { days: { [daysAgo(1)]: 3, [daysAgo(2)]: 3, [daysAgo(3)]: 3 } }
    expect(streak(d)).toBe(3)
  })

  it('連續天數：今天寫了算一天，缺一天就斷', () => {
    const d = { days: { [daysAgo(0)]: 1, [daysAgo(1)]: 1, [daysAgo(3)]: 1 } }
    expect(streak(d)).toBe(2)
  })

  it('沒寫過是 0', () => expect(streak({ days: {} })).toBe(0))

  it('lastDays 由舊到新、長度正確、最後一天是今天', () => {
    const r = lastDays({ days: { [dayKey()]: 7 } }, 14)
    expect(r).toHaveLength(14)
    expect(r[13]).toEqual({ key: dayKey(), words: 7 })
    expect(r[0].words).toBe(0)
  })

  it('只保留最近 400 天', () => {
    const days: Record<string, number> = {}
    for (let i = 0; i < 450; i++) days[daysAgo(i + 1)] = 1
    localStorage.setItem('inkwell.writing.v1', JSON.stringify({ days }))
    addWords(1)
    expect(Object.keys(loadWriting().days).length).toBeLessThanOrEqual(400)
  })
})
