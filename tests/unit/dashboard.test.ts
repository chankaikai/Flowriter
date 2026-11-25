import { describe, it, expect } from 'vitest'
import { parseTarget, withTarget, chapters, imbalanced, scanTodos, taskCounts, badges, layoutIssues, cleanMarkdown, bodyWords } from '@/lib/dashboard'

describe('dashboard', () => {
  it('reads and writes target in front matter', () => {
    expect(parseTarget('---\ntitle: a\ntarget: 3000\n---\nhi')).toBe(3000)
    expect(parseTarget('hi')).toBe(null)
    expect(withTarget('hi\n', 800)).toBe('---\ntarget: 800\n---\n\nhi\n')
    expect(withTarget('---\ntitle: a\ntarget: 3000\n---\nhi', 500)).toBe('---\ntitle: a\ntarget: 500\n---\nhi')
    expect(withTarget('---\ntitle: a\n---\nhi', 500)).toBe('---\ntitle: a\ntarget: 500\n---\nhi')
    expect(withTarget('---\ntitle: a\ntarget: 3\n---\nhi', null)).toBe('---\ntitle: a\n---\nhi')
  })
  it('body words exclude front matter', () => {
    expect(bodyWords('---\ntarget: 5\n---\n你好世界')).toBe(4)
  })
  it('chapters and imbalance', () => {
    const md = '# A\n' + '字'.repeat(100) + '\n# B\n' + '字'.repeat(100) + '\n# C\n' + '字'.repeat(900) + '\n# D\n短\n'
    const ch = chapters(md)
    expect(ch.length).toBe(4)
    const im = imbalanced(ch)
    expect(im.some((x) => x.title === 'C' && x.kind === 'long')).toBe(true)
    expect(im.some((x) => x.title === 'D' && x.kind === 'short')).toBe(true)
  })
  it('scans todos, marks and empty links, skipping code', () => {
    const md = '- [ ] a\n- [x] b\n- [ ] c\n\nTODO later\n\n[x]()\n\n```\nTODO in code\n```\n'
    const t = scanTodos(md)
    expect(t.filter((x) => x.kind === 'task').map((x) => x.index)).toEqual([0, 2])
    expect(t.some((x) => x.kind === 'mark' && x.line === 4)).toBe(true)
    expect(t.some((x) => x.kind === 'link')).toBe(true)
    expect(t.some((x) => x.text.includes('in code'))).toBe(false)
    expect(taskCounts(md)).toEqual({ done: 1, total: 3 })
  })
  it('badges', () => {
    const md = '![a](x.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nx\n```\n\n$$\nx\n$$\n\n[l](http://x) [^1]\n'
    const b = badges(md)
    expect(b.images).toBe(1)
    expect(b.tables).toBe(1)
    expect(b.code).toBe(1)
    expect(b.math).toBe(1)
    expect(b.links).toBe(1)
    expect(b.footnotes).toBe(1)
  })
  it('layout issues', () => {
    const md = '# A\n\n### C\n\n' + '字'.repeat(600) + '\n'
    const l = layoutIssues(md)
    expect(l.some((x) => x.rule === 'heading-skip')).toBe(true)
    expect(l.some((x) => x.rule === 'long-para')).toBe(true)
  })
  it('clean markdown', () => {
    expect(cleanMarkdown('---\na: 1\n---\n\nhi  \n<!-- x -->\n\n\n\nbye\n')).toBe('hi\n\nbye\n')
  })
})
