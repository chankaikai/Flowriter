import { useCallback, useEffect, useRef, useState } from 'react'
import { THEMES, applyThemeVars, isDarkTheme } from './themes'
import { setLang } from './i18n'

export type ThemeName = 'system' | (string & {})
export type ResolvedTheme = string
export type SidebarTab = 'files' | 'outline' | 'search'

export interface Settings {
  theme: ThemeName
  fontFamily: 'sans' | 'serif' | 'mono'
  fontSize: number
  lineHeight: number
  maxWidth: number
  sidebarOpen: boolean
  sidebarTab: SidebarTab
  focusMode: boolean
  typewriter: boolean
  autosave: boolean
  /** 自動儲存間隔（秒）：0 = 即時（每次輸入後立刻儲存），否則 30 秒～6 小時 */
  autosaveSec: number
  /** 側邊欄寬度（可拖曳分隔線調整） */
  sidebarWidth: number
  /** 全域快捷鍵叫出收件匣小視窗 */
  inboxShortcut: boolean
  /** 介面語言（外框範圍，見 i18n.ts） */
  uiLang: string
  /** 源碼模式的檢視方式：僅源碼／源碼＋預覽 */
  srcLayout: 'only' | 'split'
  /** 分割檢視時預覽在左 */
  srcSwap: boolean
  /** 分割檢視左窗格比例 */
  srcRatio: number
  /** 行號：代碼塊、渲染模式（每個區塊在 .md 的起始行）、源碼模式，可分開開關 */
  lnCode: boolean
  lnWysiwyg: boolean
  lnSource: boolean
  /** 腳註引用的樣式與是否顯示編號 */
  fnStyle: 'bracket' | 'plain' | 'paren'
  fnNumbers: boolean
  /** 語音轉文字用的模型名稱（OpenAI 相容 /audio/transcriptions），例如 whisper-1、FunAudioLLM/SenseVoiceSmall */
  sttModel: string
  translucent: boolean
  surfaceOpacity: number
  winMaterial: 'acrylic' | 'mica'
  customCss: string
  autoTheme: boolean
  inkRipple: boolean
  dailyGoal: number
  aiProvider: string
  aiKeys: Record<string, string>
  aiModels: Record<string, string>
  aiBaseUrls: Record<string, string>
  /** AI 回覆長度上限（token）。推理模型思考很長，需要調大 */
  aiMaxTokens: number
  lastFolder: string | null
  /** 重新開啟軟體時：還原上次的分頁，或只開一個空白未儲存文件 */
  startupDoc: 'last' | 'blank'
}

const KEY = 'inkwell.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontFamily: 'sans',
  fontSize: 17,
  lineHeight: 1.85,
  maxWidth: 760,
  sidebarOpen: true,
  sidebarTab: 'files',
  focusMode: false,
  typewriter: false,
  autosave: true,
  autosaveSec: 0,
  sidebarWidth: 264,
  inboxShortcut: false,
  uiLang: 'zh-TW',
  srcLayout: 'only',
  srcSwap: false,
  srcRatio: 0.5,
  lnCode: true,
  lnWysiwyg: false,
  lnSource: true,
  fnStyle: 'bracket',
  fnNumbers: true,
  sttModel: 'whisper-1',
  translucent: true,
  surfaceOpacity: 0.72,
  winMaterial: 'acrylic',
  customCss: '',
  autoTheme: false,
  inkRipple: true,
  dailyGoal: 800,
  aiProvider: 'anthropic',
  aiKeys: {},
  aiModels: {},
  aiBaseUrls: {},
  aiMaxTokens: 4096,
  lastFolder: null,
  startupDoc: 'last'
}

export function loadSettings(): Settings {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '{}')
    // 舊版只有單一 Claude 金鑰：搬到新的分服務商結構
    if (j.aiKey && !j.aiKeys) {
      j.aiKeys = { anthropic: j.aiKey }
      if (j.aiModel) j.aiModels = { anthropic: j.aiModel }
    }
    if (typeof j.showLineNumbers === 'boolean') {
      if (j.lnCode === undefined) j.lnCode = j.showLineNumbers
      if (j.lnSource === undefined) j.lnSource = j.showLineNumbers
    }
    delete j.showLineNumbers
    delete j.aiKey
    delete j.aiModel
    return { ...DEFAULT_SETTINGS, ...j }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useSettings() {
  const [s, setS] = useState<Settings>(loadSettings)
  const update = useCallback((patch: Partial<Settings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* 儲存空間不可用時忽略 */
      }
      return next
    })
  }, [])
  return [s, update] as const
}

const FONTS = {
  sans: `'Inter Variable', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', system-ui, sans-serif`,
  serif: `'Source Serif 4 Variable', 'Songti TC', 'Noto Serif TC', 'PMingLiU', Georgia, serif`,
  mono: `'JetBrains Mono Variable', 'SF Mono', Consolas, 'PingFang TC', 'Microsoft JhengHei', monospace`
}

/** 將設定套用到 DOM，回傳實際生效的主題（system 會依系統深淺色解析）。 */
export function useApplySettings(s: Settings, materialSupported: boolean): ResolvedTheme {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // 依時段自動換主題：每分鐘檢查一次
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    if (!s.autoTheme) return
    const id = window.setInterval(() => setHour(new Date().getHours()), 60_000)
    setHour(new Date().getHours())
    return () => window.clearInterval(id)
  }, [s.autoTheme])
  const byClock: ResolvedTheme = hour >= 7 && hour < 17 ? 'light' : hour >= 17 && hour < 20 ? 'sepia' : 'dark'

  const resolved: ResolvedTheme = s.autoTheme
    ? byClock
    : s.theme === 'system'
      ? systemDark
        ? 'dark'
        : 'light'
      : THEMES.some((t) => t.id === s.theme)
        ? s.theme
        : 'light'
  const prevTheme = useRef<ResolvedTheme | null>(null)
  const translucentActive = materialSupported && s.translucent

  useEffect(() => {
    const root = document.documentElement
    // 切換主題時短暫開啟全域過渡，平時關閉以免影響輸入效能
    if (prevTheme.current && prevTheme.current !== resolved) {
      root.classList.add('theme-anim')
      window.setTimeout(() => root.classList.remove('theme-anim'), 450)
    }
    prevTheme.current = resolved
    root.dataset.theme = resolved
    applyThemeVars(root, resolved)
    document.documentElement.classList.toggle('translucent', translucentActive)
    requestAnimationFrame(() => {
      const cs = getComputedStyle(root)
      window.api.setChrome({
        // 系統材質啟用時視窗底色保持透明，讓毛玻璃透出來
        color: translucentActive ? '#00000000' : cs.getPropertyValue('--bg-side').trim() || '#ffffff',
        symbolColor: cs.getPropertyValue('--fg').trim() || '#000000',
        themeSource: s.theme === 'system' && !s.autoTheme ? 'system' : isDarkTheme(resolved) ? 'dark' : 'light'
      })
    })
  }, [resolved, translucentActive, s.theme, s.autoTheme])

  useEffect(() => {
    if (!materialSupported) return
    window.api.setMaterial({ enabled: s.translucent, kind: s.winMaterial })
  }, [materialSupported, s.translucent, s.winMaterial])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--fs', `${s.fontSize}px`)
    root.style.setProperty('--lh', String(s.lineHeight))
    root.style.setProperty('--maxw', `${s.maxWidth}px`)
    root.style.setProperty('--font-body', FONTS[s.fontFamily])
    root.style.setProperty('--tl', String(s.surfaceOpacity))
  }, [s.fontSize, s.lineHeight, s.maxWidth, s.fontFamily, s.surfaceOpacity])

  setLang(s.uiLang) // 同步設定，讓這一輪渲染就用新語言
  useEffect(() => {
    document.body.classList.toggle('hide-ln-code', !s.lnCode)
    document.body.classList.toggle('hide-ln-source', !s.lnSource)
    document.body.classList.toggle('show-ln-wys', s.lnWysiwyg)
  }, [s.lnCode, s.lnSource, s.lnWysiwyg])

  useEffect(() => {
    const b = document.body.classList
    b.remove('fn-bracket', 'fn-plain', 'fn-paren')
    b.add(`fn-${s.fnStyle}`)
    b.toggle('fn-nonum', !s.fnNumbers)
  }, [s.fnStyle, s.fnNumbers])

  useEffect(() => {
    document.body.classList.toggle('focus-mode', s.focusMode)
    document.body.classList.toggle('typewriter', s.typewriter)
  }, [s.focusMode, s.typewriter])

  useEffect(() => {
    let el = document.getElementById('inkwell-custom-css') as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = 'inkwell-custom-css'
      document.head.appendChild(el)
    }
    el.textContent = s.customCss
  }, [s.customCss])

  return resolved
}
