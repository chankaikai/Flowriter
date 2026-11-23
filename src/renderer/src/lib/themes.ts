/**
 * 主題：每個主題只定義幾個基礎色，其餘變數（線條、玻璃、陰影、光暈…）由 deriveVars 推算，
 * 這樣新增主題不必手寫三十幾個變數，色彩關係也保持一致。
 * 內建的 light / dark / sepia 仍由 theme.css 提供；其餘主題在執行時套用推算結果。
 */
export interface ThemeDef {
  id: string
  label: string
  dark: boolean
  group: 'light' | 'dark'
  bg: string
  side: string
  elev: string
  fg: string
  accent: string
  /** 光暈的第二個顏色 */
  alt?: string
  /** 內建主題由 theme.css 提供變數，不需要推算 */
  builtin?: boolean
}

export const THEMES: ThemeDef[] = [
  { id: 'light', label: '紙張', dark: false, group: 'light', bg: '#fbfaf7', side: '#f3f1ec', elev: '#ffffff', fg: '#26241f', accent: '#b5412c', builtin: true },
  { id: 'word', label: '雪白', dark: false, group: 'light', bg: '#ffffff', side: '#f3f5f9', elev: '#ffffff', fg: '#1f2430', accent: '#2f6fed', alt: '#7a56c9' },
  { id: 'sepia', label: '護眼', dark: false, group: 'light', bg: '#eef2e6', side: '#e4e9da', elev: '#f6f8f0', fg: '#2f3a2d', accent: '#5b7a3a', builtin: true },
  { id: 'ocean', label: '海洋', dark: false, group: 'light', bg: '#f4f9fb', side: '#e8f1f5', elev: '#ffffff', fg: '#1d2f3a', accent: '#0f7c9a', alt: '#3a8f6a' },
  { id: 'forest', label: '森林', dark: false, group: 'light', bg: '#f5f8f3', side: '#e9f0e5', elev: '#ffffff', fg: '#22301f', accent: '#3b7a3e', alt: '#b08a2e' },
  { id: 'lavender', label: '薰衣草', dark: false, group: 'light', bg: '#f8f6fc', side: '#efebf7', elev: '#ffffff', fg: '#2b2438', accent: '#7a56c9', alt: '#c2476a' },
  { id: 'rose', label: '玫瑰', dark: false, group: 'light', bg: '#fdf6f6', side: '#f7ebeb', elev: '#ffffff', fg: '#3a2528', accent: '#c2476a', alt: '#d8902a' },
  { id: 'dark', label: '暖炭', dark: true, group: 'dark', bg: '#1c1b19', side: '#171614', elev: '#262522', fg: '#d9d5cc', accent: '#e0715a', builtin: true },
  { id: 'midnight', label: '午夜', dark: true, group: 'dark', bg: '#141a26', side: '#0f1420', elev: '#1c2433', fg: '#d5dbe8', accent: '#6ea8ff', alt: '#a98bf0' },
  { id: 'graphite', label: '石墨', dark: true, group: 'dark', bg: '#1e1f22', side: '#18191b', elev: '#26272b', fg: '#d8dadf', accent: '#4fb3a9', alt: '#6ea8ff' },
  { id: 'nord', label: '北歐', dark: true, group: 'dark', bg: '#2e3440', side: '#272c36', elev: '#3b4252', fg: '#e5e9f0', accent: '#88c0d0', alt: '#b48ead' },
  { id: 'dusk', label: '暮紫', dark: true, group: 'dark', bg: '#1f1b2a', side: '#181522', elev: '#292437', fg: '#e0dcec', accent: '#c792ea', alt: '#6ea8ff' },
  { id: 'pine', label: '森夜', dark: true, group: 'dark', bg: '#17201b', side: '#121a15', elev: '#1f2b24', fg: '#d3e0d6', accent: '#7bc98a', alt: '#d8b45a' }
]

export type ThemeId = string
export const themeById = (id: string): ThemeDef => THEMES.find((t) => t.id === id) ?? THEMES[0]
export const isDarkTheme = (id: string): boolean => themeById(id).dark

/* ---- 色彩運算 ---- */
type RGB = [number, number, number]
export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}
const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')
export const rgbToHex = ([r, g, b]: RGB) => `#${hex2(r)}${hex2(g)}${hex2(b)}`
/** 把 a 與 b 依比例混合（t=0 全是 a，t=1 全是 b） */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}
export const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
const lum = (hex: string) => {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
/** WCAG 對比度 */
export function contrast(a: string, b: string): number {
  const la = lum(a)
  const lb = lum(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** 由基礎色推算出整套 CSS 變數。 */
export function deriveVars(t: ThemeDef): Record<string, string> {
  const d = t.dark
  const alt = t.alt ?? t.accent
  const white = '#ffffff'
  const black = '#000000'
  return {
    '--bg': t.bg,
    '--bg-side': t.side,
    '--bg-elev': t.elev,
    '--fg': t.fg,
    '--fg-muted': mix(t.fg, t.bg, d ? 0.42 : 0.4),
    '--fg-faint': mix(t.fg, t.bg, d ? 0.68 : 0.64),
    '--line': rgba(t.fg, d ? 0.08 : 0.09),
    '--line-strong': rgba(t.fg, d ? 0.16 : 0.18),
    '--hover': rgba(t.fg, d ? 0.06 : 0.055),
    '--active': rgba(t.fg, d ? 0.1 : 0.1),
    '--accent': t.accent,
    '--accent-soft': rgba(t.accent, d ? 0.17 : 0.12),
    '--code-bg': mix(t.bg, t.fg, d ? 0.07 : 0.05),
    '--code-fg': d ? mix(t.accent, white, 0.25) : mix(t.accent, black, 0.22),
    '--block-bg': mix(t.bg, t.fg, d ? 0.04 : 0.03),
    '--shadow': d ? '0 16px 48px rgba(0, 0, 0, 0.55), 0 2px 8px rgba(0, 0, 0, 0.3)' : `0 12px 40px ${rgba(t.fg, 0.14)}, 0 2px 8px ${rgba(t.fg, 0.06)}`,
    '--glass-bg': d ? rgba(mix(t.elev, white, 0.06), 0.5) : 'rgba(255, 255, 255, 0.55)',
    '--glass-bg-strong': d ? rgba(mix(t.elev, black, 0.1), 0.84) : 'rgba(255, 255, 255, 0.8)',
    '--glass-side': rgba(t.side, 0.6),
    '--glass-edge': d ? 'rgba(0, 0, 0, 0.45)' : rgba(t.fg, 0.08),
    '--glass-shadow': d ? '0 14px 44px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)' : `0 10px 34px ${rgba(t.fg, 0.13)}, 0 1px 3px ${rgba(t.fg, 0.06)}`,
    '--rim-hi': d ? 'rgba(255, 255, 255, 0.26)' : 'rgba(255, 255, 255, 0.95)',
    '--rim-lo': d ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.45)',
    '--pill-bg': d ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.66)',
    '--trough': d ? 'rgba(0, 0, 0, 0.3)' : rgba(t.fg, 0.07),
    '--spot': d ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.7)',
    '--edge-hot': d ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 1)',
    '--beam-a': mix(t.accent, white, d ? 0.15 : 0.3),
    '--beam-b': mix(t.accent, white, 0.75),
    '--blob-a': rgba(t.accent, d ? 0.17 : 0.13),
    '--blob-b': rgba(alt, d ? 0.14 : 0.12),
    'color-scheme': d ? 'dark' : 'light'
  }
}

/** 套用主題：內建主題清掉行內變數（交給 theme.css），其餘寫入推算結果。 */
export function applyThemeVars(root: HTMLElement, id: string): void {
  const t = themeById(id)
  const prev = (root.dataset.derived || '').split(',').filter(Boolean)
  for (const k of prev) root.style.removeProperty(k)
  root.dataset.tone = t.dark ? 'dark' : 'light'
  if (t.builtin) {
    root.dataset.derived = ''
    return
  }
  const vars = deriveVars(t)
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  root.dataset.derived = Object.keys(vars).join(',')
}
