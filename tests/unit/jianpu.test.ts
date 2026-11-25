import { describe, it, expect } from 'vitest'
import { parseJianpu, type JianpuScore } from '@/lib/music/jianpu'

const ok = (src: string): JianpuScore => {
  const r = parseJianpu(src)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.score
}
const bad = (src: string) => {
  const r = parseJianpu(src)
  if (r.ok) throw new Error('expected errors')
  return r.errors
}
const notes = (s: JianpuScore, row = 0) => s.rows[row].items.filter((i) => i.t === 'note') as any[]

describe('jianpu parser', () => {
  it('parses example 1 (with func)', () => {
    const s = ok('1=C 4/4\nfunc: T | S | D7 | T\n1 3 5 | 6 1 4 | 5 7 2 | 1 - - |\n(1 2 3) 5 | 6. 5 3 - |\n')
    expect(s.key).toBe('C')
    expect(s.meter).toEqual({ n: 4, d: 4 })
    expect(s.rows.length).toBe(2)
    expect(s.rows[0].func).toEqual(['T', 'S', 'D7', 'T'])
    expect(s.rows[0].bars).toBe(4)
    expect(s.rows[1].bars).toBe(2)
    expect(s.warnings).toEqual([]) // func 套用在下一行旋律，小節數相符
    const dots = notes(s, 1).filter((n) => n.dot)
    expect(dots.length).toBe(1)
    expect(s.rows[0].items.filter((i) => i.t === 'dash').length).toBe(2)
  })
  it('parses example 2', () => {
    const s = ok("1=C 4/4\n1 2 3 4 | 5 6 7 1' |\n(1 2 3) 4 - | 5. 6 5 3 |\n")
    expect(notes(s, 0).at(-1)).toMatchObject({ deg: 1, oct: 1 })
    expect(s.rows[1].items[0]).toMatchObject({ t: 'open', kind: 'slur' })
  })
  it('key names and bB normalisation', () => {
    expect(ok('1=F# 3/4\n1 |').key).toBe('F#')
    expect(ok('1=Bb 2/4\n1 |').key).toBe('Bb')
    expect(ok('1=bB 2/4\n1 |').key).toBe('Bb')
    expect(ok('1=Eb 6/8\n1 |').meter).toEqual({ n: 6, d: 8 })
  })
  it('octave suffixes', () => {
    const n = notes(ok("1=C 4/4\n1' 1'' 1, 1,, 1 |"))
    expect(n.map((x) => x.oct)).toEqual([1, 2, -1, -2, 0])
  })
  it('octave must come after the digit', () => {
    expect(bad("1=C 4/4\n'1 |")[0].message.includes('數字後面')).toBe(true)
    expect(bad("1=C 4/4\n1', |").length).toBeGreaterThan(0)
  })
  it('/ and _ are equivalent, after dot', () => {
    const a = notes(ok('1=C 4/4\n1/ 1_ 1// 1__ 6./ |'))
    expect(a.map((x) => x.under)).toEqual([1, 1, 2, 2, 1])
    expect(a[4]).toMatchObject({ deg: 6, dot: true, under: 1 })
  })
  it('(1 2 3) is a slur, not a triplet; (3: 1 2 3) is a tuplet', () => {
    const slur = ok('1=C 4/4\n(1 2 3) 4 |').rows[0].items
    expect(slur[0]).toEqual({ t: 'open', kind: 'slur' })
    expect(slur.some((i) => i.t === 'open' && i.kind === 'tuplet')).toBe(false)
    const tup = ok('1=C 4/4\n(3: 1 2 3) 4 |').rows[0].items
    expect(tup[0]).toEqual({ t: 'open', kind: 'tuplet', n: 3 })
    expect(tup[4]).toEqual({ t: 'close', kind: 'tuplet' })
    expect(ok('1=C 4/4\n(5: 1 2 3 4 5) |').rows[0].items[0]).toMatchObject({ n: 5 })
  })
  it('(3 1 2 3) is a slur over the notes 3 1 2 3', () => {
    const it = ok('1=C 4/4\n(3 1 2 3) |').rows[0].items
    expect(it[0]).toEqual({ t: 'open', kind: 'slur' })
    expect(it.filter((i) => i.t === 'note').length).toBe(4)
  })
  it('chords', () => {
    const c = ok('1=C 4/4\n[1 3 5] [1 3 5]. |').rows[0].items.filter((i) => i.t === 'chord') as any[]
    expect(c.length).toBe(2)
    expect(c[0].notes.map((n: any) => n.deg)).toEqual([1, 3, 5])
    expect(c[1].dot).toBe(true)
  })
  it('bar line kinds and rests', () => {
    const it = ok('1=C 4/4\n0 1 | 2 || 3 |]').rows[0].items
    expect(it.filter((i) => i.t === 'bar').map((b: any) => b.kind)).toEqual(['single', 'double', 'end'])
    expect(it[0]).toMatchObject({ t: 'note', deg: 0 })
  })
  it('func bar count mismatch is only a warning', () => {
    const r = parseJianpu('1=C 4/4\nfunc: T | S\n1 2 | 3 4 | 5 6 |')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.score.warnings[0]).toBe('功能標記有 2 小節，旋律有 3 小節')
      expect(r.score.rows[0].bars).toBe(3)
    }
  })
  it('errors carry line and column; nothing is dropped silently', () => {
    const e = bad('1=C 4/4\n1 2 x 3 |')
    expect(e[0]).toMatchObject({ line: 2, col: 5 })
    expect(bad('1=C 4/4\n1 8 |')[0].col).toBe(3)
    expect(bad('1=C 4/4\n(1 2 3 |')[0].message.includes('沒有關閉')).toBe(true)
    expect(bad('1=C 4/4\n1 2 3) |')[0].message.includes(')')).toBe(true)
    expect(bad('1=C 4/4\n12 |').length).toBeGreaterThan(0)
    expect(bad('1=C 4/4\n[1 3 |').length).toBeGreaterThan(0)
    expect(bad('1 2 3').length).toBeGreaterThan(0) // 缺標頭
  })
  it('dash must stand alone', () => {
    expect(bad('1=C 4/4\n1 -2 |').length).toBeGreaterThan(0)
  })
  it('tolerates CRLF and blank lines', () => {
    expect(ok('1=C 4/4\r\n\r\n1 2 |\r\n').rows.length).toBe(1)
  })
})

import { layoutJianpu } from '@/lib/music/jianpuLayout'

describe('jianpu layout', () => {
  const lay = (src: string) => {
    const r = parseJianpu(src)
    if (!r.ok) throw new Error('parse')
    return layoutJianpu(r.score)
  }
  it('func labels sit over their own measure', () => {
    const L = lay('1=C 4/4\nfunc: T | S | D7 | T\n1 3 5 | 6 1 4 | 5 7 2 | 1 - - |')
    const f = L.lines[0].funcs
    expect(f.map((x) => x.text)).toEqual(['T', 'S', 'D7', 'T'])
    // 每個標記的範圍內正好包著該小節的音
    f.forEach((fn, i) => {
      const inside = L.lines[0].glyphs.filter((g) => g.x > fn.x1 && g.x < fn.x2)
      expect(inside.length).toBe(3)
      if (i) expect(fn.x1 >= f[i - 1].x2 - 1).toBe(true)
    })
  })
  it('adjacent eighth notes share one underline; sixteenths add a second', () => {
    const L = lay('1=C 4/4\n1/ 2/ 3// 4// 5 |')
    const u = L.lines[0].under
    expect(u.filter((x) => x.level === 1).length).toBe(1)
    expect(u.filter((x) => x.level === 2).length).toBe(1)
  })
  it('dotted note and octave info are kept', () => {
    const L = lay("1=C 4/4\n6. 1' 1, |")
    const g = L.lines[0].glyphs
    expect(g[0].dot).toBe(true)
    expect(g[1].notes[0].oct).toBe(1)
    expect(g[2].notes[0].oct).toBe(-1)
  })
  it('slur is an arc, tuplet is a bracket with a number', () => {
    const s = lay('1=C 4/4\n(1 2 3) 4 |').lines[0].arcs
    expect(s[0].kind).toBe('slur')
    const t = lay('1=C 4/4\n(3: 1 2 3) 4 |').lines[0].arcs
    expect(t[0]).toMatchObject({ kind: 'tuplet', n: 3 })
  })
  it('chord notes are stacked low to high', () => {
    const c = lay('1=C 4/4\n[5 1 3] |').lines[0].glyphs[0]
    expect(c.notes.map((n) => n.deg)).toEqual([1, 3, 5])
  })
  it('wraps long rows into several lines', () => {
    const bars = Array.from({ length: 12 }, () => '1 2 3 4').join(' | ')
    expect(lay(`1=C 4/4\n${bars} |`).lines.length).toBeGreaterThan(1)
  })
})

import { jianpuEdit } from '@/lib/music/jianpuEdit'
import { applyEdit } from '@/lib/music/abcEdit'

describe('jianpu toolbar', () => {
  const run = (tool: any, text: string, a: number, b = a) => applyEdit(text, jianpuEdit(tool, text, a, b))
  it('octave on a selected note token, otherwise inserts', () => {
    expect(run('octUp', '1 2 3', 2, 3)).toBe("1 2' 3")
    expect(run('octUp', "6.", 0, 2)).toBe("6'.")
    expect(run('octDown', '1/', 0, 2)).toBe('1,/')
    expect(run('octUp', '1,', 0, 2)).toBe('1')
    expect(run('octUp', '', 0)).toBe("1'")
    expect(run('octDown', '', 0)).toBe('1,')
  })
  it('dot and reduction', () => {
    expect(run('dot', '5', 0, 1)).toBe('5.')
    expect(run('dot', '5.', 0, 2)).toBe('5.')
    expect(run('dot', '', 0)).toBe('5.')
    expect(run('eighth', '1', 0, 1)).toBe('1/')
    expect(run('sixteenth', '1', 0, 1)).toBe('1//')
    expect(run('eighth', '1//', 0, 3)).toBe('1/')
    expect(run('eighth', '', 0)).toBe('1/')
    expect(run('sixteenth', '', 0)).toBe('1//')
  })
  it('dash, slur, tuplet', () => {
    expect(run('dash', '1', 1)).toBe('1 -')
    expect(run('slur', '1 2 3', 0, 5)).toBe('(1 2 3)')
    expect(run('slur', '', 0)).toBe('(1 2 3)')
    expect(run('tuplet', '', 0)).toBe('(3: 1 2 3)')
    expect(run('tuplet', '1', 1)).toBe('1 (3: 1 2 3)')
  })
  it('func line is inserted once, under the header', () => {
    expect(run('func', '1=C 4/4\n1 2 |', 3)).toBe('1=C 4/4\nfunc: T\n1 2 |')
    const has = '1=C 4/4\nfunc: S\n1 2 |'
    expect(run('func', has, 3)).toBe(has)
  })
})
