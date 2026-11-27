import { describe, it, expect } from 'vitest'
import { DEFAULT_EXPORT, normalizeOpts, optionsCss, headerFooter, withToc, previewCss } from '@/export/exportOptions'

describe('exportOptions', () => {
  it('normalize clamps and falls back', () => {
    const o = normalizeOpts({ paper: 'X', mt: 999, fontSize: 'a', theme: 'dark', pageNumbers: false })
    expect(o.paper).toBe('A4')
    expect(o.mt).toBe(60)
    expect(o.fontSize).toBe(16)
    expect(o.theme).toBe('dark')
    expect(o.pageNumbers).toBe(false)
    expect(normalizeOpts(null)).toEqual(DEFAULT_EXPORT)
  })
  it('paged css carries page size and margins', () => {
    const css = optionsCss({ ...DEFAULT_EXPORT, paper: 'A5', landscape: true, mt: 10, mr: 11, mb: 12, ml: 13 }, 'pdf')
    expect(css).toContain('size:A5 landscape')
    expect(css).toContain('margin:10mm 11mm 12mm 13mm')
    expect(css).toContain('max-width:none')
  })
  it('html css has width and no @page', () => {
    const css = optionsCss({ ...DEFAULT_EXPORT, width: 900 }, 'html')
    expect(css).toContain('max-width:900px')
    expect(css.includes('@page')).toBe(false)
  })
  it('header/footer escape the title and can be disabled', () => {
    expect(headerFooter({ ...DEFAULT_EXPORT, pageNumbers: false }, 'x')).toBeNull()
    const hf = headerFooter({ ...DEFAULT_EXPORT, header: true }, '<b>')
    expect(hf!.header).toContain('&lt;b&gt;')
    expect(hf!.footer).toContain('totalPages')
  })
  it('withToc prepends once', () => {
    expect(withToc('# a', true)).toBe('[TOC]\n\n# a')
    expect(withToc('[TOC]\n# a', true)).toBe('[TOC]\n# a')
    expect(withToc('# a', false)).toBe('# a')
  })
  it('preview css swaps width for landscape', () => {
    expect(previewCss({ ...DEFAULT_EXPORT, landscape: true }, 'pdf')).toContain('width:1123px')
  })
})
