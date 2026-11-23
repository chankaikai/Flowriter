import { describe, it, expect } from 'vitest'
import { extractLinks, sharedTargets, twoHopOut } from '@/lib/graph'

describe('graph', () => {
  it('extracts wikilinks, aliases and anchors', () => {
    expect(extractLinks('a [[X]] b [[Y|alias]] [[Z#sec]] [[X]]')).toEqual(['X', 'Y', 'Z'])
  })
  it('ranks notes sharing targets, excluding self', () => {
    const r = sharedTargets('me', { A: ['me', 'p', 'q'], B: ['p'] })
    expect(r[0]).toEqual({ stem: 'p', via: ['A', 'B'] })
    expect(r.map((x) => x.stem)).toEqual(['p', 'q'])
  })
  it('finds two-hop outgoing through backlinks', () => {
    const r = twoHopOut('me', ['A'], { p: ['me', 'A', 'Y', 'p'], q: ['Y', 'Z'] })
    expect(r).toEqual([{ stem: 'Y', via: ['p', 'q'] }, { stem: 'Z', via: ['q'] }])
  })
})
