import { useCallback, useEffect, useRef, useState } from 'react'

export type PomoPhase = 'work' | 'rest'

export interface PomoConfig {
  workMin: number
  restMin: number
  /** 每完成幾輪專注後，休息改為長休息（0 = 不用長休息） */
  longEvery: number
  longMin: number
  /** 階段結束後自動開始下一階段 */
  auto: boolean
  /** 每一輪的目標新增字數（0 = 不設） */
  goalWords: number
  muted: boolean
}

export interface PomoSummary {
  /** 這一輪的字數變化（可為負） */
  delta: number
  goal: number
}

export interface PomoState extends PomoConfig {
  phase: PomoPhase
  long: boolean
  running: boolean
  /** 剩餘毫秒 */
  left: number
  total: number
  /** 今天完成的專注輪數 */
  rounds: number
  /** 專注剛結束、等你決定「進入休息」或「延展 5 分鐘」 */
  pending: boolean
  /** 這一輪開始時的字數 */
  startWords: number
  summary: PomoSummary | null
}

export const PRESETS: { label: string; work: number; rest: number }[] = [
  { label: '25 / 5', work: 25, rest: 5 },
  { label: '50 / 10', work: 50, rest: 10 }
]

const KEY = 'inkwell.pomo.v2'
const DEFAULT_CFG: PomoConfig = { workMin: 25, restMin: 5, longEvery: 4, longMin: 15, auto: false, goalWords: 0, muted: false }

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n) || lo))

function loadCfg(): PomoConfig {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      workMin: clamp(j.workMin ?? DEFAULT_CFG.workMin, 1, 180),
      restMin: clamp(j.restMin ?? DEFAULT_CFG.restMin, 1, 60),
      longEvery: clamp(j.longEvery ?? DEFAULT_CFG.longEvery, 0, 12),
      longMin: clamp(j.longMin ?? DEFAULT_CFG.longMin, 1, 90),
      auto: !!j.auto,
      goalWords: clamp(j.goalWords ?? 0, 0, 100000),
      muted: !!j.muted
    }
  } catch {
    return DEFAULT_CFG
  }
}

const saveCfg = (c: PomoConfig) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* ignore */
  }
}

export const phaseMs = (s: Pick<PomoConfig, 'workMin' | 'restMin' | 'longMin'>, phase: PomoPhase, long: boolean) =>
  (phase === 'work' ? s.workMin : long ? s.longMin : s.restMin) * 60_000

/** 柔和的提示音：兩個低音正弦、慢起慢落，不刺耳。 */
let actx: AudioContext | null = null
export function softBell(): void {
  try {
    actx ??= new AudioContext()
    void actx.resume()
    const t = actx.currentTime
    ;[523.25, 659.25].forEach((f, i) => {
      const o = actx!.createOscillator()
      const g = actx!.createGain()
      o.type = 'sine'
      o.frequency.value = f
      const at = t + i * 0.28
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(0.05, at + 0.12)
      g.gain.exponentialRampToValueAtTime(0.0001, at + 1.8)
      o.connect(g).connect(actx!.destination)
      o.start(at)
      o.stop(at + 2)
    })
  } catch {
    /* 沒有音訊裝置 */
  }
}

function notify(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined') return
    const send = () => new Notification(title, { body, silent: true })
    if (Notification.permission === 'granted') send()
    else if (Notification.permission !== 'denied') void Notification.requestPermission().then((p) => p === 'granted' && send())
  } catch {
    /* 通知不可用就算了 */
  }
}

/**
 * 番茄鐘：以「結束時間戳」計時，視窗被節流或電腦睡眠後也不會漂移。
 * 這個 hook 只在使用它的元件內更新狀態，不會讓整個 App 每秒重繪。
 */
export function usePomodoro(getWords: () => number) {
  const [st, setSt] = useState<PomoState>(() => {
    const c = loadCfg()
    const ms = c.workMin * 60_000
    return { ...c, phase: 'work', long: false, running: false, left: ms, total: ms, rounds: 0, pending: false, startWords: 0, summary: null }
  })
  const ref = useRef(st)
  ref.current = st
  const endAt = useRef(0)
  const wordsRef = useRef(getWords)
  wordsRef.current = getWords

  const finish = useCallback(() => {
    const s = ref.current
    const muted = s.muted
    if (s.phase === 'work') {
      const rounds = s.rounds + 1
      const long = s.longEvery > 0 && rounds % s.longEvery === 0
      const summary: PomoSummary = { delta: wordsRef.current() - s.startWords, goal: s.goalWords }
      if (!muted) softBell()
      const hit = summary.goal > 0 ? (summary.delta >= summary.goal ? '，達標了！' : `，離目標還差 ${summary.goal - summary.delta} 字`) : ''
      notify('專注結束', `這一輪${summary.delta >= 0 ? '新增' : '減少'}了 ${Math.abs(summary.delta)} 字${hit}`)
      if (s.auto) {
        const ms = phaseMs(s, 'rest', long)
        endAt.current = Date.now() + ms
        setSt({ ...s, phase: 'rest', long, running: true, left: ms, total: ms, rounds, pending: false, summary })
      } else {
        setSt({ ...s, phase: 'work', long, running: false, left: 0, total: s.total, rounds, pending: true, summary })
      }
    } else {
      if (!muted) softBell()
      notify('休息結束', '準備好繼續書寫了嗎？')
      const ms = phaseMs(s, 'work', false)
      const startWords = wordsRef.current()
      if (s.auto) endAt.current = Date.now() + ms
      setSt({ ...s, phase: 'work', long: false, running: s.auto, left: ms, total: ms, pending: false, startWords, summary: null })
    }
  }, [])

  useEffect(() => {
    if (!st.running) return
    const id = window.setInterval(() => {
      const left = endAt.current - Date.now()
      if (left > 0) setSt((s) => ({ ...s, left }))
      else {
        window.clearInterval(id)
        finish()
      }
    }, 250)
    return () => window.clearInterval(id)
  }, [st.running, st.phase, finish])

  const toggle = useCallback(() => {
    const s = ref.current
    if (s.pending) return
    if (!s.running) {
      endAt.current = Date.now() + s.left
      // 一輪專注從頭開始時，記下起始字數
      const fresh = s.phase === 'work' && s.left === s.total
      setSt({ ...s, running: true, startWords: fresh ? wordsRef.current() : s.startWords, summary: fresh ? null : s.summary })
    } else setSt({ ...s, running: false })
  }, [])

  const reset = useCallback(() => {
    const s = ref.current
    const ms = phaseMs(s, s.phase, s.long)
    setSt({ ...s, running: false, pending: false, left: ms, total: ms })
  }, [])

  /** 專注剛結束時：進入休息 */
  const enterRest = useCallback(() => {
    const s = ref.current
    const ms = phaseMs(s, 'rest', s.long)
    endAt.current = Date.now() + ms
    setSt({ ...s, phase: 'rest', running: true, pending: false, left: ms, total: ms })
  }, [])

  /** 專注剛結束時：再延展幾分鐘（這一輪不算完成，等延展結束再計） */
  const extend = useCallback((min = 5) => {
    const s = ref.current
    const ms = min * 60_000
    endAt.current = Date.now() + ms
    setSt({ ...s, phase: 'work', running: true, pending: false, left: ms, total: ms, rounds: Math.max(0, s.rounds - 1), summary: null })
  }, [])

  /** 跳到下一階段（不計入完成輪數） */
  const skip = useCallback(() => {
    const s = ref.current
    const phase: PomoPhase = s.phase === 'work' ? 'rest' : 'work'
    const ms = phaseMs(s, phase, false)
    setSt({ ...s, phase, long: false, running: false, pending: false, left: ms, total: ms, startWords: wordsRef.current() })
  }, [])

  const setConfig = useCallback((patch: Partial<PomoConfig>) => {
    const s = ref.current
    const next: PomoState = {
      ...s,
      ...patch,
      workMin: clamp(patch.workMin ?? s.workMin, 1, 180),
      restMin: clamp(patch.restMin ?? s.restMin, 1, 60),
      longEvery: clamp(patch.longEvery ?? s.longEvery, 0, 12),
      longMin: clamp(patch.longMin ?? s.longMin, 1, 90),
      goalWords: clamp(patch.goalWords ?? s.goalWords, 0, 100000)
    }
    const { workMin, restMin, longEvery, longMin, auto, goalWords, muted } = next
    saveCfg({ workMin, restMin, longEvery, longMin, auto, goalWords, muted })
    // 時長改變就重設目前階段；其他設定不打斷計時
    const durationChanged = ['workMin', 'restMin', 'longMin'].some((k) => k in patch)
    if (!durationChanged) return setSt(next)
    const ms = phaseMs(next, next.phase, next.long)
    setSt({ ...next, running: false, pending: false, left: ms, total: ms })
  }, [])

  return { st, toggle, reset, skip, enterRest, extend, setConfig }
}

export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const mm = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h ? `${h}:${mm}` : mm
}
