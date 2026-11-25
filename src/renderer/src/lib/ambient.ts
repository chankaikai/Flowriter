/** 以 WebAudio 即時合成的環境音，不需要任何音訊檔。 */
export type AmbientKind =
  | 'off' | 'white' | 'pink' | 'brown' | 'rain' | 'ocean' | 'wind' | 'fire' | 'cafe' | 'fan' | 'night' | 'forest' | 'stream'

export const AMBIENT_LIST: { k: AmbientKind; label: string }[] = [
  { k: 'off', label: '靜音' },
  { k: 'white', label: '白噪音' },
  { k: 'pink', label: '粉紅噪音' },
  { k: 'brown', label: '棕色噪音' },
  { k: 'rain', label: '雨聲' },
  { k: 'ocean', label: '海浪' },
  { k: 'wind', label: '風聲' },
  { k: 'fire', label: '篝火' },
  { k: 'cafe', label: '咖啡館' },
  { k: 'fan', label: '風扇' },
  { k: 'night', label: '夏夜蟲鳴' },
  { k: 'forest', label: '森林鳥鳴' },
  { k: 'stream', label: '溪流' }
]

/** 這幾種只有真實錄音才有意思，沒有錄音檔時不提供合成版本（合成的很刺耳）。 */
export const RECORDING_ONLY: AmbientKind[] = ['forest', 'stream']

let ctx: AudioContext | null = null
let master: GainNode | null = null
let stopCurrent: (() => void) | null = null
const buffers: Partial<Record<'white' | 'pink' | 'brown', AudioBuffer>> = {}

function noise(c: AudioContext, kind: 'white' | 'pink' | 'brown'): AudioBuffer {
  const cached = buffers[kind]
  if (cached) return cached
  const len = c.sampleRate * 6
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let last = 0
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') d[i] = w * 0.5
      else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      } else {
        // Paul Kellet 的粉紅噪音近似
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    }
  }
  buffers[kind] = buf
  return buf
}

type Cleanup = () => void

/** 組出某種聲音的節點圖，回傳清理函式。 */
function build(c: AudioContext, kind: Exclude<AmbientKind, 'off' | 'forest' | 'stream'>, out: AudioNode): Cleanup {
  const nodes: AudioNode[] = []
  const timers: number[] = []
  const srcs: (AudioScheduledSourceNode)[] = []
  const loop = (k: 'white' | 'pink' | 'brown') => {
    const s = c.createBufferSource()
    s.buffer = noise(c, k)
    s.loop = true
    srcs.push(s)
    return s
  }
  const filt = (type: BiquadFilterType, f: number, q = 0.7) => {
    const n = c.createBiquadFilter()
    n.type = type
    n.frequency.value = f
    n.Q.value = q
    nodes.push(n)
    return n
  }
  const gainNode = (v: number) => {
    const n = c.createGain()
    n.gain.value = v
    nodes.push(n)
    return n
  }
  const lfo = (hz: number, depth: number, target: AudioParam) => {
    const o = c.createOscillator()
    o.frequency.value = hz
    const g = gainNode(depth)
    o.connect(g).connect(target)
    srcs.push(o)
  }

  switch (kind) {
    case 'white':
      loop('white').connect(out)
      break
    case 'pink':
      loop('pink').connect(out)
      break
    case 'brown':
      loop('brown').connect(filt('lowpass', 1200)).connect(out)
      break
    case 'rain': {
      loop('white').connect(filt('bandpass', 3400, 0.5)).connect(out)
      // 低頻的落雨底噪
      loop('pink').connect(filt('lowpass', 700)).connect(gainNode(0.5)).connect(out)
      break
    }
    case 'ocean': {
      const g = gainNode(0.5)
      loop('brown').connect(filt('lowpass', 800)).connect(g).connect(out)
      lfo(0.11, 0.38, g.gain) // 約 9 秒一次的潮起潮落
      break
    }
    case 'wind': {
      const f = filt('bandpass', 600, 1.2)
      loop('pink').connect(f).connect(out)
      lfo(0.07, 380, f.frequency)
      break
    }
    case 'fire': {
      loop('brown').connect(filt('lowpass', 500)).connect(gainNode(0.55)).connect(out)
      // 隨機的劈啪聲
      const crackle = () => {
        const dur = 0.015 + Math.random() * 0.05
        const s = c.createBufferSource()
        s.buffer = noise(c, 'white')
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, c.currentTime)
        g.gain.exponentialRampToValueAtTime(0.5 + Math.random() * 0.8, c.currentTime + 0.003)
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
        const f = c.createBiquadFilter()
        f.type = 'highpass'
        f.frequency.value = 1500 + Math.random() * 3000
        s.connect(f).connect(g).connect(out)
        s.start(c.currentTime, Math.random() * 4, dur + 0.02)
        timers.push(window.setTimeout(crackle, 40 + Math.random() * 380))
      }
      crackle()
      break
    }
    case 'cafe': {
      const f = filt('bandpass', 450, 0.9)
      loop('brown').connect(f).connect(gainNode(1.4)).connect(out)
      lfo(0.17, 120, f.frequency) // 人聲起伏
      loop('pink').connect(filt('bandpass', 1800, 1.5)).connect(gainNode(0.12)).connect(out)
      break
    }
    case 'fan': {
      loop('brown').connect(filt('lowpass', 420)).connect(gainNode(0.9)).connect(out)
      const hum = c.createOscillator()
      hum.type = 'sine'
      hum.frequency.value = 118
      hum.connect(gainNode(0.035)).connect(out)
      srcs.push(hum)
      break
    }
    case 'night': {
      loop('pink').connect(filt('lowpass', 500)).connect(gainNode(0.25)).connect(out)
      // 兩組蟲鳴：高頻正弦被慢速方波調幅
      ;[4300, 5200].forEach((hz, i) => {
        const o = c.createOscillator()
        o.frequency.value = hz
        const am = gainNode(0)
        o.connect(am).connect(out)
        lfo(i ? 7.3 : 5.1, 0.02, am.gain)
        srcs.push(o)
      })
      break
    }
  }
  srcs.forEach((s) => s.start())
  return () => {
    timers.forEach((t) => window.clearTimeout(t))
    srcs.forEach((s) => {
      try {
        s.stop()
      } catch {
        /* 已停止 */
      }
      s.disconnect()
    })
    nodes.forEach((n) => n.disconnect())
  }
}

/** 有錄音檔的種類（kind → 來源）；由 refreshAmbientFiles 更新。 */
export let ambientFiles: Record<string, 'user' | 'bundled'> = {}
export async function refreshAmbientFiles(): Promise<Record<string, 'user' | 'bundled'>> {
  try {
    ambientFiles = await window.api.ambientList()
  } catch {
    ambientFiles = {}
  }
  return ambientFiles
}

let token = 0
/** 真實錄音：解碼後無縫循環播放，1.5 秒淡入。 */
async function playFile(c: AudioContext, kind: string, out: AudioNode, my: number): Promise<Cleanup | null> {
  const bytes = await window.api.ambientRead(kind)
  if (!bytes || my !== token) return null
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const buf = await c.decodeAudioData(copy)
  if (my !== token) return null
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  const g = c.createGain()
  g.gain.setValueAtTime(0, c.currentTime)
  g.gain.linearRampToValueAtTime(1, c.currentTime + 1.5)
  src.connect(g).connect(out)
  src.start()
  return () => {
    try {
      src.stop()
    } catch {
      /* 已停止 */
    }
    src.disconnect()
    g.disconnect()
  }
}

/** 回傳目前播放的是錄音（true）、合成（false）或沒有聲音（null：只有錄音才有的種類但沒檔案）。 */
export async function setAmbient(kind: AmbientKind, volume: number): Promise<boolean | null> {
  const my = ++token
  stopCurrent?.()
  stopCurrent = null
  if (kind === 'off') return false
  ctx ??= new AudioContext()
  void ctx.resume()
  if (!master) {
    master = ctx.createGain()
    master.connect(ctx.destination)
  }
  master.gain.value = volume
  if (!(kind in ambientFiles)) await refreshAmbientFiles()
  if (kind in ambientFiles) {
    try {
      const stop = await playFile(ctx, kind, master, my)
      if (my !== token) {
        stop?.()
        return false
      }
      if (stop) {
        stopCurrent = stop
        return true
      }
    } catch {
      /* 解碼失敗就退回合成 */
    }
  }
  if (my !== token) return false
  if (RECORDING_ONLY.includes(kind)) return null
  stopCurrent = build(ctx, kind as Exclude<AmbientKind, 'off' | 'forest' | 'stream'>, master)
  return false
}

export function setAmbientVolume(v: number): void {
  if (master) master.gain.value = v
}

/** 計時結束的柔和提示音。 */
export function chime(): void {
  ctx ??= new AudioContext()
  void ctx.resume()
  const t = ctx.currentTime
  ;[660, 880, 1100].forEach((f, i) => {
    const o = ctx!.createOscillator()
    const g = ctx!.createGain()
    o.frequency.value = f
    g.gain.setValueAtTime(0, t + i * 0.18)
    g.gain.linearRampToValueAtTime(0.12, t + i * 0.18 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.9)
    o.connect(g).connect(ctx!.destination)
    o.start(t + i * 0.18)
    o.stop(t + i * 0.18 + 1)
  })
}
