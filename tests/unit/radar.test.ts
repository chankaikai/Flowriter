import { describe, it, expect } from 'vitest'
import { buildIndex, queryIndex, tokenize } from '@/lib/radar'

const d = (name: string, content: string) => ({ path: `/n/${name}.md`, name: `${name}.md`, rel: `${name}.md`, content })

describe('radar', () => {
  it('tokenizes english words and chinese bigrams', () => {
    expect(tokenize('Hello the World 你好世界')).toEqual(['hello', 'world', '你好', '好世', '世界'])
    expect(tokenize('a 我')).toEqual([])
  })
  const idx = buildIndex([
    d('coffee', '手沖咖啡的水溫與研磨度。\n\n器具：濾杯與磨豆機。'),
    d('travel', '東京旅行計畫：新幹線與住宿。'),
    d('code', 'React hooks and state management notes.')
  ])
  it('finds the related note and ignores unrelated ones', () => {
    const r = queryIndex(idx, '咖啡研磨')
    expect(r[0].name).toBe('coffee.md')
    expect(r.every((h) => h.name !== 'travel.md')).toBe(true)
    expect(r[0].snippet).toContain('咖啡')
  })
  it('excludes the current document and handles english', () => {
    expect(queryIndex(idx, 'react state', { exclude: '/n/code.md' })).toEqual([])
    expect(queryIndex(idx, 'react state')[0].name).toBe('code.md')
  })
  it('returns nothing for empty queries', () => {
    expect(queryIndex(idx, '  ')).toEqual([])
  })
})
