import { WELCOME } from './welcome'

const DOC_FLAG = 'flowiter.welcomeDoc.shown'
const VER_KEY = 'flowiter.lastVersion'

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return '1' // 存取不到儲存空間時不要硬塞歡迎文件
  }
}
const set = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

/** 初始文件：只有「剛安裝後第一次啟動」是歡迎文件，之後都是空白未儲存文件。 */
export const INITIAL_DOC: string = get(DOC_FLAG) === '1' ? '' : WELCOME
export const markWelcomeDocShown = (): void => set(DOC_FLAG, '1')

/** 上次啟動時的版本；第一次安裝回傳 null。 */
export const lastSeenVersion = (): string | null => get(VER_KEY)
export const setSeenVersion = (v: string): void => set(VER_KEY, v)

/** 檔名不能含的字元；空白收斂；限制長度。 */
export function safeFileBase(s: string, max = 80): string {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, max)
    .trim()
}

/** 儲存新檔時的預設檔名：第一個一級標題；沒有就「未命名」。 */
export function suggestedName(md: string): string {
  let fence = false
  for (const line of md.replace(/^﻿/, '').split(/\r?\n/)) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence
    if (fence) continue
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) {
      const t = safeFileBase(
        m[1]
          .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/[*_`~]/g, '')
          .replace(/<[^>]+>/g, '')
      )
      if (t) return t
    }
  }
  return '未命名'
}
