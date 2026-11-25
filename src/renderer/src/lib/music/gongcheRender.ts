import type { MusicRenderer } from './types'
import { MusicError } from './abcRenderer'
import { parseGongche } from './gongche'
import { GC, layoutGongche } from './gongcheLayout'

const NS = 'http://www.w3.org/2000/svg'
const el = (name: string, attrs: Record<string, string | number> = {}, text?: string) => {
  const e = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  if (text !== undefined) e.textContent = text
  return e
}

/** 工尺譜渲染器：橫排，顏色用 currentColor，不載入任何函式庫。 */
export function createGongcheRenderer(): MusicRenderer {
  let mount: HTMLElement | null = null
  return {
    async render(source, target) {
      mount = target
      const r = parseGongche(source)
      if (!r.ok) {
        const e = r.errors[0]
        throw new MusicError(`第 ${e.line} 行第 ${e.col} 列：${e.message}${r.errors.length > 1 ? `（另有 ${r.errors.length - 1} 處）` : ''}`)
      }
      const lay = layoutGongche(r.score)
      const svg = el('svg', { viewBox: `0 0 ${lay.width} ${lay.height}`, class: 'gongche-svg', role: 'img', 'aria-label': '工尺譜' })
      svg.style.width = '100%'
      svg.style.height = 'auto'
      svg.style.color = 'inherit'
      const FONT = `"Noto Serif CJK TC","Noto Serif CJK SC","Songti SC","Source Han Serif","SimSun","Kaiti TC",serif`
      lay.headers.forEach((h, i) => svg.appendChild(el('text', { x: GC.margin + i * 220, y: GC.headH - 6, 'font-size': 15, fill: 'currentColor', 'font-family': FONT, opacity: 0.8 }, h)))
      for (const l of lay.lines) {
        const base = l.y + GC.font + 4 // 字的基線
        for (const g of l.glyphs) {
          const it = g.item
          if (it.t === 'note') {
            svg.appendChild(el('text', { x: g.cx, y: base, 'text-anchor': 'middle', 'font-size': GC.font, fill: 'currentColor', 'font-family': FONT }, it.ch))
            // 八度點：高八度在字上方，低八度在字下方（減時線之下）
            const n = Math.abs(it.oct)
            for (let k = 0; k < n; k++) {
              const cy = it.oct > 0 ? base - GC.font * 0.95 - k * 6 : base + 8 + it.under * 5 + k * 6
              svg.appendChild(el('circle', { cx: g.cx, cy, r: 1.9, fill: 'currentColor' }))
            }
            if (it.dot) svg.appendChild(el('circle', { cx: g.cx + GC.font * 0.55, cy: base - 3, r: 2, fill: 'currentColor' }))
          } else if (it.t === 'dash') {
            svg.appendChild(el('line', { x1: g.cx - 9, x2: g.cx + 9, y1: base - GC.font * 0.35, y2: base - GC.font * 0.35, stroke: 'currentColor', 'stroke-width': 1.8 }))
          } else {
            const x = g.x + (it.kind === 'single' ? 7 : 6)
            const y1 = base - GC.font * 0.9
            const y2 = base + 6
            svg.appendChild(el('line', { x1: x, x2: x, y1, y2, stroke: 'currentColor', 'stroke-width': it.kind === 'end' ? 2.6 : 1.4 }))
            if (it.kind !== 'single') svg.appendChild(el('line', { x1: x + 5, x2: x + 5, y1, y2, stroke: 'currentColor', 'stroke-width': it.kind === 'end' ? 1 : 1.4 }))
          }
        }
        for (const u of l.unders) {
          const y = base + 5 + (u.level - 1) * 5
          svg.appendChild(el('line', { x1: u.x1, x2: u.x2, y1: y, y2: y, stroke: 'currentColor', 'stroke-width': 1.4 }))
        }
      }
      target.replaceChildren(svg)
    },
    destroy() {
      mount?.replaceChildren()
      mount = null
    }
  }
}
