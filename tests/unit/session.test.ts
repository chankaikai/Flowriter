import { beforeEach, describe, expect, it } from 'vitest'
import { loadRecent, loadSession, pushRecent, saveSession } from '@/lib/session'

beforeEach(() => localStorage.clear())

describe('session', () => {
  it('存取往返', () => {
    saveSession({ tabs: [{ path: '/a.md', name: 'a', scroll: 10, dirtyMd: 'x', base: 5 }], active: 0 })
    const s = loadSession()!
    expect(s.tabs[0]).toMatchObject({ path: '/a.md', dirtyMd: 'x', base: 5 })
  })
  it('損壞或格式不對時回傳 null', () => {
    localStorage.setItem('inkwell.session.v1', 'not json')
    expect(loadSession()).toBeNull()
    localStorage.setItem('inkwell.session.v1', '{"tabs":1}')
    expect(loadSession()).toBeNull()
  })
})

describe('recent files', () => {
  it('最新的在最前，重複的移到最前', () => {
    pushRecent('/a')
    pushRecent('/b')
    expect(pushRecent('/a')).toEqual(['/a', '/b'])
  })
  it('最多 15 筆', () => {
    for (let i = 0; i < 30; i++) pushRecent(`/f${i}`)
    const r = loadRecent()
    expect(r).toHaveLength(15)
    expect(r[0]).toBe('/f29')
  })
  it('過濾掉非字串', () => {
    localStorage.setItem('inkwell.recent.v1', '["/a",1,null]')
    expect(loadRecent()).toEqual(['/a'])
  })
})
