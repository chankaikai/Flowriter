import { useCallback, useEffect, useRef, useState } from 'react'

export type ThemeName = 'system' | 'light' | 'dark' | 'sepia'
export type ResolvedTheme = 'light' | 'dark' | 'sepia'
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
  translucent: boolean
  surfaceOpacity: number
  winMaterial: 'acrylic' | 'mica'
  customCss: string
  autoTheme: boolean
  inkRipple: boolean
  dailyGoal: number
  aiKey: string
  aiModel: string
  lastFolder: string | null
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
  translucent: true,
  surfaceOpacity: 0.72,
  winMaterial: 'acrylic',
  customCss: '',
  autoTheme: false,
  inkRipple: true,
  dailyGoal: 800,
  aiKey: '',
  aiModel: 'claude-sonnet-5-5',
  lastFolder: null
}

function load(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useSettings() {
  const [s, setS] = useState<Settings>(load)
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
      : s.theme
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
    document.documentElement.classList.toggle('translucent', translucentActive)
    requestAnimationFrame(() => {
      const cs = getComputedStyle(root)
      window.api.setChrome({
        // 系統材質啟用時視窗底色保持透明，讓毛玻璃透出來
        color: translucentActive ? '#00000000' : cs.getPropertyValue('--bg').trim() || '#ffffff',
        symbolColor: cs.getPropertyValue('--fg').trim() || '#000000',
        themeSource: s.theme === 'system' && !s.autoTheme ? 'system' : resolved === 'dark' ? 'dark' : 'light'
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
