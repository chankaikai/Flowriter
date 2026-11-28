import { describe, it, expect } from 'vitest'
import { findLocalImages, replaceImageUrls, normalizeHost, parseHeaders, getByPath, pickUrl, isHttpUrl, DEFAULT_HOST } from '../../src/shared/imageHost'

describe('imageHost', () => {
  it('normalize falls back to local', () => {
    expect(normalizeHost(null)).toEqual(DEFAULT_HOST)
    expect(normalizeHost({ kind: 'x' }).kind).toBe('local')
    expect(normalizeHost({ kind: 'picgo', customField: '' }).customField).toBe('file')
  })
  it('parses headers and skips junk', () => {
    expect(parseHeaders('Authorization: Bearer abc\nbad line\nX-Id:  7 ')).toEqual({ Authorization: 'Bearer abc', 'X-Id': '7' })
  })
  it('getByPath walks arrays and objects', () => {
    expect(getByPath({ a: { b: [{ c: 'x' }] } }, 'a.b.0.c')).toBe('x')
    expect(getByPath({ a: 1 }, 'a.b')).toBeUndefined()
  })
  it('pickUrl uses path, plain text, or null', () => {
    expect(pickUrl('{"data":{"url":"https://i.example.com/a.png"}}', 'data.url')).toBe('https://i.example.com/a.png')
    expect(pickUrl('https://x.test/p.png\n', '')).toBe('https://x.test/p.png')
    expect(pickUrl('{"data":{"url":"javascript:alert(1)"}}', 'data.url')).toBeNull()
    expect(pickUrl('oops', 'data.url')).toBeNull()
  })
  it('isHttpUrl rejects other schemes', () => {
    expect(isHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isHttpUrl('http://127.0.0.1:36677/upload')).toBe(true)
  })
  it('finds local images only, skipping code fences and remote links', () => {
    const md = '![a](assets/a.png)\n![b](https://x/y.png)\n```\n![c](c.png)\n```\n![d](assets/a.png "t")\n![e](data:image/png;base64,AAA)\n![f](<my pic.png>)'
    expect(findLocalImages(md).map((i) => i.url)).toEqual(['assets/a.png', 'my pic.png'])
  })
  it('replaces matching urls and keeps titles', () => {
    const md = '![a](assets/a.png "t") text assets/a.png ![b](other.png)'
    expect(replaceImageUrls(md, new Map([['assets/a.png', 'https://h/1.png']]))).toBe('![a](https://h/1.png "t") text assets/a.png ![b](other.png)')
  })
})
