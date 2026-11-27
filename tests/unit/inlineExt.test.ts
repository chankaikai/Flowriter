import { describe, it, expect } from 'vitest'
import { inlineExtTransform, extKind } from '@/lib/inlineExt'

const para = (value: string) => ({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', value }] }] })
const kinds = (value: string) => {
  const t: any = para(value)
  inlineExtTransform(t)
  return t.children[0].children.map((c: any) => (c.type === 'html' ? extKind(c.value) : 'text'))
}

describe('inlineExt', () => {
  it('splits highlight, sup, sub and known emoji', () => {
    expect(kinds('a ==hi== b')).toEqual(['text', 'mark', 'text'])
    expect(kinds('x^2^ y')).toEqual(['text', 'sup', 'text'])
    expect(kinds('H~2~O')).toEqual(['text', 'sub', 'text'])
    expect(kinds('好 :smile: 的')).toEqual(['text', 'emoji', 'text'])
  })
  it('leaves unknown emoji, footnote-like and strike text alone', () => {
    expect(kinds('時間 12:30:45 到')).toEqual(['text'])
    expect(kinds('見 [^1] 與 [^2]')).toEqual(['text'])
    expect(kinds('a ~~b~~ c')).toEqual(['text'])
    expect(kinds(':notanemoji:')).toEqual(['text'])
  })
  it('keeps the source text verbatim in html nodes', () => {
    const t: any = para('==x==')
    inlineExtTransform(t)
    expect(t.children[0].children[0].value).toBe('==x==')
  })
})
