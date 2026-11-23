import { describe, it, expect } from 'vitest'
import { healthCheck, checkImages } from '@/lib/health'
import { splitSentences } from '@/lib/tts'

const rules = (md: string) => healthCheck(md).issues.map((i) => i.rule)

describe('healthCheck', () => {
  it('finds heading jumps and duplicates', () => {
    const r = rules('# A\n\n### B\n\n### B\n')
    expect(r).toContain('heading-jump')
    expect(r).toContain('dup-heading')
  })
  it('finds missing and unused footnotes', () => {
    const r = healthCheck('文字[^a]\n\n[^b]: 沒人用')
    expect(r.issues.map((i) => i.rule).sort()).toEqual(['fn-missing', 'fn-unused'])
  })
  it('finds empty links and missing alt', () => {
    const r = rules('[x]() ![](a.png)')
    expect(r).toContain('empty-link')
    expect(r).toContain('img-alt')
  })
  it('checks anchors against headings', () => {
    expect(rules('# Hello World\n\n[ok](#hello-world) [bad](#nope)')).toEqual(['bad-anchor'])
  })
  it('flags TODO and bad calc, ignores code', () => {
    const r = rules('TODO 補圖\n\n{{x + 1}}\n\n```\nTODO\n```')
    expect(r).toContain('todo')
    expect(r).toContain('bad-calc')
    expect(healthCheck('```\nTODO [a]()\n```').issues).toEqual([])
  })
  it('collects local images only', () => {
    const r = healthCheck('![a](pics/a.png) ![b](https://x.com/b.png)')
    expect(r.images.map((i) => i.src)).toEqual(['pics/a.png'])
  })
  it('reports missing image files', async () => {
    const r = await checkImages([{ line: 0, src: 'a.png' }, { line: 1, src: 'b.png' }], (s) => '/d/' + s, async (p) => p.endsWith('b.png'))
    expect(r.map((i) => i.snippet)).toEqual(['a.png'])
  })
})
describe('splitSentences', () => {
  it('splits Chinese and English sentences', () => {
    expect(splitSentences('你好。今天天氣好！ok? yes')).toEqual(['你好。', '今天天氣好！', 'ok?', 'yes'])
  })
})
