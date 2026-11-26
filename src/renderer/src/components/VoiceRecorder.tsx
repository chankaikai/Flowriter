import { useEffect, useRef, useState } from 'react'
import { MAX_BYTES, MAX_SECONDS, computePeaks, fmtDur, voiceId, type VoiceNote } from '@/lib/voice'
import { tr } from '@/lib/i18n'

export interface VoiceResult {
  note: Omit<VoiceNote, 'quote'>
  data: ArrayBuffer
}

/** 錄音條：掛載即開始錄；按「完成」或滿 2 分鐘結束，按「取消」不留任何東西。 */
export function VoiceRecorder({ onDone, onCancel, onError }: { onDone: (r: VoiceResult) => void; onCancel: () => void; onError: (msg: string) => void }) {
  const [sec, setSec] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const cancelled = useRef(false)
  const done = useRef(false)
  const cb = useRef({ onDone, onCancel, onError })
  cb.current = { onDone, onCancel, onError }

  useEffect(() => {
    let dead = false
    let timer = 0
    const release = () => {
      window.clearInterval(timer)
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        cb.current.onError(tr('這個環境不支援錄音'))
        return cb.current.onCancel()
      }
      let s: MediaStream
      try {
        s = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        cb.current.onError(tr('無法使用麥克風（沒有裝置，或系統隱私設定擋住了）'))
        return cb.current.onCancel()
      }
      if (dead) return s.getTracks().forEach((t) => t.stop())
      stream.current = s
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const r = new MediaRecorder(s, { mimeType: mime })
      rec.current = r
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      r.onstop = async () => {
        release()
        if (cancelled.current || done.current) return
        done.current = true
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        if (blob.size === 0) {
          cb.current.onError(tr('沒有錄到聲音'))
          return cb.current.onCancel()
        }
        if (blob.size > MAX_BYTES) {
          cb.current.onError(tr('錄音太大，沒有儲存'))
          return cb.current.onCancel()
        }
        const data = await blob.arrayBuffer()
        const dur = Math.min(MAX_SECONDS, (Date.now() - started.current) / 1000)
        let peaks: number[]
        try {
          const ctx = new AudioContext()
          const buf = await ctx.decodeAudioData(data.slice(0))
          void ctx.close()
          peaks = computePeaks(buf.getChannelData(0))
        } catch {
          peaks = computePeaks([]) // 解不開也不影響播放，只是波形是平的
        }
        cb.current.onDone({ note: { id: voiceId(), dur, peaks, ts: Date.now() }, data })
      }
      started.current = Date.now()
      r.start(250)
      timer = window.setInterval(() => {
        const t = (Date.now() - started.current) / 1000
        setSec(t)
        if (t >= MAX_SECONDS && r.state === 'recording') r.stop()
      }, 200)
    })()
    return () => {
      dead = true
      cancelled.current = true
      if (rec.current?.state === 'recording') rec.current.stop()
      release()
    }
  }, [])

  const finish = () => {
    if (rec.current?.state === 'recording') rec.current.stop()
  }
  const cancel = () => {
    cancelled.current = true
    if (rec.current?.state === 'recording') rec.current.stop()
    cb.current.onCancel()
  }
  return (
    <div className="voice-rec" role="status">
      <span className="voice-dot" />
      <span className="voice-rec-time">{fmtDur(sec)} / {fmtDur(MAX_SECONDS)}</span>
      <button type="button" className="voice-rec-btn ok" onClick={finish}>{tr('完成')}</button>
      <button type="button" className="voice-rec-btn" onClick={cancel}>{tr('取消')}</button>
    </div>
  )
}
