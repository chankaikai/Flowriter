import { describe, it, expect } from 'vitest'
import { parseGongche, type GongcheScore } from '@/lib/music/gongche'
import { layoutGongche } from '@/lib/music/gongcheLayout'
import { gongcheEdit } from '@/lib/music/gongcheEdit'
import { applyEdit } from '@/lib/music/abcEdit'

const ok = (s: string): GongcheScore => {
  const r = parseGongche(s)
  if (!r.ok) throw new Error(JSON.stringify(r.errors))
  return r.score
}
const bad = (s: string) => {
  const r = parseGongche(s)
  if (r.ok) throw new Error('expected errors')
  return r.errors
}
const notes = (s: GongcheScore, row = 0) => s.rows[row].items.filter((i) => i.t === 'note') as any[]

const SPEC = '調: 小工調\n板: 一板一眼\n尺. 工 六 | 五 六 工.尺 | 上 尺 工 |\n'

describe('gongche parser', () => {
  it('parses the spec example verbatim', () => {
    const s = ok(SPEC.replace('調', '调'))
    expect(s.key).toBe('小工調')
    expect(s.ban).toBe('一板一眼')
    expect(s.rows.length).toBe(1)
    const n = notes(s)
    expect(n.map((x) => x.ch).join('')).toBe('尺工六五六工尺上尺工')
    expect(n[0]).toMatchObject({ ch: '尺', dot: true })
  })
  it('工.尺 is a dotted 工 followed by 尺 (no space needed)', () => {
    const s = ok('工.尺')
    const n = notes(s)
    expect(n.length).toBe(2)
    expect(n[0]).toMatchObject({ ch: '工', dot: true })
    expect(n[1]).toMatchObject({ ch: '尺', dot: false })
  })
  it('scans by character, not by spaces', () => {
    expect(notes(ok('合四一上尺')).map((x) => x.ch)).toEqual(['合', '四', '一', '上', '尺'])
  })
  it("octave, dot and reduction suffixes in order", () => {
    const n = notes(ok("六' 六,, 工./ 尺// 五'.//"))
    expect(n[0]).toMatchObject({ oct: 1, dot: false, under: 0 })
    expect(n[1]).toMatchObject({ oct: -2 })
    expect(n[2]).toMatchObject({ dot: true, under: 1 })
    expect(n[3]).toMatchObject({ under: 2 })
    expect(n[4]).toMatchObject({ oct: 1, dot: true, under: 2 })
  })
  it('bar lines and dash', () => {
    const s = ok('工 - | 尺 || 六 |]')
    expect(s.rows[0].items.filter((i) => i.t === 'bar').map((i: any) => i.kind)).toEqual(['single', 'double', 'end'])
    expect(s.rows[0].items.filter((i) => i.t === 'dash').length).toBe(1)
  })
  it('headers: both kinds accepted, either order, simplified or traditional', () => {
    const s = ok('板: 散板\n調：正宫调\n工')
    expect(s.key).toBe('正宮調')
    expect(s.ban).toBe('散板')
    expect(ok('調: 凡字調\n工').key).toBe('凡字調')
    expect(ok('工').key).toBeUndefined()
  })
  it('rejects bad header values and repeated headers', () => {
    expect(bad('調: 大工調\n工')[0].message).toMatch(/調名只能是/)
    expect(bad('板: 慢板\n工')[0].message).toMatch(/板式只能是/)
    expect(bad('調: 小工調\n調: 凡字調\n工')[0].message).toMatch(/只能寫一次/)
  })
  it('a header line after music is just an unknown character', () => {
    expect(bad('工\n調: 小工調').length).toBeGreaterThan(0)
  })
  it('errors carry line and column; numbers are rejected', () => {
    const e = bad('工 尺\n六 3 五')
    expect(e[0]).toMatchObject({ line: 2, col: 3 })
    expect(e[0].message).toMatch(/簡譜數字/)
    const u = bad('工 x')
    expect(u[0]).toMatchObject({ line: 1, col: 3 })
  })
  it('mixed octave marks and glued dash are errors', () => {
    expect(bad("工',")[0].message).toMatch(/高八度和低八度/)
    expect(bad('工-')[0].message).toMatch(/單獨/)
  })
  it('no notes is an error; CRLF and blank lines are fine', () => {
    expect(bad('調: 小工調')[0].message).toMatch(/沒有任何譜字/)
    expect(ok('工\r\n\r\n尺\r\n').rows.length).toBe(2)
  })
})

describe('gongche layout', () => {
  it('lays out left to right and wraps long rows at bar lines', () => {
    const one = layoutGongche(ok('工 尺 六 | 五'))
    expect(one.lines.length).toBe(1)
    const xs = one.lines[0].glyphs.map((g) => g.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
    const long = ok(Array.from({ length: 12 }, () => '工 尺 六 五 |').join(' '))
    const l = layoutGongche(long)
    expect(l.lines.length).toBeGreaterThan(1)
    for (const line of l.lines) for (const g of line.glyphs) expect(g.x + 40).toBeLessThanOrEqual(l.width)
    // 換行落在小節線之後
    expect(l.lines[0].glyphs.at(-1)!.item.t).toBe('bar')
  })
  it('adjacent short notes share one underline; sixteenths add a second', () => {
    const l = layoutGongche(ok('工/ 尺/ 六 五// 四//'))
    expect(l.lines[0].unders.filter((u) => u.level === 1).length).toBe(2)
    expect(l.lines[0].unders.filter((u) => u.level === 2).length).toBe(1)
  })
  it('headers are drawn as text', () => {
    expect(layoutGongche(ok(SPEC)).headers).toEqual(['調：小工調', '板：一板一眼'])
  })
})

describe('gongche toolbar', () => {
  it('inserts a note and a space; bar line', () => {
    expect(applyEdit('工 ', gongcheEdit('ch:尺', '工 ', 2, 2))).toBe('工 尺 ')
    expect(applyEdit('工', gongcheEdit('bar', '工', 1, 1))).toBe('工 | ')
  })
  it('dot goes on the previous note, once, before the reduction', () => {
    const t = '工 尺/ '
    expect(applyEdit(t, gongcheEdit('dot', t, t.length, t.length))).toBe('工 尺./ ')
    const d = '工 尺. '
    expect(gongcheEdit('dot', d, d.length, d.length).insert).toBe('')
  })
  it('octave up adds an apostrophe after existing octave marks, or cancels a low mark', () => {
    const t = '六 '
    expect(applyEdit(t, gongcheEdit('octUp', t, 2, 2))).toBe("六' ")
    expect(applyEdit('六, ', gongcheEdit('octUp', '六, ', 3, 3))).toBe('六 ')
  })
  it('does nothing when there is no previous note', () => {
    expect(gongcheEdit('dot', '| ', 2, 2).insert).toBe('')
  })
})
