import type { MusicRenderer, MusicRenderOptions } from './types'
import { extractAbcParams, filterAbcPart } from './abc'
import { parseMidi, type Mark, type Transport } from './player'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 譜面上的錯誤用一行文字回報；沒有 K: 時 abcjs 不一定會報錯，所以先自己檢查。 */
export class MusicError extends Error {}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

/**
 * abcjs 渲染器（動態載入）。播放：由 abcjs 產生 MIDI，交給通用播放器；
 * 只播放「已按分譜過濾的那一份副本」，譜上的高亮用 abcjs 的 noteTimings。
 */
export function createAbcRenderer(): MusicRenderer & { transport(): Promise<Transport | null> } {
  let mount: HTMLElement | null = null
  let visual: any = null
  let lastSource = ''
  let fullSource = ''
  let timings: any[] = []

  return {
    async render(source: string, el: HTMLElement, options: MusicRenderOptions) {
      timings = []
      mount = el
      if (!/^K:/m.test(source)) throw new MusicError('缺少 K:（調號）欄位')
      const { params, error } = extractAbcParams(source)
      if (error) throw new MusicError(error)
      const abcjs: any = await import('abcjs')
      fullSource = source
      lastSource = filterAbcPart(source, options.part)
      el.replaceChildren() // 先清掉上一次的 SVG，不要疊出多份
      const tunes: any[] = abcjs.renderAbc(el, lastSource, { responsive: 'resize', add_classes: true, paddingleft: 0, paddingright: 0, ...(params.tablature ? { tablature: params.tablature } : {}) })
      visual = tunes?.[0] ?? null
      const lines = visual?.lines?.length ?? 0
      if (!visual || lines === 0) {
        const w = (visual?.warnings as string[] | undefined)?.map(stripTags).find(Boolean)
        throw new MusicError(w || '無法解析這段 ABC')
      }
    },
    async transport() {
      if (!visual) return null
      const abcjs: any = await import('abcjs')
      // 音高與時間都從 abcjs 自己產生的 MIDI 取，和 setTiming 用同一份速度設定
      const raw = abcjs.synth.getMidiFile(lastSource, { midiOutputType: 'binary' })
      const bytes: Uint8Array | undefined = Array.isArray(raw) ? raw[0] : raw
      if (!bytes?.length) return null
      const events = parseMidi(new Uint8Array(bytes))
      if (!events.length) return null
      visual.setTiming()
      timings = (visual.noteTimings ?? []).filter((n: any) => n.type === 'event')
      const wholeSource = lastSource
      return {
        events,
        mark(sec: number): Mark {
          const ms = sec * 1000
          const act = timings.filter((n) => n.milliseconds <= ms && ms < n.milliseconds + Math.max(n.duration ?? 0, 120))
          const els: Element[] = []
          const ranges: [number, number][] = []
          for (const n of act) {
            for (const g of n.elements ?? []) for (const x of Array.isArray(g) ? g : [g]) if (x) els.push(x)
            // 只有「總譜」時字元位置才對得上圍欄內文；聲部過濾後的副本偏移會不同
            if (wholeSource === fullSource) ranges.push([n.startChar, n.endChar])
          }
          return { key: act.map((n) => n.milliseconds).join(','), els, ranges }
        }
      }
    },
    destroy() {
      visual = null
      lastSource = ''
      timings = []
      mount?.replaceChildren()
      mount = null
    }
  }
}
