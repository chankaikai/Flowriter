/** 朗讀校對：依句子切開，一句一句念，念到哪句就回報，讓編輯器跟著選取。 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[。！？；!?;\n])/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s))
}

export interface SpeakHandle { stop(): void }

/** 啟動時喚醒語音清單：Chromium 第一次呼叫 getVoices 常是空的，等 voiceschanged 後才有。 */
export function warmVoices(): void {
  if (!ttsAvailable()) return
  window.speechSynthesis.getVoices()
  window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices() }
}

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

export function speak(
  sentences: string[],
  opts: { rate: number; onSentence(s: string, i: number): void; onEnd(reason: 'done' | 'stopped' | 'error'): void }
): SpeakHandle {
  const synth = window.speechSynthesis
  let stopped = false
  // 每次開始朗讀都重新向系統讀取語音清單（Windows 語音設定改過、重開程式後才不會拿到舊清單）
  const voices = synth.getVoices()
  const zh = voices.find((v) => /^zh/i.test(v.lang) && v.localService) || voices.find((v) => /^zh/i.test(v.lang))
  const next = (i: number) => {
    if (stopped) return
    if (i >= sentences.length) return opts.onEnd('done')
    const u = new SpeechSynthesisUtterance(sentences[i])
    const isZh = /[一-鿿]/.test(sentences[i])
    if (isZh && zh) u.voice = zh
    u.lang = isZh ? zh?.lang || 'zh-CN' : 'en-US'
    u.rate = opts.rate
    u.onstart = () => opts.onSentence(sentences[i], i)
    u.onend = () => next(i + 1)
    u.onerror = (e) => {
      if (stopped || e.error === 'canceled' || e.error === 'interrupted') return
      stopped = true
      opts.onEnd('error')
    }
    synth.speak(u)
  }
  synth.cancel()
  next(0)
  return {
    stop() {
      if (stopped) return
      stopped = true
      synth.cancel()
      opts.onEnd('stopped')
    }
  }
}
