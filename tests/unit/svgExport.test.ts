import { describe, it, expect } from 'vitest'
import { standaloneSvg, svgFileName } from '@/lib/music/svgExport'

describe('svg export', () => {
  it('makes a standalone file: xmlns, fixed ink colour, no width:100%, size from viewBox', () => {
    const out = standaloneSvg('<svg viewBox="0 0 720 128.4" style="width: 100%; height: auto;"><text fill="currentColor">工</text><line stroke="currentColor"/></svg>')
    expect(out.startsWith('<?xml')).toBe(true)
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(out).not.toMatch(/currentColor/i)
    expect(out).toContain('fill="#1a1a1a"')
    expect(out).not.toContain('width: 100%')
    expect(out).toContain('width="720"')
    expect(out).toContain('height="128"')
  })
  it('keeps existing xmlns/size and adds the xlink namespace when needed', () => {
    const out = standaloneSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><use xlink:href="#a"/></svg>')
    expect(out.match(/xmlns="/g)?.length).toBe(1)
    expect(out).toContain('xmlns:xlink=')
    expect(out).toContain('width="10"')
  })
  it('file names', () => {
    expect(svgFileName('abc', 0, 1)).toBe('score-abc.svg')
    expect(svgFileName('lilypond', 1, 3)).toBe('score-lilypond-2.svg')
  })
})
