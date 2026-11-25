/** 簡譜排版（純函式）：把解析結果換算成座標，渲染器只負責照座標畫。 */
import type { JianpuScore, JianpuNote } from './jianpu'

export const NOTE_W = 30
const BAR_W = 14
const PAD = 8
const LEFT = 10
const HEADER_H = 30
const CHORD_STEP = 22

export interface PlacedGlyph {
  gi: number
  /** 中心 x */
  x: number
  kind: 'note' | 'chord' | 'dash'
  notes: JianpuNote[] // note 時一個；chord 時由低到高；dash 時空
  dot: boolean
  under: 0 | 1 | 2
}

export interface LayoutLine {
  top: number
  height: number
  /** 數字基線（相對這一行的頂端） */
  base: number
  width: number
  funcs: { x1: number; x2: number; text: string }[]
  glyphs: PlacedGlyph[]
  bars: { x: number; kind: 'single' | 'double' | 'end' }[]
  under: { level: 1 | 2; x1: number; x2: number }[]
  /** 連音線（slur）與連音符（tuplet）；y 是弧線／括號所在高度 */
  arcs: { kind: 'slur' | 'tuplet'; n?: number; x1: number; x2: number; y: number }[]
  funcY: number
}

export interface JianpuLayout {
  width: number
  height: number
  header: string
  lines: LayoutLine[]
}

interface Span { kind: 'slur' | 'tuplet'; n?: number; a: number; b: number; depth: number }
interface Meas { glyphs: { gi: number; item: any }[]; bar?: 'single' | 'double' | 'end'; func?: string; w: number }

const pitchKey = (n: JianpuNote) => n.oct * 8 + n.deg

export function layoutJianpu(score: JianpuScore, maxWidth = 620): JianpuLayout {
  // 1) 展開成「音符」序列，並找出連音線／連音符的範圍
  let gi = 0
  const spans: Span[] = []
  const open: { kind: 'slur' | 'tuplet'; n?: number; a: number; depth: number }[] = []
  const rowMeasures: Meas[][] = []
  for (const row of score.rows) {
    const ms: Meas[] = []
    let cur: Meas = { glyphs: [], w: 0 }
    let mi = 0
    const push = (bar?: Meas['bar']) => {
      cur.bar = bar
      cur.func = row.func?.[mi]
      ms.push(cur)
      mi++
      cur = { glyphs: [], w: 0 }
    }
    for (const it of row.items) {
      if (it.t === 'note' || it.t === 'chord' || it.t === 'dash') {
        cur.glyphs.push({ gi: gi++, item: it })
      } else if (it.t === 'open') {
        open.push({ kind: it.kind, n: it.n, a: gi, depth: open.length })
      } else if (it.t === 'close') {
        const o = open.pop()
        if (o && gi - 1 >= o.a) spans.push({ kind: o.kind, n: o.n, a: o.a, b: gi - 1, depth: o.depth })
      } else if (it.t === 'bar') {
        push(it.kind)
      }
    }
    if (cur.glyphs.length) push(undefined)
    rowMeasures.push(ms)
  }
  const maxDepth = Math.max(0, ...spans.map((s) => s.depth + 1))

  // 2) 每個小節的寬度
  const barW = (k?: Meas['bar']) => (k ? (k === 'single' ? BAR_W : BAR_W + 6) : 0)
  for (const ms of rowMeasures) for (const m of ms) m.w = PAD * 2 + m.glyphs.length * NOTE_W + barW(m.bar)

  // 3) 每個原始碼行各自裝箱成一到多行
  const lines: LayoutLine[] = []
  let top = HEADER_H
  for (const ms of rowMeasures) {
    const packs: Meas[][] = []
    let curPack: Meas[] = []
    let w = LEFT
    for (const m of ms) {
      if (curPack.length && w + m.w > maxWidth) {
        packs.push(curPack)
        curPack = []
        w = LEFT
      }
      curPack.push(m)
      w += m.w
    }
    if (curPack.length) packs.push(curPack)

    for (const pack of packs) {
      const glyphs: PlacedGlyph[] = []
      const bars: LayoutLine['bars'] = []
      const funcs: LayoutLine['funcs'] = []
      const under: LayoutLine['under'] = []
      let x = LEFT
      let maxHigh = 0
      let maxLow = 0
      let maxUnder = 0
      let chordExtra = 0
      for (const m of pack) {
        const x0 = x
        x += PAD
        const mStart = glyphs.length
        for (const g of m.glyphs) {
          const it = g.item
          const cx = x + NOTE_W / 2
          if (it.t === 'note') {
            glyphs.push({ gi: g.gi, x: cx, kind: 'note', notes: [{ deg: it.deg, oct: it.oct }], dot: it.dot, under: it.under })
            maxHigh = Math.max(maxHigh, it.oct)
            maxLow = Math.max(maxLow, -it.oct)
            maxUnder = Math.max(maxUnder, it.under)
          } else if (it.t === 'chord') {
            const notes = [...it.notes].sort((a: JianpuNote, b: JianpuNote) => pitchKey(a) - pitchKey(b))
            glyphs.push({ gi: g.gi, x: cx, kind: 'chord', notes, dot: it.dot, under: it.under })
            chordExtra = Math.max(chordExtra, (notes.length - 1) * CHORD_STEP)
            maxHigh = Math.max(maxHigh, notes[notes.length - 1].oct)
            maxLow = Math.max(maxLow, -notes[0].oct)
            maxUnder = Math.max(maxUnder, it.under)
          } else {
            glyphs.push({ gi: g.gi, x: cx, kind: 'dash', notes: [], dot: false, under: 0 })
          }
          x += NOTE_W
        }
        x += PAD
        if (m.func) funcs.push({ x1: x0, x2: x, text: m.func })
        // 減時線：同一小節內連續、且減時層級 ≥ L 的音連成一條
        for (const level of [1, 2] as const) {
          let run: PlacedGlyph[] = []
          const flush = () => {
            if (run.length) under.push({ level, x1: run[0].x - NOTE_W / 2 + 5, x2: run[run.length - 1].x + NOTE_W / 2 - 5 })
            run = []
          }
          for (const g of glyphs.slice(mStart)) {
            if (g.kind !== 'dash' && g.under >= level) run.push(g)
            else flush()
          }
          flush()
        }
        if (m.bar) {
          bars.push({ x: x + barW(m.bar) / 2 - (m.bar === 'single' ? 0 : 2), kind: m.bar })
          x += barW(m.bar)
        }
      }
      const spanHere = spans.filter((s) => glyphs.length && s.a <= glyphs[glyphs.length - 1].gi && s.b >= glyphs[0].gi)
      const hasFunc = funcs.length > 0
      const funcRoom = hasFunc ? 18 : 0
      const depthHere = Math.max(0, ...spanHere.map((s) => s.depth + 1))
      const arcRoom = depthHere ? 14 * depthHere + 4 : 0
      const dotsRoom = maxHigh ? maxHigh * 5 + 4 : 0
      const base = funcRoom + arcRoom + dotsRoom + chordExtra + 24
      const underRoom = 6 + maxUnder * 4 + (maxLow ? maxLow * 5 + 4 : 0) + 6
      const arcs: LayoutLine['arcs'] = spanHere.map((s) => {
        const first = glyphs.find((g) => g.gi >= s.a)!
        const last = [...glyphs].reverse().find((g) => g.gi <= s.b)!
        return {
          kind: s.kind,
          n: s.n,
          x1: first.x - NOTE_W / 2 + 6,
          x2: last.x + NOTE_W / 2 - 6,
          y: funcRoom + 4 + (depthHere - 1 - Math.min(s.depth, depthHere - 1)) * 14 + 10
        }
      })
      lines.push({ top, height: base + underRoom, base, width: x, funcs, glyphs, bars, under, arcs, funcY: 12 })
      top += base + underRoom + 6
    }
  }
  void maxDepth
  const width = Math.max(200, ...lines.map((l) => l.width + LEFT))
  return { width, height: top + 4, header: `1=${score.key}  ${score.meter.n}/${score.meter.d}`, lines }
}
