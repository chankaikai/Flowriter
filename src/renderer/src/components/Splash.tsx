import { useCallback, useEffect, useState } from 'react'

const FLAG = 'flowiter.welcomed'
/** 是否已經看過歡迎畫面（只在第一次安裝後啟動時顯示） */
export function welcomed(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1'
  } catch {
    return true // 存取不到儲存空間時不打擾使用者
  }
}

const HELLOS: { t: string; lang: string }[] = [
  { t: 'Hello', lang: 'English' },
  { t: '你好', lang: '中文' },
  { t: 'こんにちは', lang: '日本語' },
  { t: '안녕하세요', lang: '한국어' },
  { t: 'Hola', lang: 'Español' },
  { t: 'Bonjour', lang: 'Français' },
  { t: 'Hallo', lang: 'Deutsch' },
  { t: 'Ciao', lang: 'Italiano' },
  { t: 'Привет', lang: 'Русский' },
  { t: 'مرحبا', lang: 'العربية' },
  { t: 'नमस्ते', lang: 'हिन्दी' },
  { t: 'Olá', lang: 'Português' }
]
/** 每個詞：書寫 1.4 秒 + 停留 0.7 秒 */
const WORD_MS = 2100
/** 「立即使用」在第 3 個詞寫完後出現，使用者可以隨時點，不必看完 */
const BUTTON_AFTER_MS = WORD_MS * 3

/**
 * 首次啟動的歡迎畫面：毛玻璃背景，各國語言的「你好」逐字「寫」出來（由左向右揭開並帶一支筆尖），
 * 下方出現毛玻璃的「立即使用」按鈕。顯示期間視窗的最小化／關閉按鈕會被隱藏。
 */
export function Splash({ onDone }: { onDone(): void }) {
  const [i, setI] = useState(0)
  const [ready, setReady] = useState(false)
  const [out, setOut] = useState(false)

  useEffect(() => {
    window.api.setSplash(true)
    return () => window.api.setSplash(false)
  }, [])
  useEffect(() => {
    const tick = window.setInterval(() => setI((n) => (n + 1) % HELLOS.length), WORD_MS)
    const btn = window.setTimeout(() => setReady(true), BUTTON_AFTER_MS)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(btn)
    }
  }, [])
  const start = useCallback(() => {
    if (out) return
    try {
      localStorage.setItem(FLAG, '1')
    } catch {
      /* 忽略 */
    }
    setOut(true)
    window.setTimeout(onDone, 450)
  }, [out, onDone])
  useEffect(() => {
    if (!ready) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') start()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [ready, start])

  const w = HELLOS[i]
  return (
    <div className={`splash${out ? ' out' : ''}`} role="dialog" aria-label="歡迎使用 Flowiter">
      <div className="splash-card">
        <div className="splash-stage" key={i}>
          <span className="splash-word" lang={w.lang}>
            {w.t}
          </span>
          <i className="splash-pen" />
        </div>
        <div className="splash-lang" key={`l${i}`}>
          {w.lang}
        </div>
        <div className="splash-brand">Flowiter</div>
        <button className={`splash-go${ready ? ' show' : ''}`} onClick={start} disabled={!ready} tabIndex={ready ? 0 : -1}>
          立即使用
        </button>
      </div>
    </div>
  )
}
