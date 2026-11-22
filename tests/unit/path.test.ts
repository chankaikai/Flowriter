import { describe, expect, it } from 'vitest'
import { basename, dirname, joinPath, stripExt, toAbsolutePath, toDisplayUrl } from '@/lib/path'

describe('path', () => {
  it('basename / dirname 同時支援 / 與 \\', () => {
    expect(basename('/a/b/c.md')).toBe('c.md')
    expect(basename('C:\\x\\y.md')).toBe('y.md')
    expect(dirname('/a/b/c.md')).toBe('/a/b')
    expect(dirname('C:\\x\\y.md')).toBe('C:\\x')
    expect(dirname('/c.md')).toBe('/')
  })

  it('stripExt 只去掉常見的文字副檔名', () => {
    expect(stripExt('note.md')).toBe('note')
    expect(stripExt('note.MARKDOWN')).toBe('note')
    expect(stripExt('a.b.txt')).toBe('a.b')
    expect(stripExt('pic.png')).toBe('pic.png')
  })

  it('joinPath 正規化 . 與 ..', () => {
    expect(joinPath('/a/b', './img/x.png')).toBe('/a/b/img/x.png')
    expect(joinPath('/a/b', '../x.png')).toBe('/a/x.png')
    expect(joinPath('/a/b', '/abs/x.png')).toBe('/abs/x.png')
  })

  it('toDisplayUrl：遠端位址不動，本機路徑走 inkwell 協定', () => {
    expect(toDisplayUrl('/a', 'https://x.com/a.png')).toBe('https://x.com/a.png')
    expect(toDisplayUrl('/a', 'data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA')
    expect(toDisplayUrl('/a', 'img/x.png')).toBe('inkwell://local/' + encodeURIComponent('/a/img/x.png'))
  })

  it('沒有文件目錄時，相對路徑原樣保留', () => {
    expect(toDisplayUrl(null, 'img/x.png')).toBe('img/x.png')
    expect(toAbsolutePath(null, 'img/x.png')).toBeNull()
  })
})
