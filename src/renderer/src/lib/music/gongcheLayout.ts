import type { GongcheItem, GongcheScore } from './gongche'

/** 工尺譜橫排版面（純函式，單位是 SVG 使用者座標）。 */
export const GC = { width: 720, margin: 16, cell: 40, font: 28, rowH: 64, headH: 26 }

export interface Glyph {
  x: number
  /** 這個格子的中心 x */
  cx: number
  item: GongcheItem
}
export interface GcLine { y: number; glyphs: Glyph[]; unders: { x1: number; x2: number; level: 1 | 2 }[] }
export interface GcLayout { width: number; height: number; headers: string[]; lines: GcLine[] }

const advance = (it: GongcheItem) => (it.t === 'bar' ? (it.kind === 'single' ? 14 : 20) : GC.cell)

export function layoutGongche(score: GongcheScore, width = GC.width): GcLayout {
  const headers: string[] = []
  if (score.key) headers.push(`調：${score.key}`)
  if (score.ban) headers.push(`板：${score.ban}`)
  const top = headers.length ? GC.headH + 8 : 4
  const maxX = width - GC.margin
  const lines: GcLine[] = []
  let line: GcLine | null = null
  let x = GC.margin

  const start = () => {
    line = { y: top + lines.length * GC.rowH, glyphs: [], unders: [] }
    lines.push(line)
    x = GC.margin
  }

  for (const row of score.rows) {
    start()
    let lastBar = -1 // 本行最後一個小節線的 glyph 序號，換行時優先在這裡斷
    for (const it of row.items) {
      const w = advance(it)
      if (x + w > maxX && line!.glyphs.length) {
        // 優先在最近的小節線後換行，其餘部分搬到下一行
        const cut = lastBar >= 0 && lastBar < line!.glyphs.length - 1 ? lastBar + 1 : line!.glyphs.length
        const moved = line!.glyphs.splice(cut)
        start()
        for (const g of moved) {
          g.x = x
          g.cx = x + advance(g.item) / 2
          line!.glyphs.push(g)
          x += advance(g.item)
        }
        lastBar = -1
      }
      line!.glyphs.push({ x, cx: x + w / 2, item: it })
      if (it.t === 'bar') lastBar = line!.glyphs.length - 1
      x += w
    }
  }

  for (const l of lines) {
    for (const level of [1, 2] as const) {
      let from: Glyph | null = null
      let prev: Glyph | null = null
      const flush = () => {
        if (from && prev) l.unders.push({ x1: from.cx - GC.font * 0.42, x2: prev.cx + GC.font * 0.42, level })
        from = prev = null
      }
      for (const g of l.glyphs) {
        if (g.item.t === 'note' && g.item.under >= level) {
          from ??= g
          prev = g
        } else flush()
      }
      flush()
    }
  }
  return { width, height: top + lines.length * GC.rowH + 4, headers, lines }
}
