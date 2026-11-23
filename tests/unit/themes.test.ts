import { describe, it, expect } from 'vitest'
import { THEMES, contrast, deriveVars, mix, themeById, isDarkTheme } from '@/lib/themes'

describe('themes', () => {
  it('ids are unique and light/dark groups match the flag', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
    for (const t of THEMES) expect(t.group).toBe(t.dark ? 'dark' : 'light')
  })
  it('body text is readable on every theme (WCAG AA 4.5)', () => {
    for (const t of THEMES) expect(contrast(t.fg, t.bg) >= 4.5).toBe(true)
  })
  it('accent is visible against the background (>= 3)', () => {
    for (const t of THEMES) expect(contrast(t.accent, t.bg) >= 3).toBe(true)
  })
  it('muted text keeps a usable contrast (>= 3)', () => {
    for (const t of THEMES.filter((x) => !x.builtin)) {
      const v = deriveVars(t)
      expect(contrast(v['--fg-muted'], t.bg) >= 3).toBe(true)
    }
  })
  it('derives every variable the stylesheet uses', () => {
    const keys = Object.keys(deriveVars(themeById('word')))
    for (const k of ['--bg', '--fg', '--accent', '--glass-bg', '--shadow', '--blob-a', '--pill-bg', 'color-scheme']) expect(keys).toContain(k)
  })
  it('mixes colors', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(isDarkTheme('midnight')).toBe(true)
    expect(isDarkTheme('nope')).toBe(false)
  })
})
