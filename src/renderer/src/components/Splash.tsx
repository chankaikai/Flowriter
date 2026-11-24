import { useEffect, useState } from 'react'

const HELLOS = [
  'Hello',
  '你好',
  'こんにちは',
  '안녕하세요',
  'Hola',
  'Bonjour',
  'Hallo',
  'Ciao',
  'Привет',
  'مرحبا',
  'नमस्ते',
  'Olá'
]
/** 整段顯示時間（毫秒）：2.4 秒，落在 2～3 秒之間 */
const TOTAL_MS = 2400
const STEP_MS = 200

/** 啟動畫面：各種語言的「你好」輪流淡入，2.4 秒後淡出；點一下可跳過。 */
export function Splash({ onDone }: { onDone(): void }) {
  const [i, setI] = useState(0)
  const [out, setOut] = useState(false)
  useEffect(() => {
    const tick = window.setInterval(() => setI((n) => (n + 1) % HELLOS.length), STEP_MS)
    const fade = window.setTimeout(() => setOut(true), TOTAL_MS - 350)
    const end = window.setTimeout(onDone, TOTAL_MS)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(fade)
      window.clearTimeout(end)
    }
  }, [onDone])
  return (
    <div className={`splash${out ? ' out' : ''}`} onClick={onDone} role="presentation">
      <div className="splash-word" key={i}>
        {HELLOS[i]}
      </div>
      <div className="splash-brand">Flowiter</div>
    </div>
  )
}
