import type { MusicRenderer, MusicRenderOptions } from './types'
import { MusicError } from './abcRenderer'
import { withDefaultTuning } from './tabEdit'
import type { NoteEv, Transport } from './player'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 吉他六線譜：alphaTab（alphaTex 語法），動態載入。
 * - 只渲染不播放時不建立播放器，也不下載音源；按下播放才用「啟用播放器」的設定重建並載入音源。
 * - 顏色取自容器的 CSS color，深色模式不需要反相。
 */
const RENDER_TIMEOUT = 15000

function cssColor(el: HTMLElement): string {
  const c = getComputedStyle(el).color
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(c)
  if (!m) return 'rgb(30,30,30)'
  const a = m[4] === undefined ? 255 : Math.round(parseFloat(m[4]) * 255)
  return `rgba(${m[1]},${m[2]},${m[3]},${a / 255})`
}

function settings(el: HTMLElement, player: boolean): any {
  const base = (import.meta as any).env?.BASE_URL ?? './'
  const color = cssColor(el)
  const s: any = {
    core: { fontDirectory: `${base}font/`, useWorkers: true },
    display: {
      layoutMode: 'page',
      resources: { mainGlyphColor: color, secondaryGlyphColor: color, staffLineColor: color, barSeparatorColor: color, barNumberColor: color, scoreInfoColor: color }
    },
    player: { enablePlayer: player }
  }
  if (player) s.player.soundFont = `${base}soundfont/sonivox.sf2`
  return s
}

export function createTabRenderer(): MusicRenderer & { transport(): Promise<Transport | null> } {
  let mount: HTMLElement | null = null
  let host: HTMLElement | null = null
  let api: any = null
  let lib: any = null
  let withPlayer = false
  let lastSource = ''
  let gen = 0

  const dispose = () => {
    try {
      api?.destroy()
    } catch {
      /* 已銷毀 */
    }
    api = null
    host?.remove()
    host = null
  }

  /** 建立 api 並載入 tex；成功渲染完才 resolve，解析或渲染錯誤 reject 成 MusicError */
  async function build(el: HTMLElement, source: string, player: boolean): Promise<void> {
    const my = ++gen
    lib ??= await import('@coderline/alphatab')
    if (my !== gen) return
    dispose()
    host = document.createElement('div')
    host.className = 'tab-host'
    host.style.width = '100%'
    el.replaceChildren(host)
    withPlayer = player
    await new Promise<void>((resolve, reject) => {
      let done = false
      const finish = (err?: Error) => {
        if (done) return
        done = true
        window.clearTimeout(timer)
        err ? reject(err) : resolve()
      }
      const timer = window.setTimeout(() => finish(new MusicError('渲染逾時：alphaTab 沒有回應（字型或腳本可能沒載入）')), RENDER_TIMEOUT)
      try {
        api = new lib.AlphaTabApi(host, settings(el, player))
        api.error.on((e: any) => finish(new MusicError(`alphaTex 錯誤：${String(e?.message ?? e).split('\n')[0].slice(0, 160)}`)))
        api.renderFinished.on(() => finish())
        api.tex(withDefaultTuning(source))
      } catch (e) {
        finish(new MusicError(`無法建立六線譜：${String((e as Error)?.message ?? e).slice(0, 120)}`))
      }
    })
  }

  return {
    async render(source: string, el: HTMLElement, _o: MusicRenderOptions) {
      mount = el
      if (!source.trim()) throw new MusicError('這個 tab 圍欄是空的')
      lastSource = source
      try {
        await build(el, source, false)
      } catch (e) {
        dispose()
        el.replaceChildren()
        throw e
      }
    },
    async transport() {
      const score = api?.score
      if (!score) return null
      // 960 ticks = 一個四分音符；只依樂譜起始速度計時（不處理中途變速）
      const sec = (ticks: number) => (ticks / 960) * (60 / (score.tempo || 120))
      const events: NoteEv[] = []
      for (const track of score.tracks ?? [])
        for (const staff of track.staves ?? [])
          for (const bar of staff.bars ?? [])
            for (const voice of bar.voices ?? [])
              for (const beat of voice.beats ?? []) {
                if (beat.isRest) continue
                for (const n of beat.notes ?? []) {
                  if (n.isTieDestination || n.isDead) continue
                  const t = sec(beat.absolutePlaybackStart)
                  events.push({ t, d: Math.max(0.05, sec(beat.playbackDuration)), midi: n.realValue })
                }
              }
      return events.length ? { events } : null
    },
    destroy() {
      gen++
      dispose()
      mount?.replaceChildren()
      mount = null
      lastSource = ''
    }
  }
}
