import { createEngine } from './engines'
import type { MusicLang } from './types'

/** xml 圍欄只有真的是 MusicXML 才算譜（和編輯器預覽的判斷一致） */
export const isScoreFence = (lang: MusicLang, code: string): boolean => lang !== 'xml' || /<score-(partwise|timewise)[\s>]/.test(code)

/** 離線渲染一塊譜，回傳每頁的 SVG 字串；失敗回傳空陣列（呼叫端保留原始代碼）。 */
export async function renderScoreSvgs(lang: MusicLang, source: string, timeoutMs = 20_000): Promise<string[]> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:760px;visibility:hidden;pointer-events:none;background:#fff;color:#000'
  document.body.appendChild(host)
  const engine = createEngine(lang)
  try {
    await Promise.race([engine.render(source, host, { part: 'all' }), new Promise<void>((_, bad) => setTimeout(() => bad(new Error('timeout')), timeoutMs))])
    return [...host.querySelectorAll('svg')]
      .filter((s) => !s.closest('.music-err'))
      .map((s) => {
        const c = s.cloneNode(true) as SVGSVGElement
        if (!c.getAttribute('xmlns')) c.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        if (!c.getAttribute('viewBox')) {
          const r = (s as SVGSVGElement).getBoundingClientRect()
          if (r.width > 0 && r.height > 0) c.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`)
        }
        return new XMLSerializer().serializeToString(c)
      })
  } catch {
    return []
  } finally {
    try {
      engine.destroy()
    } catch {
      /* ignore */
    }
    host.remove()
  }
}
