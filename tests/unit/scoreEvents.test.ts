import { describe, it, expect } from 'vitest'
import { jianpuEvents, jianpuTokens, gongcheEvents } from '@/lib/music/scoreEvents'
import { lilypondEvents } from '@/lib/music/lilypondEvents'
import { markFromEvents } from '@/lib/music/player'

describe('jianpuEvents', () => {
  it('maps degrees to midi and advances time', () => {
    const ev = jianpuEvents('1=C 4/4\n1 2 3 4 |', 60)
    expect(ev.map((e) => e.midi)).toEqual([60, 62, 64, 65])
    expect(ev.map((e) => e.t)).toEqual([0, 1, 2, 3])
  })
  it('handles octave, under-line, dot, dash and rests', () => {
    const ev = jianpuEvents("1=C 4/4\n1' 2/ 0 3. - |", 60)
    expect(ev[0].midi).toBe(72)
    expect(ev[1].d).toBe(0.5)
    expect(ev.length).toBe(3)
    expect(ev[2].d).toBe(1.5 + 1)
  })
  it('chords share a start time and keep source ranges', () => {
    const src = '1=C 4/4\n[1 3 5] 2 |'
    const ev = jianpuEvents(src, 60)
    expect(ev.slice(0, 3).map((e) => e.t)).toEqual([0, 0, 0])
    expect(src.slice(ev[0].range![0], ev[0].range![1])).toBe('[1 3 5]')
    expect(src.slice(ev[3].range![0], ev[3].range![1])).toBe('2')
  })
  it('tokens skip slur and tuplet markers', () => {
    expect(jianpuTokens("(3: 1 2 3) 5' |").length).toBe(4)
  })
  it('tuplet shortens duration', () => {
    const ev = jianpuEvents('1=C 4/4\n(3: 1 2 3) |', 60)
    expect(Math.abs(ev[0].d - 2 / 3) < 1e-9).toBe(true)
  })
  it('returns nothing for invalid source', () => {
    expect(jianpuEvents('garbage', 60)).toEqual([])
  })
})

describe('gongcheEvents', () => {
  it('maps characters and ranges', () => {
    const src = '調：小工調\n上 尺 工, |'
    const ev = gongcheEvents(src, 1)
    expect(ev.length).toBe(3)
    expect(src.slice(ev[2].range![0], ev[2].range![1])).toBe('工,')
    expect(ev[1].midi - ev[0].midi).toBe(2)
  })
})

describe('lilypondEvents', () => {
  it('parses absolute notes and durations', () => {
    const ev = lilypondEvents("\\version \"2.24.0\"\n{ c'4 d'8 e'2 r4 g'4 }")
    expect(ev.map((e) => e.midi)).toEqual([60, 62, 64, 67])
    expect(ev[1].t).toBeCloseTo(ev[0].d, 6)
    expect(ev[2].d).toBeCloseTo(ev[0].d * 2, 6)
    expect(ev[3].t).toBeCloseTo(ev[2].t + ev[2].d + ev[0].d, 6)
  })
  it('relative mode picks the nearest octave', () => {
    const ev = lilypondEvents("\\relative c' { c4 g' c, b }")
    expect(ev.map((e) => e.midi)).toEqual([60, 67, 60, 59])
  })
  it('accidentals, chords and ties', () => {
    const ev = lilypondEvents("{ cis'4 <c' e' g'>4 c'4~ c'4 bes4 }")
    expect(ev[0].midi).toBe(61)
    expect(ev.slice(1, 4).map((e) => e.midi)).toEqual([60, 64, 67])
    expect(ev[4].d).toBeCloseTo(ev[0].d * 2, 6)
    expect(ev[5].midi).toBe(58)
  })
  it('repeat, tempo and variables', () => {
    const ev = lilypondEvents("mel = { c'4 d'4 }\n\\score { \\repeat volta 2 { \\mel } }")
    expect(ev.length).toBe(4)
    const t = lilypondEvents("{ \\tempo 4 = 60 c'4 }")
    expect(t[0].d).toBeCloseTo(1, 6)
  })
  it('parallel voices start together', () => {
    const ev = lilypondEvents("<< { c'4 d'4 } \\\\ { e4 f4 } >>")
    expect(ev.length).toBe(4)
    expect(ev.filter((e) => e.t === 0).length).toBe(2)
  })
  it('skips header blocks and lyrics', () => {
    const ev = lilypondEvents("\\header { title = \"a b c\" }\n{ c'4 } \\addlyrics { la }")
    expect(ev.length).toBe(1)
  })
})

describe('markFromEvents', () => {
  it('reports ranges of active events', () => {
    const m = markFromEvents([{ t: 0, d: 1, midi: 60, range: [3, 5] }, { t: 1, d: 1, midi: 62, range: [6, 7] }], {} as HTMLElement, 1.2)
    expect(m.ranges).toEqual([[6, 7]])
  })
})
