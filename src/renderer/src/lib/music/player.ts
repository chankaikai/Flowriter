/**
 * 通用樂譜播放器：給一串「音符事件」就能播放、暫停、停止、拖曳進度，
 * 並隨時間回報「現在正在響的是哪些事件」（用來在譜與代碼上高亮）。
 * 音源是 WebAudio 的簡單合成（不需下載任何音色檔，所以所有譜種都能立刻播）。
 */

export type PlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended'
export interface PlayInfo { status: PlayStatus; cur: number; total: number }

export interface NoteEv {
  /** 開始時間（秒） */
  t: number
  /** 長度（秒） */
  d: number
  midi: number
  /** 對應原始碼的字元範圍（相對於圍欄內文），用來高亮代碼 */
  range?: [number, number]
  /** 對應譜面元素的編號（簡譜／工尺譜渲染時標在 data-gi 上） */
  gi?: number
}

/** 某一刻要在譜與代碼上高亮的東西；key 相同代表沒變，不必重畫 */
export interface Mark { key: string; els: Element[]; ranges: [number, number][] }

/** 傳輸層：引擎交出事件，必要時自己提供「時間 → 高亮」的查表 */
export interface Transport {
  events: NoteEv[]
  mark?(sec: number): Mark
}

/** 沒有自己查表的引擎：高亮目前響著的事件（譜面元素用 data-gi 找，代碼用 range） */
export function markFromEvents(events: NoteEv[], mount: HTMLElement, sec: number): Mark {
  const act = events.filter((e) => e.t <= sec && sec < e.t + Math.max(e.d, 0.12))
  const els: Element[] = []
  const ranges: [number, number][] = []
  for (const e of act) {
    if (e.gi !== undefined) mount.querySelectorAll(`[data-gi="${e.gi}"]`).forEach((n) => els.push(n))
    if (e.range) ranges.push(e.range)
  }
  const key = act.map((e) => `${e.gi ?? ''}:${e.range?.[0] ?? ''}`).join(',')
  return { key, els, ranges }
}

export interface PlayerHooks {
  onInfo(info: PlayInfo): void
  /** 目前正在響的事件（每次集合有變才呼叫） */
  onActive(active: NoteEv[]): void
  /** 每個時間刻（秒）都會呼叫；給用時間查表的引擎（Verovio）用 */
  onTime?(sec: number): void
}

let sharedCtx: AudioContext | null = null
export function audioCtx(): AudioContext {
  sharedCtx ??= new AudioContext()
  return sharedCtx
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

export class NotePlayer {
  private ev: NoteEv[]
  readonly total: number
  private hooks: PlayerHooks
  private status: PlayStatus = 'idle'
  private offset = 0
  private startCtx = 0
  private next = 0
  private nodes: { osc: OscillatorNode[]; gain: GainNode; end: number }[] = []
  private timer = 0
  private lastActiveKey = ''

  constructor(events: NoteEv[], hooks: PlayerHooks) {
    this.ev = [...events].sort((a, b) => a.t - b.t)
    this.total = this.ev.reduce((m, e) => Math.max(m, e.t + e.d), 0)
    this.hooks = hooks
  }

  get state(): PlayStatus { return this.status }
  get position(): number {
    if (this.status !== 'playing') return this.offset
    return Math.min(this.total, audioCtx().currentTime - this.startCtx)
  }

  private emit(): void {
    this.hooks.onInfo({ status: this.status, cur: this.position, total: this.total })
  }

  async play(): Promise<void> {
    if (this.status === 'playing') return
    if (this.status === 'ended' || this.offset >= this.total) this.offset = 0
    const ctx = audioCtx()
    await ctx.resume()
    this.startCtx = ctx.currentTime - this.offset
    this.next = this.firstAtOrAfter(this.offset)
    this.status = 'playing'
    window.clearInterval(this.timer)
    this.timer = window.setInterval(() => this.tick(), 40)
    this.tick()
  }

  pause(): void {
    if (this.status !== 'playing') return
    this.offset = this.position
    this.status = 'paused'
    this.silence()
    window.clearInterval(this.timer)
    this.emit()
  }

  stop(): void {
    window.clearInterval(this.timer)
    this.silence()
    this.offset = 0
    this.status = 'idle'
    this.lastActiveKey = ''
    this.hooks.onActive([])
    this.hooks.onTime?.(0)
    this.emit()
  }

  seek(frac: number): void {
    const t = Math.max(0, Math.min(1, frac)) * this.total
    const wasPlaying = this.status === 'playing'
    this.silence()
    this.offset = t
    if (wasPlaying) {
      this.startCtx = audioCtx().currentTime - t
      this.next = this.firstAtOrAfter(t)
    } else {
      if (this.status === 'ended') this.status = 'paused'
      if (this.status === 'idle' && t > 0) this.status = 'paused'
    }
    this.report(t)
    this.emit()
  }

  destroy(): void {
    window.clearInterval(this.timer)
    this.silence()
    this.status = 'idle'
  }

  private firstAtOrAfter(t: number): number {
    let lo = 0
    let hi = this.ev.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.ev[mid].t < t - 1e-6) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  private silence(): void {
    const ctx = audioCtx()
    for (const n of this.nodes) {
      try {
        n.gain.gain.cancelScheduledValues(ctx.currentTime)
        n.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.015)
        n.osc.forEach((o) => o.stop(ctx.currentTime + 0.08))
      } catch {
        /* 已結束 */
      }
    }
    this.nodes = []
  }

  private tick(): void {
    const ctx = audioCtx()
    const cur = ctx.currentTime - this.startCtx
    // 排程接下來 0.3 秒內的音
    while (this.next < this.ev.length && this.ev[this.next].t <= cur + 0.3) {
      const e = this.ev[this.next++]
      const when = this.startCtx + e.t
      if (when + e.d < ctx.currentTime) continue
      this.voice(ctx, e, Math.max(when, ctx.currentTime))
    }
    this.nodes = this.nodes.filter((n) => n.end > ctx.currentTime)
    this.report(cur)
    if (cur >= this.total + 0.15) {
      window.clearInterval(this.timer)
      this.status = 'ended'
      this.offset = this.total
      this.hooks.onActive([])
      this.emit()
      return
    }
    this.emit()
  }

  private report(cur: number): void {
    const active = this.ev.filter((e) => e.t <= cur && cur < e.t + Math.max(e.d, 0.12))
    const key = active.map((e) => `${e.t}:${e.midi}`).join(',')
    if (key !== this.lastActiveKey) {
      this.lastActiveKey = key
      this.hooks.onActive(active)
    }
    this.hooks.onTime?.(cur)
  }

  /** 一個音：基音（三角波）＋ 第二泛音，快起音、依長度衰減，聽起來接近撥弦／鋼琴 */
  private voice(ctx: AudioContext, e: NoteEv, when: number): void {
    const dur = Math.max(0.12, e.d)
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    const peak = 0.16
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.linearRampToValueAtTime(peak, when + 0.012)
    gain.gain.exponentialRampToValueAtTime(peak * 0.45, when + Math.min(0.35, dur * 0.5))
    gain.gain.setTargetAtTime(0.0001, when + dur * 0.92, 0.06)
    const o1 = ctx.createOscillator()
    o1.type = 'triangle'
    o1.frequency.value = freq(e.midi)
    const o2 = ctx.createOscillator()
    o2.type = 'sine'
    o2.frequency.value = freq(e.midi) * 2
    const g2 = ctx.createGain()
    g2.gain.value = 0.35
    o2.connect(g2).connect(gain)
    o1.connect(gain)
    const end = when + dur + 0.4
    o1.start(when)
    o2.start(when)
    o1.stop(end)
    o2.stop(end)
    this.nodes.push({ osc: [o1, o2], gain, end })
  }
}

/* ------------------------------ 標準 MIDI 檔解析 ------------------------------ */

/** 解析 SMF（格式 0／1），回傳音符事件（秒）；打擊樂聲道（10）略過。 */
export function parseMidi(data: Uint8Array): NoteEv[] {
  let p = 0
  const u32 = () => ((data[p++] << 24) | (data[p++] << 16) | (data[p++] << 8) | data[p++]) >>> 0
  const u16 = () => (data[p++] << 8) | data[p++]
  const text4 = () => String.fromCharCode(data[p++], data[p++], data[p++], data[p++])
  if (text4() !== 'MThd') throw new Error('不是 MIDI 檔')
  u32()
  u16() // format
  const ntrk = u16()
  const division = u16()
  if (division & 0x8000) throw new Error('不支援 SMPTE 時間格式')
  const tempos: { tick: number; mpq: number }[] = [{ tick: 0, mpq: 500000 }]
  const raw: { tick: number; endTick: number; midi: number }[] = []
  for (let t = 0; t < ntrk; t++) {
    if (text4() !== 'MTrk') throw new Error('MIDI 軌道損壞')
    const len = u32()
    const end = p + len
    let tick = 0
    let running = 0
    const open = new Map<number, number>()
    while (p < end) {
      let delta = 0
      let b: number
      do {
        b = data[p++]
        delta = (delta << 7) | (b & 0x7f)
      } while (b & 0x80)
      tick += delta
      let status = data[p]
      if (status & 0x80) p++
      else status = running
      if (status === 0xff) {
        const type = data[p++]
        let l = 0
        do {
          b = data[p++]
          l = (l << 7) | (b & 0x7f)
        } while (b & 0x80)
        if (type === 0x51 && l === 3) tempos.push({ tick, mpq: (data[p] << 16) | (data[p + 1] << 8) | data[p + 2] })
        p += l
      } else if (status === 0xf0 || status === 0xf7) {
        let l = 0
        do {
          b = data[p++]
          l = (l << 7) | (b & 0x7f)
        } while (b & 0x80)
        p += l
      } else {
        running = status
        const kind = status & 0xf0
        const ch = status & 0x0f
        const d1 = data[p++]
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : data[p++]
        if (ch === 9) continue
        const k = ch * 128 + d1
        if (kind === 0x90 && d2 > 0) open.set(k, tick)
        else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
          const s = open.get(k)
          if (s !== undefined) {
            raw.push({ tick: s, endTick: tick, midi: d1 })
            open.delete(k)
          }
        }
      }
    }
    p = end
  }
  tempos.sort((a, b) => a.tick - b.tick)
  const toSec = (tick: number): number => {
    let sec = 0
    let last = 0
    let mpq = 500000
    for (const t of tempos) {
      if (t.tick > tick) break
      sec += ((t.tick - last) * mpq) / division / 1e6
      last = t.tick
      mpq = t.mpq
    }
    return sec + ((tick - last) * mpq) / division / 1e6
  }
  return raw.map((r) => {
    const t = toSec(r.tick)
    return { t, d: Math.max(0.05, toSec(r.endTick) - t), midi: r.midi }
  })
}

export const fmtTime = (s: number): string => {
  const x = Math.max(0, Math.round(s))
  return `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`
}
