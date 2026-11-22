import { useCallback, useEffect, useRef, useState } from 'react'
import { chime } from './ambient'

export type PomoPhase = 'work' | 'rest'

export interface PomoConfig {
  workMin: number
  restMin: number
  /** 每完成幾輪專注後，休息改為長休息 */
  longEvery: number
  longMin: number
  /** 階段結束後自動開始下一階段 */
  auto: boolean
}

export interface PomoState extends PomoConfig {
  phase: PomoPhase
  /** 目前的休息是不是長休息 */
  long: boolean
  running: boolean
  /** 剩餘毫秒 */
  left: number
  total: number
  /** 今天完成的專注輪數 */
  rounds: number
}

export const PRESETS: { label: string; work: number; rest: number }[] = [
  { label: '15 / 3', work: 15, rest: 3 },
  { label: '25 / 5', work: 25, rest: 5 },
  { label: '30 / 5', work: 30, rest: 5 },
  { label: '45 / 10', work: 45, rest: 10 },
  { label: '50 / 10', work: 50, rest: 10 },
  { label: '60 / 10', work: 60, rest: 10 },
  { label: '90 / 15', work: 90, rest: 15 }
]

const KEY = 'inkwell.pomo.v1'
const DEFAULT_CFG: PomoConfig = { workMin: 25, restMin: 5, longEvery: 4, longMin: 15, auto: false }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n) || lo))

function loadCfg(): PomoConfig {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '{}')
    return {
      workMin: clamp(j.workMin ?? DEFAULT_CFG.workMin, 1, 180),
      restMin: clamp(j.restMin ?? DEFAULT_CFG.restMin, 1, 60),
      longEvery: clamp(j.longEvery ?? DEFAULT_CFG.longEvery, 0, 12),
      longMin: clamp(j.longMin ?? DEFAULT_CFG.longMin, 1, 90),
      auto: !!j.auto
    }
  } catch {
    return DEFAULT_CFG
  }
}

/** 番茄鐘：以結束時間戳計時，視窗被節流也不會漂移。設定會記住。 */
export function usePomodoro(onDone: (phase: PomoPhase, nextLong: boolean) => void) {
  const [st, setSt] = useState<PomoState>(() => {
    const c = loadCfg()
    const ms = c.workMin * 60_000
    return { ...c, phase: 'work', long: false, running: false, left: ms, total: ms, rounds: 0 }
  })
  const endAt = useRef(0)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (!st.running) return
    const id = window.setInterval(() => {
      const left = endAt.current - Date.now()
      if (left > 0) {
        setSt((s) => ({ ...s, left }))
        return
      }
      chime()
      setSt((s) => {
        const finishedWork = s.phase === 'work'
        const rounds = finishedWork ? s.rounds + 1 : s.rounds
        const nextPhase: PomoPhase = finishedWork ? 'rest' : 'work'
        const long = finishedWork && s.longEvery > 0 && rounds % s.longEvery === 0
        const ms = (nextPhase === 'work' ? s.workMin : long ? s.longMin : s.restMin) * 60_000
        doneRef.current(s.phase, long)
        if (s.auto) endAt.current = Date.now() + ms
        return { ...s, phase: nextPhase, long, running: s.auto, left: ms, total: ms, rounds }
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [st.running])

  const phaseMs = (s: PomoState, phase = s.phase, long = s.long) =>
    (phase === 'work' ? s.workMin : long ? s.longMin : s.restMin) * 60_000

  const toggle = useCallback(() => {
    setSt((s) => {
      if (!s.running) endAt.current = Date.now() + s.left
      return { ...s, running: !s.running }
    })
  }, [])
  const reset = useCallback(() => {
    setSt((s) => ({ ...s, running: false, left: phaseMs(s), total: phaseMs(s) }))
  }, [])
  /** 跳到下一階段（不計入完成輪數） */
  const skip = useCallback(() => {
    setSt((s) => {
      const phase: PomoPhase = s.phase === 'work' ? 'rest' : 'work'
      const ms = phaseMs(s, phase, false)
      return { ...s, phase, long: false, running: false, left: ms, total: ms }
    })
  }, [])
  const setConfig = useCallback((patch: Partial<PomoConfig>) => {
    setSt((s) => {
      const next: PomoState = {
        ...s,
        ...patch,
        workMin: clamp(patch.workMin ?? s.workMin, 1, 180),
        restMin: clamp(patch.restMin ?? s.restMin, 1, 60),
        longEvery: clamp(patch.longEvery ?? s.longEvery, 0, 12),
        longMin: clamp(patch.longMin ?? s.longMin, 1, 90)
      }
      try {
        const { workMin, restMin, longEvery, longMin, auto } = next
        localStorage.setItem(KEY, JSON.stringify({ workMin, restMin, longEvery, longMin, auto }))
      } catch {
        /* ignore */
      }
      // 時長改變就重設目前階段；只切換自動開始則不打斷計時
      const durationChanged = ['workMin', 'restMin', 'longMin'].some((k) => k in patch)
      if (!durationChanged) return next
      const ms = phaseMs(next)
      return { ...next, running: false, left: ms, total: ms }
    })
  }, [])
  return { st, toggle, reset, skip, setConfig }
}

export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  const mm = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return h ? `${h}:${mm}` : mm
}
