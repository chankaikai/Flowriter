/** 匯出／列印設定（純函式）：選項 → 附加 CSS、PDF 頁首頁尾模板。設定存在 localStorage。 */

export type Paper = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal'
export type FontKind = 'sans' | 'serif' | 'mono'
export type ExportTheme = 'light' | 'sepia' | 'dark'

export interface ExportOpts {
  paper: Paper
  landscape: boolean
  /** 邊距（mm） */
  mt: number
  mr: number
  mb: number
  ml: number
  fontSize: number
  font: FontKind
  lineHeight: number
  /** HTML 匯出的內容寬度（px） */
  width: number
  theme: ExportTheme
  toc: boolean
  /** 頁首顯示文件標題 */
  header: boolean
  /** 頁尾顯示頁碼 */
  pageNumbers: boolean
  /** 列印／PDF 時保留背景色（程式碼底色、表頭等） */
  background: boolean
  customCss: string
}

export const PAPER_MM: Record<Paper, [number, number]> = { A3: [297, 420], A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6] }

export const DEFAULT_EXPORT: ExportOpts = {
  paper: 'A4', landscape: false, mt: 20, mr: 18, mb: 20, ml: 18,
  fontSize: 16, font: 'sans', lineHeight: 1.85, width: 780, theme: 'light',
  toc: false, header: false, pageNumbers: true, background: true, customCss: ''
}

const FONTS: Record<FontKind, string> = {
  sans: "-apple-system, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', sans-serif",
  serif: "'Songti TC', 'Noto Serif TC', 'Source Han Serif TC', 'PMingLiU', Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', Consolas, 'SF Mono', 'Microsoft JhengHei', monospace"
}

const clamp = (n: unknown, lo: number, hi: number, d: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : d
  return Math.min(hi, Math.max(lo, v))
}

/** 把任意（可能壞掉的）資料整理成合法設定 */
export function normalizeOpts(raw: unknown): ExportOpts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_EXPORT
  const pick = <T extends string>(v: unknown, all: readonly T[], def: T): T => (all as readonly string[]).includes(v as string) ? (v as T) : def
  return {
    paper: pick(r.paper, ['A3', 'A4', 'A5', 'Letter', 'Legal'] as const, d.paper),
    landscape: r.landscape === true,
    mt: clamp(r.mt, 0, 60, d.mt), mr: clamp(r.mr, 0, 60, d.mr), mb: clamp(r.mb, 0, 60, d.mb), ml: clamp(r.ml, 0, 60, d.ml),
    fontSize: clamp(r.fontSize, 9, 32, d.fontSize),
    font: pick(r.font, ['sans', 'serif', 'mono'] as const, d.font),
    lineHeight: clamp(r.lineHeight, 1.1, 3, d.lineHeight),
    width: clamp(r.width, 360, 1600, d.width),
    theme: pick(r.theme, ['light', 'sepia', 'dark'] as const, d.theme),
    toc: r.toc === true,
    header: r.header === true,
    pageNumbers: r.pageNumbers !== false,
    background: r.background !== false,
    customCss: typeof r.customCss === 'string' ? r.customCss.slice(0, 20000) : ''
  }
}

const KEY = 'inkwell.export.opts.v1'
export function loadExportOpts(): ExportOpts {
  try {
    return normalizeOpts(JSON.parse(localStorage.getItem(KEY) || '{}'))
  } catch {
    return DEFAULT_EXPORT
  }
}
export function saveExportOpts(o: ExportOpts): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(o))
  } catch {
    /* ignore */
  }
}

const THEME_CSS: Record<ExportTheme, string> = {
  light: '',
  sepia: 'body{background:#f4ecd8;color:#4b3a28}a{color:#9a4a1a}code,pre,th{background:#eadfc5}blockquote{border-left-color:#c9b78f;color:#7a6548}th,td,hr{border-color:#d7c8a3}',
  dark: 'body{background:#1f1f1f;color:#dedbd4}a{color:#e08a73}code,pre,th{background:#2c2c2c}blockquote{border-left-color:#555;color:#aaa}th,td,hr{border-color:#444}h5,h6{color:#aaa}'
}

/** 附加在 buildHtmlDocument 之後的 CSS。kind：html＝網頁，pdf／print＝分頁輸出 */
export function optionsCss(o: ExportOpts, kind: 'html' | 'pdf' | 'print'): string {
  const paged = kind !== 'html'
  const parts: string[] = []
  if (paged) parts.push(`@page{size:${o.paper} ${o.landscape ? 'landscape' : 'portrait'};margin:${o.mt}mm ${o.mr}mm ${o.mb}mm ${o.ml}mm}`)
  parts.push(`body{font-family:${FONTS[o.font]};font-size:${o.fontSize}px;line-height:${o.lineHeight};${paged ? 'max-width:none;padding:0;' : `max-width:${o.width}px;`}}`)
  parts.push(THEME_CSS[o.theme])
  if (paged) parts.push('h1,h2,h3,h4{page-break-after:avoid}img,figure,.diagram{page-break-inside:avoid}')
  if (paged && !o.background) parts.push('*{background:transparent!important}')
  if (paged && o.theme !== 'light' && o.background) parts.push('html{background:inherit}')
  if (o.customCss.trim()) parts.push(o.customCss)
  return parts.join('\n')
}

/** 預覽專用：把一頁紙的寬度與邊距畫出來（不會寫進匯出檔） */
export function previewCss(o: ExportOpts, kind: 'html' | 'pdf' | 'print'): string {
  if (kind === 'html') return 'html{background:#e9e7e2}body{background-clip:padding-box}'
  const [w, h] = PAPER_MM[o.paper]
  const pw = o.landscape ? h : w
  const mmpx = 96 / 25.4
  return `html{background:#8b8b8b;padding:16px 0}body{box-sizing:border-box;width:${Math.round(pw * mmpx)}px;margin:0 auto!important;padding:${Math.round(o.mt * mmpx)}px ${Math.round(o.mr * mmpx)}px ${Math.round(o.mb * mmpx)}px ${Math.round(o.ml * mmpx)}px!important;min-height:${Math.round((o.landscape ? w : h) * mmpx)}px;box-shadow:0 2px 14px rgba(0,0,0,.35)}`
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** PDF／列印的頁首頁尾（Chromium 模板語法）。都不要時回傳 null */
export function headerFooter(o: ExportOpts, title: string): { header: string; footer: string } | null {
  if (!o.header && !o.pageNumbers) return null
  const base = 'font-size:9px;width:100%;color:#777;padding:0 12mm;'
  return {
    header: o.header ? `<div style="${base}text-align:left">${esc(title)}</div>` : '<div></div>',
    footer: o.pageNumbers ? `<div style="${base}text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>` : '<div></div>'
  }
}

/** 需要目錄時，在文件最前面補 [TOC]（已經有就不動）。只作用於匯出用的副本。 */
export function withToc(md: string, toc: boolean): string {
  if (!toc || /^\s*\[TOC\]\s*$/m.test(md)) return md
  return `[TOC]\n\n${md}`
}
