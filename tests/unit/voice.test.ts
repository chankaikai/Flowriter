import { describe, it, expect } from 'vitest'
import { PEAK_COUNT, addVoice, anchorIndex, anchorOf, computePeaks, emptyVoice, fmtDur, isVoiceId, normPeaks, parseVoice, removeVoice, serializeVoice } from '@/lib/voice'

describe('voice notes data', () => {
  it('peaks are fixed-length, normalized and never silent-zero', () => {
    const p = computePeaks([0, 0.5, -1, 0.25, 0, 0, 0, 0], 4)
    expect(p.length).toBe(4)
    expect(Math.max(...p)).toBe(1)
    expect(computePeaks([], 5)).toEqual(new Array(5).fill(0.05))
    expect(computePeaks([0, 0, 0], 3).every((v) => v === 0.05)).toBe(true)
    expect(normPeaks([2, -1, NaN]).length).toBe(PEAK_COUNT)
    expect(normPeaks([2, -1]).slice(0, 2)).toEqual([1, 0])
  })
  it('round-trips and survives garbage', () => {
    const n = { id: 'abc123def', quote: '第一段', dur: 3.2, peaks: normPeaks([0.5]), ts: 1 }
    const f = addVoice(emptyVoice(), 'a.md', n)
    expect(parseVoice(serializeVoice(f)).files['a.md'][0]).toEqual(n)
    expect(parseVoice('{oops').files).toEqual({})
    expect(parseVoice('{"files":{"a.md":[{"id":"../x"},{"id":"abc123def","dur":9999}]}}').files['a.md'].length).toBe(1)
    expect(parseVoice('{"files":{"a.md":[{"id":"abc123def","dur":9999}]}}').files['a.md'][0].dur).toBe(120)
  })
  it('removes and drops empty files', () => {
    const f = addVoice(emptyVoice(), 'a.md', { id: 'abc123', quote: '', dur: 1, peaks: [], ts: 0 })
    expect(removeVoice(f, 'a.md', 'abc123').files).toEqual({})
  })
  it('id validation blocks path tricks', () => {
    expect(isVoiceId('abc123xyz')).toBe(true)
    for (const bad of ['../a', 'a/b', 'abc', '', 'ABCDEF1', 5]) expect(isVoiceId(bad)).toBe(false)
  })
  it('anchors by paragraph start; missing gives -1', () => {
    const blocks = ['標題', '這是  第一段內容，很長', '第二段']
    expect(anchorIndex(blocks, anchorOf('這是 第一段內容，很長'))).toBe(1)
    expect(anchorIndex(blocks, '被刪掉的段落')).toBe(-1)
    expect(anchorIndex(blocks, '')).toBe(-1)
    expect(anchorOf('x'.repeat(200)).length).toBe(80)
  })
  it('formats duration', () => {
    expect(fmtDur(5.4)).toBe('0:05')
    expect(fmtDur(65)).toBe('1:05')
  })
})
