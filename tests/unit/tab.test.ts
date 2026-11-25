import { describe, it, expect } from 'vitest'
import { extractAbcParams } from '@/lib/music/abc'
import { abcEdit, applyEdit } from '@/lib/music/abcEdit'
import { tabEdit, withDefaultTuning } from '@/lib/music/tabEdit'
import { isMusicLang } from '@/lib/music/types'

describe('abc tablature passthrough', () => {
  it('no directive → no params', () => {
    expect(extractAbcParams('X:1\nK:C\nCDEF|')).toEqual({ params: {} })
  })
  it('accepts guitar tablature', () => {
    const r = extractAbcParams('%%abcjs_render_params {"tablature":[{"instrument":"guitar","capo":2}]}\nX:1\nK:C\nC|')
    expect(r.error).toBeUndefined()
    expect(r.params.tablature).toEqual([{ instrument: 'guitar', capo: 2 }])
  })
  it('rejects other keys and bad values', () => {
    expect(extractAbcParams('%%abcjs_render_params {"add_classes":false}\n').error).toMatch(/只支援 tablature/)
    expect(extractAbcParams('%%abcjs_render_params {"tablature":[{"instrument":"banjo"}]}\n').error).toMatch(/instrument/)
    expect(extractAbcParams('%%abcjs_render_params {oops\n').error).toMatch(/JSON/)
    expect(extractAbcParams('%%abcjs_render_params {"tablature":[{"instrument":"guitar","capo":99}]}\n').error).toMatch(/capo/)
    expect(extractAbcParams('%%abcjs_render_params {"tablature":[{"instrument":"guitar","tuning":["<script>"]}]}\n').error).toMatch(/tuning/)
  })
  it('toolbar inserts the directive once', () => {
    const t = 'X:1\nK:C\nC|'
    const once = applyEdit(t, abcEdit('tablature', t, 0, 0))
    expect(once.startsWith('%%abcjs_render_params {"tablature"')).toBe(true)
    expect(abcEdit('tablature', once, 0, 0).insert).toBe('')
  })
})

describe('tab (alphaTex)', () => {
  it('tab is an active fence language', () => {
    expect(isMusicLang('tab')).toBe(true)
    expect(isMusicLang('mei')).toBe(false)
  })
  it('default tuning is added only to the render copy and only when missing', () => {
    const src = '0.3 2.2 | 3.1'
    expect(withDefaultTuning(src)).toBe('\\tuning E4 B3 G3 D3 A2 E2\n.\n' + src)
    expect(withDefaultTuning('\\tuning E4 B3 G3 D3 A2 E2\n.\n0.3')).toBe('\\tuning E4 B3 G3 D3 A2 E2\n.\n0.3')
    expect(withDefaultTuning('\\title "x"\n.\n0.3')).toContain('\\tuning')
    expect(withDefaultTuning('\\title "x"\n.\n0.3').match(/^\.$/gm)?.length).toBe(1)
    expect(withDefaultTuning('\\instrument 25\n.\n0.3')).toBe('\\instrument 25\n.\n0.3')
  })
  it('toolbar edits', () => {
    expect(tabEdit('tuning', '0.3', 0, 0).insert).toContain('\\tuning E4 B3 G3 D3 A2 E2')
    expect(tabEdit('tuning', '\\tuning E4\n.\n0.3', 0, 0).insert).toBe('')
    expect(applyEdit('0.3 2.2', tabEdit('chord', '0.3 2.2', 0, 7))).toBe('(0.3 2.2)')
    expect(tabEdit('bar', 'a', 1, 1).insert).toBe(' | ')
  })
})
