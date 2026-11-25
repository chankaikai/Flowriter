import type { MusicRenderer, MusicRenderOptions } from './types'
import { MusicError } from './abcRenderer'
import { checkScoreSource, filterScoreParts, type ScoreLang } from './scoreParts'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Verovio（MEI／MusicXML → SVG）。首次出現 mei／xml 圍欄時才動態載入，之後全部圍欄共用一個 toolkit。
 * 所有呼叫都是同步的，共用同一個實例不會互相穿插。
 */
let toolkitPromise: Promise<any> | null = null

async function getToolkit(): Promise<any> {
  toolkitPromise ??= (async () => {
    // @ts-ignore — verovio 的子路徑匯出沒有型別宣告
    const [wasm, esm] = await Promise.all([import('verovio/wasm'), import('verovio/esm')])
    const mod = await (wasm as any).default()
    return new (esm as any).VerovioToolkit(mod)
  })().catch((e) => {
    toolkitPromise = null // 載入失敗下次可重試
    throw e
  })
  return toolkitPromise
}

export function createVerovioRenderer(lang: ScoreLang): MusicRenderer {
  let mount: HTMLElement | null = null
  return {
    async render(source: string, el: HTMLElement, options: MusicRenderOptions) {
      mount = el
      const bad = checkScoreSource(lang, source)
      if (bad) throw new MusicError(bad)
      const text = filterScoreParts(lang, source.replace(/^﻿/, ''), options.part) // 只動副本
      let tk: any
      try {
        tk = await getToolkit()
      } catch (e) {
        throw new MusicError(`無法載入 Verovio：${String((e as Error)?.message ?? e).split('\n')[0].slice(0, 120)}`)
      }
      const width = Math.max(480, Math.round(el.clientWidth || 800))
      const scale = 40
      tk.setOptions({
        scale,
        pageWidth: Math.round((width * 100) / scale),
        pageHeight: 60000,
        adjustPageHeight: true,
        svgViewBox: true,
        breaks: 'auto',
        header: 'none',
        footer: 'none',
        svgRemoveXlink: true
      })
      const ok = tk.loadData(text)
      const pages: number = ok ? tk.getPageCount() : 0
      if (!ok || pages < 1) {
        const log = String(tk.getLog?.() ?? '').split('\n').map((l: string) => l.trim()).filter(Boolean)
        throw new MusicError(`Verovio 無法解析：${(log[0] ?? `不是有效的 ${lang === 'mei' ? 'MEI' : 'MusicXML'}`).slice(0, 160)}`)
      }
      const frag = document.createDocumentFragment()
      for (let p = 1; p <= pages; p++) {
        const wrap = document.createElement('div')
        wrap.className = 'vrv-page'
        wrap.innerHTML = tk.renderToSVG(p)
        const svg = wrap.querySelector('svg')
        if (svg) {
          svg.removeAttribute('height')
          svg.removeAttribute('width')
          svg.style.width = '100%'
          svg.style.height = 'auto'
        }
        frag.appendChild(wrap)
      }
      el.replaceChildren(frag)
    },
    destroy() {
      mount?.replaceChildren()
      mount = null
    }
  }
}
