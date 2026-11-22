import { useCallback, useEffect, useRef, useState } from 'react'
import { chime } from './ambient'

export type PomoPhase = 'work' | 'rest'

export interface PomoState {
  phase: PomoPhase
  running: boolean
  /** 剩餘毫秒 */
  left: number
  total: number
  workMin: number
  restMin: number
  /** 今天完成的專注輪數 */
  rounds: number
}

/** 番茄鐘：以結束時間戳計時，視窗被節流也不會漂移。 */
export function usePomodoro(onDone: (phase: PomoPhase) => void) {
  const [st, setSt] = useState<PomoState>({
    phase: 'work', running: false, left: 25 * 60_000, total: 25 * 60_000, workMin: 25, restMin: 5, rounds: 0
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
        const nextPhase: PomoPhase = s.phase === 'work' ? 'rest' : 'work'
        const ms = (nextPhase === 'work' ? s.workMin : s.restMin) * 60_000
        doneRef.current(s.phase)
        // 一個階段結束後暫停，等使用者開始下一階段
        return { ...s, phase: nextPhase, running: false, left: ms, total: ms, rounds: s.phase === 'work' ? s.rounds + 1 : s.rounds }
      })
    }, 250)
    return () => window.clearInterval(id)
  }, [st.running])

  const toggle = useCallback(() => {
    setSt((s) => {
      if (!s.running) endAt.current = Date.now() + s.left
      return { ...s, running: !s.running }
    })
  }, [])
  const reset = useCallback(() => {
    setSt((s) => {
      const ms = (s.phase === 'work' ? s.workMin : s.restMin) * 60_000
      return { ...s, running: false, left: ms, total: ms }
    })
  }, [])
  const setLengths = useCallback((workMin: number, restMin: number) => {
    setSt((s) => {
      const ms = (s.phase === 'work' ? workMin : restMin) * 60_000
      return { ...s, workMin, restMin, running: false, left: ms, total: ms }
    })
  }, [])
  return { st, toggle, reset, setLengths }
}

export const fmtClock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
