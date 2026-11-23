import { describe, it, expect } from 'vitest'
import { addRef, emptyRefs, formatRefQuote, isUrl, parseRefs, removeRef, serializeRefs } from '@/lib/refs'

describe('refs', () => {
  it('adds, serializes and removes', () => {
    let f = addRef(emptyRefs(), 'a.md', { title: ' T ', source: 'https://x.com/p', body: ' body ' }, 1)
    expect(f.files['a.md'][0].title).toBe('T')
    expect(parseRefs(serializeRefs(f)).files['a.md'][0].body).toBe('body')
    f = removeRef(f, 'a.md', f.files['a.md'][0].id)
    expect(f.files['a.md']).toBe(undefined)
    expect(parseRefs('oops').files).toEqual({})
  })
  it('detects urls', () => {
    expect(isUrl('https://a.b/c')).toBe(true)
    expect(isUrl('p.12 of book')).toBe(false)
  })
  it('formats quotes with a linked citation', () => {
    expect(formatRefQuote({ title: 'Doc', source: 'https://a.b', body: 'l1\nl2' })).toBe('> l1\n> l2\n>\n> — [Doc](https://a.b)\n')
  })
  it('formats quotes with a plain-text source and without source', () => {
    expect(formatRefQuote({ title: '書', source: 'p.12', body: 'x' })).toBe('> x\n>\n> — 書，p.12\n')
    expect(formatRefQuote({ title: '', source: '', body: 'x' })).toBe('> x\n')
  })
})
