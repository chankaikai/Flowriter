import { describe, it, expect } from 'vitest'
import { listAbcParts, filterAbcPart } from '@/lib/music/abc'
import { abcEdit, applyEdit } from '@/lib/music/abcEdit'

const SONG = `X:1
T:验收曲
M:3/4
L:1/4
Q:1/4=120
K:G
V:RH clef=treble name="右手"
V:LH clef=bass name="左手"
%%score (RH LH)
[V:RH] ( D G B ) | (3 d c B | "D7" A2 "G" G |
[V:LH] !ped! G,2 D | B,,2 !ped-up! D | G,3 |
`

describe('listAbcParts', () => {
  it('reads ids and names from V: fields', () => {
    expect(listAbcParts(SONG)).toEqual([{ id: 'RH', name: '右手' }, { id: 'LH', name: '左手' }])
  })
  it('uses id when there is no name', () => {
    expect(listAbcParts('X:1\nK:C\nV:1 clef=treble\nV:2 clef=bass\n')).toEqual([{ id: '1', name: '1' }, { id: '2', name: '2' }])
  })
  it('finds voices that only appear inline', () => {
    expect(listAbcParts('X:1\nK:C\n[V:A] CDEF|\n[V:B] GABc|\n').map((p) => p.id)).toEqual(['A', 'B'])
  })
  it('single voice and no voice', () => {
    expect(listAbcParts('X:1\nK:C\nCDEF|\n')).toEqual([])
    expect(listAbcParts('X:1\nK:C\nV:1\nCDEF|\n')).toHaveLength(1)
  })
})

describe('filterAbcPart', () => {
  it('all returns the source unchanged', () => expect(filterAbcPart(SONG, 'all')).toBe(SONG))
  it('rewrites an existing %%score', () => {
    const out = filterAbcPart(SONG, 'RH')
    expect(out.includes('%%score RH\n')).toBe(true)
    expect(out.includes('(RH LH)')).toBe(false)
    expect(out.includes('[V:LH] !ped! G,2 D')).toBe(true) // 其他聲部音符保留
  })
  it('inserts %%score after K: when missing', () => {
    const src = 'X:1\nK:C\nV:1 name="A"\nV:2 name="B"\n[V:1] CDEF|\n[V:2] GABc|\n'
    const out = filterAbcPart(src, '2')
    expect(out.split('\n')[2]).toBe('%%score 2')
  })
  it('does not mutate the input and ignores unknown parts', () => {
    const copy = SONG
    filterAbcPart(SONG, 'LH')
    expect(SONG).toBe(copy)
    expect(filterAbcPart(SONG, 'nope')).toBe(SONG)
  })
  it('keeps CRLF', () => {
    const out = filterAbcPart('X:1\r\nK:C\r\nV:1\r\nV:2\r\n', '1')
    expect(out.includes('\r\n%%score 1\r\n')).toBe(true)
  })
})

describe('abcEdit toolbar', () => {
  const run = (tool: any, text: string, a: number, b = a) => applyEdit(text, abcEdit(tool, text, a, b))
  it('clef lines', () => {
    expect(run('treble', 'X:1\n', 4)).toBe('X:1\nV:1 clef=treble name=""')
    expect(run('bass', 'X:1\nK:C', 3)).toBe('X:1\nV:2 clef=bass name=""\nK:C')
    expect(run('alto', 'X:1', 3)).toBe('X:1\nV:3 clef=alto name=""')
  })
  it('key inserts or cycles on a K: line', () => {
    expect(run('key', 'X:1', 3)).toBe('X:1\nK:C')
    expect(run('key', 'K:C', 1)).toBe('K:G')
    expect(run('key', 'K:Dm', 2)).toBe('K:C')
    expect(run('key', 'K:G clef=bass', 2)).toBe('K:D clef=bass')
  })
  it('meter inserts or cycles', () => {
    expect(run('meter', 'X:1', 3)).toBe('X:1\nM:4/4')
    expect(run('meter', 'M:3/4', 1)).toBe('M:4/4')
    expect(run('meter', 'M:12/8', 1)).toBe('M:2/4')
  })
  it('slur and triplet wrap selection or insert', () => {
    expect(run('slur', 'C D E', 0, 5)).toBe('(C D E)')
    expect(run('slur', '', 0)).toBe('( C D E )')
    expect(run('triplet', 'C D E', 0, 5)).toBe('(3 C D E)')
    expect(run('triplet', '', 0)).toBe('(3 C D E')
  })
  it('tie goes after the last note, never parentheses', () => {
    expect(run('tie', 'A2 A2', 0, 5)).toBe('A2 A2-')
    expect(run('tie', 'A2 A2', 2)).toBe('A2-  A2') // 無選區：在游標處插入 `- `
    expect(run('tie', 'z2', 0, 2)).toBe('z2- ')
  })
  it('pedal marks', () => {
    expect(run('ped', 'G,2', 0)).toBe('!ped!G,2')
    expect(run('pedUp', 'G,2', 3)).toBe('G,2!ped-up!')
  })
})
