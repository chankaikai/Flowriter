import { beforeEach, describe, expect, it } from 'vitest'
import { getBookmark, saveCaret, setHint } from '@/lib/bookmarks'

beforeEach(() => localStorage.clear())

describe('冷啟動書籤', () => {
  it('記住落筆位置', () => {
    saveCaret('/a.md', 123)
    expect(getBookmark('/a.md')?.pos).toBe(123)
    expect(getBookmark('/none.md')).toBeNull()
  })
  it('更新位置不會丟掉接續提示', () => {
    setHint('/a.md', '補第三章數據')
    saveCaret('/a.md', 50)
    expect(getBookmark('/a.md')).toMatchObject({ pos: 50, hint: '補第三章數據' })
  })
  it('空白提示視為清除', () => {
    setHint('/a.md', 'x')
    setHint('/a.md', '   ')
    expect(getBookmark('/a.md')?.hint).toBeUndefined()
  })
  it('只保留最近 200 個檔案', () => {
    for (let i = 0; i < 230; i++) saveCaret(`/f${i}.md`, i + 2)
    const all = JSON.parse(localStorage.getItem('inkwell.bookmarks.v1')!)
    expect(Object.keys(all).length).toBeLessThanOrEqual(200)
  })
  it('儲存內容損壞時不拋錯', () => {
    localStorage.setItem('inkwell.bookmarks.v1', '[1,2')
    expect(getBookmark('/a.md')).toBeNull()
  })
})
