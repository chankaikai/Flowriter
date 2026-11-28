import { describe, it, expect } from 'vitest'
import { extractWikiLinks, extractMdLinks, resolveRel, buildGraph, localSubgraph } from '../../src/shared/linkGraph'
import { forceLayout } from '@/lib/forceLayout'

describe('linkGraph', () => {
  it('extracts wikilinks ignoring code and aliases', () => {
    const md = 'a [[B|alias]] [[C#h]] `[[no]]`\n```\n[[also no]]\n```\n[[B]]'
    expect(extractWikiLinks(md)).toEqual(['B', 'C'])
  })
  it('extracts relative md links only', () => {
    const md = '[x](a/b.md#s) [y](https://x.com/z.md) ![i](p.md) [z](../up.markdown) [w](doc.txt)'
    expect(extractMdLinks(md)).toEqual(['a/b.md', '../up.markdown'])
  })
  it('resolves relative paths', () => {
    expect(resolveRel('/n/a/x.md', '../b/y.md')).toBe('/n/b/y.md')
    expect(resolveRel('C:\\n\\x.md', './y.md')).toBe('C:/n/y.md')
  })
  it('builds nodes, edges and ghost nodes', () => {
    const g = buildGraph([
      { path: '/n/A.md', content: '[[B]] [[Missing]] [c](sub/C.md)' },
      { path: '/n/B.md', content: '[[a]]' },
      { path: '/n/sub/C.md', content: 'hi' }
    ])
    expect(g.nodes.map((n) => n.label).sort()).toEqual(['A', 'B', 'C', 'Missing'])
    expect(g.nodes.find((n) => n.label === 'Missing')!.ghost).toBe(true)
    expect(g.edges.length).toBe(4)
    expect(g.edges.some((e) => e.s === '/n/B.md' && e.t === '/n/A.md')).toBe(true)
  })
  it('keeps the most-linked nodes when truncating', () => {
    const files = [{ path: '/h.md', content: '[[a]] [[b]] [[c]]' }, ...['a', 'b', 'c', 'lonely'].map((s) => ({ path: `/${s}.md`, content: '' }))]
    const g = buildGraph(files, 3)
    expect(g.truncated).toBe(true)
    expect(g.nodes.length).toBe(3)
    expect(g.nodes.some((n) => n.label === 'h')).toBe(true)
  })
  it('local subgraph respects depth', () => {
    const g = buildGraph([
      { path: '/a.md', content: '[[b]]' },
      { path: '/b.md', content: '[[c]]' },
      { path: '/c.md', content: '[[d]]' },
      { path: '/d.md', content: '' }
    ])
    expect(localSubgraph(g, '/a.md', 1).nodes.length).toBe(2)
    expect(localSubgraph(g, '/a.md', 2).nodes.length).toBe(3)
    expect(localSubgraph(g, '/zzz', 2).nodes.length).toBe(0)
  })
})

describe('forceLayout', () => {
  it('is deterministic, bounded, and pulls linked nodes closer than unlinked ones', () => {
    const ids = ['a', 'b', 'c', 'd']
    const edges = [{ s: 'a', t: 'b' }]
    const p1 = forceLayout(ids, edges, 800, 600)
    const p2 = forceLayout(ids, edges, 800, 600)
    expect(p1.get('a')).toEqual(p2.get('a'))
    for (const p of p1.values()) expect(p.x >= 20 && p.x <= 780 && p.y >= 20 && p.y <= 580).toBe(true)
    const dist = (u: string, v: string) => Math.hypot(p1.get(u)!.x - p1.get(v)!.x, p1.get(u)!.y - p1.get(v)!.y)
    expect(dist('a', 'b')).toBeLessThan(dist('a', 'd'))
    expect(forceLayout([], [], 100, 100).size).toBe(0)
  })
})
