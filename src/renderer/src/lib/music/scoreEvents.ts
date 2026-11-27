/**
 * 把簡譜／工尺譜／LilyPond 的原始碼換成音符事件（純函式，不碰 DOM）。
 * range 是「圍欄內文」的字元範圍（UTF-16 位移），用來在代碼上高亮正在播放的位置。
 */
import { parseJianpu } from './jianpu'
import { parseGongche } from './gongche'
import type { NoteEv } from './player'

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function keyBase(key: string): number {
  const m = /^([A-G])([#b]?)$/.exec(key)
  if (!m) return 60
  const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12
  return 60 + (pc > 6 ? pc - 12 : pc)
}

const lineStarts = (src: string): number[] => {
  const out = [0]
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') out.push(i + 1)
  return out
}

/** 在一行旋律文字裡，依序切出每個「音符／和弦／延時線」的 [起,止) */
export function jianpuTokens(text: string): [number, number][] {
  const out: [number, number][] = []
  const mod = (i: number) => {
    while (i < text.length && /[',./_]/.test(text[i])) i++
    return i
  }
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '(') {
      const m = /^\(\d+:/.exec(text.slice(i))
      i += m ? m[0].length : 1
    } else if (c === '[') {
      const s = i
      while (i < text.length && text[i] !== ']') i++
      i = mod(Math.min(text.length, i + 1))
      out.push([s, i])
    } else if (/[0-7]/.test(c)) {
      const s = i
      i = mod(i + 1)
      out.push([s, i])
    } else if (c === '-') {
      out.push([i, i + 1])
      i++
    } else i++
  }
  return out
}

export function jianpuEvents(source: string, bpm = 90): NoteEv[] {
  const r = parseJianpu(source)
  if (!r.ok) return []
  const score = r.score
  const beat = 60 / bpm
  const base = keyBase(score.key)
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const starts = lineStarts(source.replace(/\r\n?/g, '\n'))
  const ev: NoteEv[] = []
  let t = 0
  let gi = 0
  const tuplet: number[] = []
  const scale = () => tuplet.reduce((a, b) => a * b, 1)
  for (const row of score.rows) {
    const glyphCount = row.items.filter((i) => i.t === 'note' || i.t === 'chord' || i.t === 'dash').length
    const toks = jianpuTokens(lines[row.line - 1] ?? '')
    const useRanges = toks.length === glyphCount
    let k = 0
    let last: NoteEv[] = []
    for (const it of row.items) {
      if (it.t === 'open') {
        if (it.kind === 'tuplet' && it.n) tuplet.push(it.n === 3 ? 2 / 3 : it.n === 5 ? 4 / 5 : it.n === 6 ? 4 / 6 : it.n === 7 ? 4 / 7 : 1)
        else if (it.kind === 'tuplet') tuplet.push(1)
        else tuplet.push(1)
        continue
      }
      if (it.t === 'close') {
        tuplet.pop()
        continue
      }
      if (it.t === 'bar') continue
      const range: [number, number] | undefined = useRanges ? [starts[row.line - 1] + toks[k][0], starts[row.line - 1] + toks[k][1]] : undefined
      k++
      const g = gi++
      if (it.t === 'dash') {
        const add = beat * scale()
        for (const e of last) e.d += add
        t += add
        continue
      }
      const d = beat * Math.pow(2, -it.under) * (it.dot ? 1.5 : 1) * scale()
      const notes = it.t === 'note' ? [{ deg: it.deg, oct: it.oct }] : it.notes
      last = []
      for (const n of notes) {
        if (n.deg < 1 || n.deg > 7) continue
        const e: NoteEv = { t, d, midi: base + MAJOR[n.deg - 1] + 12 * n.oct, gi: g, range }
        ev.push(e)
        last.push(e)
      }
      t += d
    }
  }
  return ev
}

/* ------------------------------ 工尺譜 ------------------------------ */

/** 各調「上」字的音高（以主音為準，近似值；與實際宮調定義可能有出入） */
const GONGCHE_TONIC: Record<string, number> = { 小工調: 62, 凡字調: 60, 六字調: 58, 正宮調: 55, 乙字調: 65, 上字調: 64, 尺字調: 63 }
/** 譜字 → [簡譜級數, 八度偏移]。上=1 尺=2 工=3 凡=4 六=5 五=6 乙=7，合四一為低八度的 5 6 7 */
const GONGCHE_DEG: Record<string, [number, number]> = { 上: [1, 0], 尺: [2, 0], 工: [3, 0], 凡: [4, 0], 六: [5, 0], 五: [6, 0], 乙: [7, 0], 合: [5, -1], 四: [6, -1], 一: [7, -1] }

export function gongcheEvents(source: string, beat = 0.5): NoteEv[] {
  const r = parseGongche(source)
  if (!r.ok) return []
  const tonic = GONGCHE_TONIC[r.score.key ?? '小工調'] ?? 62
  const text = source.replace(/\r\n?/g, '\n')
  const lines = text.split('\n')
  const starts = lineStarts(text)
  const ev: NoteEv[] = []
  let t = 0
  let gi = 0
  let last: NoteEv | null = null
  for (const row of r.score.rows) {
    const chars = [...(lines[row.line - 1] ?? '')]
    const off = (idx: number) => chars.slice(0, idx).join('').length
    for (const it of row.items) {
      if (it.t === 'bar') continue
      const g = gi++
      if (it.t === 'dash') {
        if (last) last.d += beat
        t += beat
        continue
      }
      let end = it.col // 0 起算的字元序，指向譜字之後
      while (end < chars.length && /[',./]/.test(chars[end])) end++
      const [deg, o] = GONGCHE_DEG[it.ch] ?? [1, 0]
      const d = beat * Math.pow(2, -it.under) * (it.dot ? 1.5 : 1)
      const e: NoteEv = { t, d, midi: tonic + MAJOR[deg - 1] + 12 * (o + it.oct), gi: g, range: [starts[row.line - 1] + off(it.col - 1), starts[row.line - 1] + off(end)] }
      ev.push(e)
      last = e
      t += d
    }
  }
  return ev
}
