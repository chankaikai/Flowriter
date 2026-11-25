import { describe, it, expect } from 'vitest'
import { checkScoreSource, filterScoreParts, listScoreParts } from '@/lib/music/scoreParts'

const XML = `<?xml version="1.0"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Violin &amp; Co</part-name></score-part>
    <score-part id="P2"><part-name>Cello</part-name></score-part>
  </part-list>
  <part id="P1"><measure number="1"><note/></measure></part>
  <part id="P2"><measure number="1"><note/></measure></part>
</score-partwise>`

const MEI = `<mei xmlns="http://www.music-encoding.org/ns/mei"><music><body><mdiv><score>
<scoreDef><staffGrp>
  <staffDef n="1" label="Flute" lines="5"/>
  <staffDef n="2" lines="5"><label>Oboe</label><clef shape="G"/></staffDef>
</staffGrp></scoreDef>
<section><measure n="1"><staff n="1"><layer n="1"><note/></layer></staff><staff n="2"><layer n="1"><rest/></layer></staff></measure></section>
</score></mdiv></body></music></mei>`

describe('score source checks', () => {
  it('accepts valid roots and rejects the rest', () => {
    expect(checkScoreSource('xml', XML)).toBeNull()
    expect(checkScoreSource('mei', MEI)).toBeNull()
    expect(checkScoreSource('xml', '')).toMatch(/空的/)
    expect(checkScoreSource('xml', 'PK\u0003\u0004abc')).toMatch(/壓縮/)
    expect(checkScoreSource('xml', 'hello')).toMatch(/從 </)
    expect(checkScoreSource('xml', '<foo/>')).toMatch(/score-partwise/)
    expect(checkScoreSource('mei', '<foo/>')).toMatch(/mei/)
  })
})

describe('parts', () => {
  it('lists MusicXML parts with decoded names', () => {
    expect(listScoreParts('xml', XML)).toEqual([{ id: 'P1', name: 'Violin & Co' }, { id: 'P2', name: 'Cello' }])
  })
  it('lists MEI staves from attribute or child label', () => {
    expect(listScoreParts('mei', MEI)).toEqual([{ id: '1', name: 'Flute' }, { id: '2', name: 'Oboe' }])
  })
  it('filters MusicXML on a copy', () => {
    const f = filterScoreParts('xml', XML, 'P2')
    expect(f).toContain('id="P2"')
    expect(f).not.toContain('id="P1"')
    expect(f.match(/<part\s/g)?.length).toBe(1)
    expect(XML).toContain('id="P1"') // 原文沒被動到
    expect(filterScoreParts('xml', XML, 'all')).toBe(XML)
    expect(filterScoreParts('xml', XML, 'gone')).toBe(XML)
  })
  it('filters MEI staffDef and staff', () => {
    const f = filterScoreParts('mei', MEI, '1')
    expect(f.match(/<staffDef\b/g)?.length).toBe(1)
    expect(f.match(/<staff\b/g)?.length).toBe(1)
    expect(f).toContain('Flute')
    expect(f).not.toContain('Oboe')
    expect(listScoreParts('mei', f).length).toBe(1)
  })
})
