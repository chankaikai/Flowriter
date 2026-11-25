import { describe, it, expect } from 'vitest'
import { I18N_KEYS, I18N_TABLES, LANGS, setLang, tr } from '@/lib/i18n'
import { importThemeCss, listImported, removeImported } from '@/lib/themeImport'

describe('i18n', () => {
  it('every language has a translation for every key', () => {
    for (const [lang, arr] of Object.entries(I18N_TABLES)) {
      expect(arr.length).toBe(I18N_KEYS.length)
      expect(arr.every((s) => s.length > 0)).toBe(true)
      expect(LANGS.some((l) => l.id === lang)).toBe(true)
    }
    expect(LANGS.length).toBe(13)
  })
  it('translates known strings and passes unknown ones through', () => {
    setLang('en')
    expect(tr('檔案')).toBe('File')
    expect(tr('沒有這個字串')).toBe('沒有這個字串')
    setLang('zh-TW')
    expect(tr('檔案')).toBe('檔案')
  })
})

describe('i18n fallback', () => {
  it('non-Chinese languages fall back to English, zh-CN converts', () => {
    setLang('fr')
    expect(tr('粗體')).toBe('Bold')
    setLang('zh-CN')
    expect(tr('開啟檔案…')).toBe('开启文件…')
    expect(tr('儲存')).toBe('保存')
    setLang('zh-TW')
    expect(tr('粗體')).toBe('粗體')
  })
})

describe('theme import', () => {
  it('rewrites Typora and Obsidian selectors and strips external loads', () => {
    const r = importThemeCss('@import url(https://x.com/a.css);\n#write h1 { color: red; background: url(http://a/b.png) }\n.theme-dark .markdown-preview-view p { color: #eee }', 'my theme')
    expect(r.css).toContain('.editor-col .milkdown .ProseMirror h1')
    expect(r.css).toContain('[data-tone="dark"]')
    expect(r.css.includes('@import')).toBe(false)
    expect(r.css.includes('http')).toBe(false)
    expect(r.removedExternal).toBe(2)
  })
  it('lists and removes an imported theme', () => {
    const a = importThemeCss('#write{color:red}', 'a').css
    const b = importThemeCss('#write{color:blue}', 'b').css
    const all = `${a}\n${b}`
    expect(listImported(all)).toEqual(['a', 'b'])
    expect(listImported(removeImported(all, 'a'))).toEqual(['b'])
  })
})
