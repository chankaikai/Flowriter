import type { MusicRenderer, MusicRenderOptions } from './types'
import { parseJianpu } from './jianpu'
import { layoutJianpu, NOTE_W } from './jianpuLayout'
import { MusicError } from './abcRenderer'

const NS = 'http://www.w3.org/2000/svg'
const el = (name: string, attrs: Record<string, string | number> = {}, text?: string): SVGElement => {
  const e = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  if (text !== undefined) e.textContent = text
  return e
}

/** 簡譜渲染器：自寫的 SVG，不依賴任何樂譜庫。所有顏色用 currentColor，跟著主題走。 */
export function createJianpuRenderer(): MusicRenderer {
  let mount: HTMLElement | null = null
  return {
    async render(source: string, target: HTMLElement, _options: MusicRenderOptions) {
      mount = target
      const r = parseJianpu(source)
      target.replaceChildren()
      if (!r.ok) {
        const e = r.errors[0]
        throw new MusicError(`第 ${e.line} 行第 ${e.col} 列：${e.message}${r.errors.length > 1 ? `（另有 ${r.errors.length - 1} 處）` : ''}`)
      }
      for (const w of r.score.warnings) {
        const d = document.createElement('div')
        d.className = 'music-warn'
        d.textContent = w
        target.appendChild(d)
      }
      const L = layoutJianpu(r.score)
      const svg = el('svg', { viewBox: `0 0 ${L.width} ${L.height}`, width: '100%', role: 'img', 'aria-label': '簡譜', class: 'jianpu-svg' }) as SVGSVGElement
      svg.style.maxWidth = `${Math.round(L.width * 1.5)}px`
      svg.style.color = 'inherit'
      svg.appendChild(el('text', { x: 10, y: 20, 'font-size': 15, 'font-weight': 600, fill: 'currentColor' }, L.header))
      for (const line of L.lines) {
        const g = el('g', { transform: `translate(0 ${line.top})`, fill: 'currentColor', stroke: 'none' })
        for (const f of line.funcs) {
          g.appendChild(el('text', { x: (f.x1 + f.x2) / 2, y: line.funcY, 'font-size': 12, 'text-anchor': 'middle', opacity: 0.8 }, f.text))
        }
        for (const gl of line.glyphs) {
          if (gl.kind === 'dash') {
            g.appendChild(el('line', { x1: gl.x - 8, x2: gl.x + 8, y1: line.base - 7, y2: line.base - 7, stroke: 'currentColor', 'stroke-width': 1.6 }))
            continue
          }
          const n = gl.notes.length
          gl.notes.forEach((note, i) => {
            const y = line.base - i * 22
            g.appendChild(el('text', { x: gl.x, y, 'font-size': 22, 'text-anchor': 'middle', 'font-family': 'ui-sans-serif, system-ui, sans-serif' }, String(note.deg)))
            if (note.oct > 0 && (gl.kind === 'note' || i === n - 1)) {
              for (let k = 0; k < note.oct; k++) g.appendChild(el('circle', { cx: gl.x, cy: y - 20 - k * 5, r: 1.7 }))
            }
            if (note.oct < 0 && (gl.kind === 'note' || i === 0)) {
              for (let k = 0; k < -note.oct; k++) g.appendChild(el('circle', { cx: gl.x, cy: y + 6 + gl.under * 4 + 4 + k * 5, r: 1.7 }))
            }
          })
          if (gl.dot) g.appendChild(el('circle', { cx: gl.x + 11, cy: line.base - 2, r: 1.8 }))
        }
        for (const u of line.under) {
          const y = line.base + 3 + (u.level - 1) * 4
          g.appendChild(el('line', { x1: u.x1, x2: u.x2, y1: y, y2: y, stroke: 'currentColor', 'stroke-width': 1.3 }))
        }
        for (const b of line.bars) {
          const top = line.base - 20
          const bot = line.base + 4
          if (b.kind === 'single') g.appendChild(el('line', { x1: b.x, x2: b.x, y1: top, y2: bot, stroke: 'currentColor', 'stroke-width': 1.2 }))
          else {
            g.appendChild(el('line', { x1: b.x - 2.5, x2: b.x - 2.5, y1: top, y2: bot, stroke: 'currentColor', 'stroke-width': 1.2 }))
            g.appendChild(el('line', { x1: b.x + 2.5, x2: b.x + 2.5, y1: top, y2: bot, stroke: 'currentColor', 'stroke-width': b.kind === 'end' ? 3 : 1.2 }))
          }
        }
        for (const a of line.arcs) {
          if (a.kind === 'slur') {
            const mid = (a.x1 + a.x2) / 2
            g.appendChild(el('path', { d: `M ${a.x1} ${a.y + 4} Q ${mid} ${a.y - 8} ${a.x2} ${a.y + 4}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3, 'stroke-linecap': 'round' }))
          } else {
            g.appendChild(el('path', { d: `M ${a.x1} ${a.y + 4} V ${a.y} H ${a.x2} V ${a.y + 4}`, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.1 }))
            g.appendChild(el('text', { x: (a.x1 + a.x2) / 2, y: a.y - 2, 'font-size': 11, 'text-anchor': 'middle' }, String(a.n)))
          }
        }
        svg.appendChild(g)
      }
      void NOTE_W
      target.appendChild(svg)
    },
    destroy() {
      mount?.replaceChildren()
      mount = null
    }
  }
}
