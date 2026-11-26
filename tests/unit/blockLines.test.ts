import { describe, it, expect } from 'vitest'
import { blockStartLines, type LNode } from '@/lib/blockLines'

const N = (name: string, kids: LNode[] = [], text = '', tb = false): LNode => ({ type: { name }, childCount: kids.length, child: (i) => kids[i], textContent: text, isTextblock: tb })
const P = (t = 'x') => N('paragraph', [], t, true)

describe('block start lines', () => {
  it('numbers paragraphs separated by blank lines', () => {
    expect(blockStartLines(N('doc', [P(), P(), P()]))).toEqual([1, 3, 5])
  })
  it('counts heading, code fence, list and table spans', () => {
    const doc = N('doc', [
      N('heading', [], 'h', true),
      N('code_block', [], 'a\nb\nc', true),
      N('bullet_list', [N('list_item', [P()]), N('list_item', [P()])]),
      N('table', [N('r'), N('r'), N('r')]),
      P()
    ])
    expect(blockStartLines(doc)).toEqual([1, 3, 9, 12, 17])
  })
  it('counts hard breaks and blockquote separators', () => {
    const br = { ...N('hardbreak'), childCount: 0 }
    const para = { ...N('paragraph', [P('a'), br, P('b')], 'ab', true) }
    expect(blockStartLines(N('doc', [para, N('blockquote', [P(), P()]), P()]))).toEqual([1, 4, 8])
  })
  it('empty doc', () => {
    expect(blockStartLines(N('doc'))).toEqual([])
  })
})
