/** 以 WebAudio 即時合成的環境音，不需要任何音訊檔。 */
export type AmbientKind = 'rain' | 'brown' | 'cafe' | 'off'

let ctx: AudioContext | null = null
let src: AudioBufferSourceNode | null = null
let gain: GainNode | null = null

function noiseBuffer(c: AudioContext, kind: 'white' | 'brown'): AudioBuffer {
  const len = c.sampleRate * 4
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') d[i] = w * 0.5
      else {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    }
  }
  return buf
}

export function setAmbient(kind: AmbientKind, volume: number): void {
  if (src) {
    try {
      src.stop()
    } catch {
      /* ignore */
    }
    src.disconnect()
    src = null
  }
  if (kind === 'off') return
  ctx ??= new AudioContext()
  void ctx.resume()
  gain ??= ctx.createGain()
  gain.gain.value = volume
  gain.connect(ctx.destination)
  const s = ctx.createBufferSource()
  s.loop = true
  const filter = ctx.createBiquadFilter()
  if (kind === 'rain') {
    s.buffer = noiseBuffer(ctx, 'white')
    filter.type = 'bandpass'
    filter.frequency.value = 3200
    filter.Q.value = 0.5
  } else if (kind === 'brown') {
    s.buffer = noiseBuffer(ctx, 'brown')
    filter.type = 'lowpass'
    filter.frequency.value = 900
  } else {
    // 咖啡館：低頻人聲底噪
    s.buffer = noiseBuffer(ctx, 'brown')
    filter.type = 'bandpass'
    filter.frequency.value = 500
    filter.Q.value = 0.8
  }
  s.connect(filter).connect(gain)
  s.start()
  src = s
}

export function setAmbientVolume(v: number): void {
  if (gain) gain.gain.value = v
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
