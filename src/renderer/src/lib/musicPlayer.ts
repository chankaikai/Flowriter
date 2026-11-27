/**
 * 音樂庫播放器（單例）：一個 <audio> → 分析器（底欄頻譜）→ 音量 → 輸出。
 * 播放清單、模式、睡眠計時都在這裡；介面只訂閱狀態。
 */
import type { MusicTrack } from '../../../shared/types'

export type PlayMode = 'order' | 'loop' | 'one' | 'shuffle'
export const MODES: { k: PlayMode; label: string; glyph: string }[] = [
  { k: 'order', label: '順序播放', glyph: '→' },
  { k: 'loop', label: '列表循環', glyph: '🔁' },
  { k: 'one', label: '單曲循環', glyph: '🔂' },
  { k: 'shuffle', label: '隨機播放', glyph: '🔀' }
]

/** 下一首的索引；null＝播完了（順序模式的最後一首）。純函式，方便測試。 */
export function nextIndex(len: number, cur: number, mode: PlayMode, dir: 1 | -1 = 1, rnd: () => number = Math.random): number | null {
  if (len <= 0) return null
  if (mode === 'one') return cur
  if (mode === 'shuffle') {
    if (len === 1) return 0
    let n = Math.floor(rnd() * (len - 1))
    if (n >= cur) n++ // 不重複剛播的那首
    return n
  }
  const n = cur + dir
  if (n >= 0 && n < len) return n
  return mode === 'loop' ? (n < 0 ? len - 1 : 0) : null
}

export interface MusicSnap {
  playing: boolean
  loading: boolean
  track: MusicTrack | null
  queueLen: number
  pos: number
  dur: number
  mode: PlayMode
  volume: number
  /** 睡眠計時剩餘秒數；0＝沒設定 */
  sleepLeft: number
  error: string
}

const VOL_KEY = 'inkwell.music.vol.v1'
const MODE_KEY = 'inkwell.music.mode.v1'

let audio: HTMLAudioElement | null = null
let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let gain: GainNode | null = null
let queue: MusicTrack[] = []
let cur = -1
let objUrl = ''
let loadSeq = 0
let sleepAt = 0
let sleepTimer = 0
const subs = new Set<() => void>()

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v === null ? d : (JSON.parse(v) as T)
  } catch {
    return d
  }
}
let mode: PlayMode = load<PlayMode>(MODE_KEY, 'loop')
let volume = load<number>(VOL_KEY, 0.6)
let loading = false
let error = ''

function emit(): void {
  subs.forEach((f) => f())
}

function ensure(): HTMLAudioElement {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  ctx = new AudioContext()
  const src = ctx.createMediaElementSource(audio)
  analyser = ctx.createAnalyser()
  analyser.fftSize = 128
  analyser.smoothingTimeConstant = 0.78
  gain = ctx.createGain()
  gain.gain.value = volume
  src.connect(analyser).connect(gain).connect(ctx.destination)
  audio.addEventListener('ended', () => void step(1, true))
  audio.addEventListener('timeupdate', emit)
  audio.addEventListener('play', emit)
  audio.addEventListener('pause', emit)
  audio.addEventListener('loadedmetadata', emit)
  return audio
}

async function loadAndPlay(i: number): Promise<void> {
  const t = queue[i]
  if (!t) return
  const a = ensure()
  const my = ++loadSeq
  cur = i
  loading = true
  error = ''
  emit()
  try {
    await ctx!.resume()
    const bytes = await window.api.musicRead(t.id)
    if (my !== loadSeq) return
    if (!bytes) throw new Error('找不到這個音訊檔（可能被移動或刪除，請到音樂庫按「掃描」）')
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    if (objUrl) URL.revokeObjectURL(objUrl)
    objUrl = URL.createObjectURL(new Blob([copy]))
    a.src = objUrl
    await a.play()
    error = ''
  } catch (e) {
    if (my !== loadSeq) return
    error = String((e as Error)?.message ?? e).slice(0, 140)
    a.pause()
  } finally {
    if (my === loadSeq) {
      loading = false
      emit()
    }
  }
}

/** auto＝自然播完觸發（順序模式的最後一首要停下來；手動按下一首則不會） */
async function step(dir: 1 | -1, auto = false): Promise<void> {
  const n = nextIndex(queue.length, cur, auto ? mode : mode === 'one' ? 'loop' : mode, dir)
  if (n === null) {
    audio?.pause()
    if (audio) audio.currentTime = 0
    emit()
    return
  }
  // 連續幾首都壞掉不能無限循環：最多往後試一輪
  await loadAndPlay(n)
  if (error && queue.length > 1 && auto) {
    const tried = new Set<number>([n])
    let k = n
    while (error && tried.size < queue.length) {
      const nn = nextIndex(queue.length, k, mode === 'shuffle' ? 'loop' : mode, 1)
      if (nn === null || tried.has(nn)) break
      tried.add(nn)
      k = nn
      await loadAndPlay(k)
    }
  }
}

export const music = {
  subscribe(f: () => void): () => void {
    subs.add(f)
    return () => subs.delete(f)
  },
  snap(): MusicSnap {
    return {
      playing: !!audio && !audio.paused && !audio.ended,
      loading,
      track: queue[cur] ?? null,
      queueLen: queue.length,
      pos: audio?.currentTime ?? 0,
      dur: Number.isFinite(audio?.duration) ? (audio?.duration ?? 0) : 0,
      mode,
      volume,
      sleepLeft: sleepAt ? Math.max(0, Math.ceil((sleepAt - Date.now()) / 1000)) : 0,
      error
    }
  },
  /** 以這份清單開始播放（從 start 起） */
  async playList(tracks: MusicTrack[], start = 0): Promise<void> {
    queue = tracks.filter((t) => !t.missing)
    if (!queue.length) return
    await loadAndPlay(Math.min(Math.max(0, start), queue.length - 1))
  },
  async toggle(): Promise<void> {
    if (!audio || !audio.src) return
    if (audio.paused) {
      await ctx?.resume()
      await audio.play().catch(() => undefined)
    } else audio.pause()
  },
  next: () => step(1),
  prev: async () => {
    if (audio && audio.currentTime > 3) audio.currentTime = 0
    else await step(-1)
  },
  stop(): void {
    loadSeq++
    audio?.pause()
    if (audio) audio.currentTime = 0
    loading = false
    emit()
  },
  seek(frac: number): void {
    if (audio && Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, Math.min(1, frac)) * audio.duration
  },
  setVolume(v: number): void {
    volume = Math.max(0, Math.min(1, v))
    if (gain) gain.gain.value = volume
    try {
      localStorage.setItem(VOL_KEY, JSON.stringify(volume))
    } catch {
      /* ignore */
    }
    emit()
  },
  setMode(m: PlayMode): void {
    mode = m
    try {
      localStorage.setItem(MODE_KEY, JSON.stringify(m))
    } catch {
      /* ignore */
    }
    emit()
  },
  /** 睡眠計時：minutes 分鐘後淡出並停止；0＝取消 */
  setSleep(minutes: number): void {
    window.clearInterval(sleepTimer)
    sleepAt = minutes > 0 ? Date.now() + minutes * 60_000 : 0
    if (sleepAt) {
      sleepTimer = window.setInterval(() => {
        const left = sleepAt - Date.now()
        if (left <= 0) {
          window.clearInterval(sleepTimer)
          sleepAt = 0
          if (gain && ctx) {
            gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6)
            window.setTimeout(() => {
              music.stop()
              if (gain) gain.gain.value = volume
            }, 2500)
          } else music.stop()
        }
        emit()
      }, 1000)
    }
    emit()
  },
  /** 頻譜資料（0–255，已取低頻到中頻的前 n 條）；沒在播放時回傳 null */
  spectrum(n: number): Uint8Array | null {
    if (!analyser || !audio || audio.paused) return null
    const buf = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(buf)
    return buf.subarray(0, Math.min(n, buf.length))
  }
}
