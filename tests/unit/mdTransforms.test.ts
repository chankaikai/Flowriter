import { describe, it, expect } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import { calloutTransform, calcTransform, bilingualTransform } from '@/lib/mdTransforms'

const roundTrip = (md: string, ...fns: Array<(t: unknown) => number>) => {
  const p = unified().use(remarkParse).use(remarkStringify)
  const tree = p.parse(md)
  fns.forEach((f) => f(tree))
  return p.stringify(tree)
}

describe('mdTransforms', () => {
  it('callout survives round trip unescaped', () => {
    expect(roundTrip('> [!NOTE]\n> hello *world*\n', calloutTransform).trim()).toBe('> [!NOTE]\n>\n> hello *world*')
  })
  it('callout label is its own paragraph (no <br />)', () => {
    const out = roundTrip('> [!NOTE]\n> hello\n', calloutTransform)
    expect(out.includes('<br')).toBe(false)
    expect(out.startsWith('> [!NOTE]')).toBe(true)
  })
  it('callout output is stable on second pass', () => {
    const once = roundTrip('> [!WARNING]\n> a\n> b\n', calloutTransform)
    expect(roundTrip(once, calloutTransform)).toBe(once)
  })
  it('summary callout is recognised', () => {
    const tree = unified().use(remarkParse).parse('> [!SUMMARY]\n> x\n') as any
    expect(calloutTransform(tree)).toBe(1)
  })
  it('calc expression survives round trip unescaped', () => {
    expect(roundTrip('{{price * 1.5}}\n', calcTransform).trim()).toBe('{{price * 1.5}}')
  })
  it('bilingual block is detected', () => {
    const tree = unified().use(remarkParse).parse(':::bilingual\n\nA\n\n---\n\nB\n\n:::\n') as any
    expect(bilingualTransform(tree)).toBe(1)
    expect(tree.children[0].type).toBe('bilingualBlock')
    expect(tree.children[0].children).toHaveLength(2)
  })
  it('unterminated bilingual is left as text', () => {
    const tree = unified().use(remarkParse).parse(':::bilingual\n\nA\n') as any
    expect(bilingualTransform(tree)).toBe(0)
  })
})
