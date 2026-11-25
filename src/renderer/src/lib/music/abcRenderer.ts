import type { MusicRenderer, MusicRenderOptions } from './types'
import { extractAbcParams, filterAbcPart } from './abc'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 譜面上的錯誤用一行文字回報；沒有 K: 時 abcjs 不一定會報錯，所以先自己檢查。 */
export class MusicError extends Error {}

const stripTags = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

/**
 * abcjs 渲染器（動態載入）。播放用 abcjs 自帶 synth，按下播放才載入音源。
 * 只播放「已按分譜過濾的那一份副本」。
 */
export function createAbcRenderer(): MusicRenderer & { play(): Promise<void>; stop(): void; playing(): boolean } {
  let mount: HTMLElement | null = null
  let visual: any = null
  let synth: any = null
  let ctx: AudioContext | null = null
  let isPlaying = false
  let lastSource = ''

  const stop = () => {
    isPlaying = false
    try {
      synth?.stop()
    } catch {
      /* 已停止 */
    }
    synth = null
  }

  return {
    async render(source: string, el: HTMLElement, options: MusicRenderOptions) {
      stop() // 文字變了，舊的聲音不能繼續
      mount = el
      if (!/^K:/m.test(source)) throw new MusicError('缺少 K:（調號）欄位')
      const { params, error } = extractAbcParams(source)
      if (error) throw new MusicError(error)
      const abcjs: any = await import('abcjs')
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
    async play() {
      if (!visual) return
      const abcjs: any = await import('abcjs')
      if (!abcjs.synth?.supportsAudio?.()) throw new MusicError('這個環境不支援音訊播放')
      stop()
      ctx ??= new AudioContext()
      await ctx.resume()
      const s = new abcjs.synth.CreateSynth()
      synth = s
      await s.init({ audioContext: ctx, visualObj: visual })
      await s.prime() // 這裡才會載入音源
      if (synth !== s) return // 載入期間已被停止或文字已變
      isPlaying = true
      s.start()
    },
    stop,
    playing: () => isPlaying,
    destroy() {
      stop()
      visual = null
      lastSource = ''
      mount?.replaceChildren()
      mount = null
      void ctx?.close().catch(() => undefined)
      ctx = null
    }
  }
}
