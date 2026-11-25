import { describe, it, expect } from 'vitest'
import { formatLogs, hashText, summarizeLog } from '@/lib/music/lilypondRenderer'
import { isMusicLang, musicDebounce, MUSIC_LANGS } from '@/lib/music/types'

describe('lilypond helpers', () => {
  it('hash is stable and sensitive to changes', () => {
    expect(hashText('\\version "2.24.0"')).toBe(hashText('\\version "2.24.0"'))
    expect(hashText('c4 d e')).not.toBe(hashText('c4 d f'))
    expect(hashText('')).not.toBe(hashText(' '))
  })
  it('formats logs from strings, arrays and objects', () => {
    expect(formatLogs('a\r\nb')).toBe('a\nb')
    expect(formatLogs(['x', { text: 'y' }, { message: 'z' }])).toBe('x\ny\nz')
    expect(formatLogs(undefined)).toBe('')
  })
  it('summary puts error lines first and caps at 12 lines', () => {
    const log = ['GNU LilyPond 2.26.0', 'Processing `a.ly\'', 'a.ly:3:5: error: syntax error, unexpected }', '  c4 d e }'].join('\n')
    const s = summarizeLog(log).split('\n')
    expect(s[0]).toMatch(/error: syntax error/)
    expect(s.length).toBe(4)
    expect(summarizeLog(Array.from({ length: 40 }, (_, i) => 'line' + i).join('\n')).split('\n').length).toBe(12)
    expect(summarizeLog('')).toBe('')
  })
})

describe('music language table', () => {
  it('has exactly the seven fixed fence names and all are active', () => {
    expect([...MUSIC_LANGS]).toEqual(['abc', 'jianpu', 'tab', 'mei', 'xml', 'gongche', 'lilypond'])
    for (const l of MUSIC_LANGS) expect(isMusicLang(l)).toBe(true)
    expect(isMusicLang('score')).toBe(false)
    expect(isMusicLang('music')).toBe(false)
  })
  it('debounce: 800 for lilypond, 200 for the rest', () => {
    expect(musicDebounce('lilypond')).toBe(800)
    for (const l of MUSIC_LANGS.filter((x) => x !== 'lilypond')) expect(musicDebounce(l)).toBe(200)
  })
})
