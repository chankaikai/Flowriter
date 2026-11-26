/** 語音便籤：音檔放在 .inkwell/media/，索引放在 .inkwell/voice.json，兩者都不進 .md。 */
export interface VoiceNote {
  id: string
  /** 錨定的段落開頭（純文字前 80 字）；段落被改掉時便籤會掛到文末並標為失聯 */
  quote: string
  /** 秒數 */
  dur: number
  /** 波形峰值，0–1，固定 PEAK_COUNT 個 */
  peaks: number[]
  ts: number
}
export interface VoiceFile {
  version: 1
  files: Record<string, VoiceNote[]>
}

export const PEAK_COUNT = 40
export const MAX_SECONDS = 120
export const MAX_BYTES = 20_000_000
export const emptyVoice = (): VoiceFile => ({ version: 1, files: {} })
export const isVoiceId = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{6,32}$/.test(s)
export const voiceId = (): string => Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

export function parseVoice(raw: string): VoiceFile {
  if (!raw.trim()) return emptyVoice()
  try {
    const j = JSON.parse(raw) as Partial<VoiceFile>
    const files: Record<string, VoiceNote[]> = {}
    for (const [k, v] of Object.entries(j.files ?? {})) {
      if (!Array.isArray(v)) continue
      files[k] = v
        .filter((n) => n && isVoiceId(n.id))
        .map((n) => ({
          id: n.id,
          quote: String(n.quote ?? '').slice(0, 80),
          dur: Math.max(0, Math.min(MAX_SECONDS, Number(n.dur) || 0)),
          peaks: normPeaks(Array.isArray(n.peaks) ? n.peaks : []),
          ts: Number(n.ts) || 0
        }))
    }
    return { version: 1, files }
  } catch {
    return emptyVoice()
  }
}
export const serializeVoice = (f: VoiceFile): string => JSON.stringify(f)

export function addVoice(f: VoiceFile, file: string, n: VoiceNote): VoiceFile {
  return { ...f, files: { ...f.files, [file]: [...(f.files[file] ?? []), n] } }
}
export function removeVoice(f: VoiceFile, file: string, id: string): VoiceFile {
  const rest = (f.files[file] ?? []).filter((n) => n.id !== id)
  const files = { ...f.files }
  if (rest.length) files[file] = rest
  else delete files[file]
  return { ...f, files }
}

/** 補齊／截斷成固定長度並夾在 0–1。 */
export function normPeaks(p: unknown[]): number[] {
  const out = p.slice(0, PEAK_COUNT).map((x) => Math.max(0, Math.min(1, Number(x) || 0)))
  while (out.length < PEAK_COUNT) out.push(0.05)
  return out
}

/** 把一串取樣值切成 PEAK_COUNT 段，各取最大絕對值，再以最大峰值正規化。 */
export function computePeaks(samples: ArrayLike<number>, count = PEAK_COUNT): number[] {
  const n = samples.length
  if (!n) return new Array(count).fill(0.05)
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const a = Math.floor((i * n) / count)
    const b = Math.max(a + 1, Math.floor(((i + 1) * n) / count))
    let m = 0
    for (let j = a; j < b && j < n; j++) m = Math.max(m, Math.abs(samples[j]))
    out.push(m)
  }
  const top = Math.max(...out)
  return out.map((v) => (top > 0 ? Math.max(0.05, v / top) : 0.05))
}

const plain = (t: string) => t.replace(/\s+/g, ' ').trim()
export const anchorOf = (blockText: string): string => plain(blockText).slice(0, 80)

/** 為每則便籤找出所在的區塊索引；找不到回 -1（失聯）。同一段只比對開頭。 */
export function anchorIndex(blocks: string[], quote: string): number {
  const q = plain(quote)
  if (!q) return -1
  return blocks.findIndex((b) => plain(b).startsWith(q))
}

export const fmtDur = (s: number): string => {
  const t = Math.max(0, Math.round(s))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
