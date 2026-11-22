/** 匯出 HTML / PDF 使用的獨立樣式（淺色、適合列印，不依賴應用程式主題）。 */
export const EXPORT_CSS = `
@page { size: A4; margin: 20mm 18mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0 auto; max-width: 780px; padding: 48px 28px 80px;
  font: 16px/1.85 -apple-system, 'Segoe UI', 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', sans-serif;
  color: #26241f; background: #fff;
}
h1,h2,h3,h4,h5,h6 { line-height: 1.3; font-weight: 700; margin: 1.7em 0 .6em; letter-spacing: -.01em; }
h1 { font-size: 2.1em; margin-top: 0; } h2 { font-size: 1.6em; } h3 { font-size: 1.3em; }
h4 { font-size: 1.1em; } h5,h6 { font-size: 1em; color: #6f6b62; }
p { margin: .9em 0; }
a { color: #b5412c; text-underline-offset: 3px; }
blockquote { margin: 1.2em 0; padding: .1em 1.1em; border-left: 3px solid #d8d3c8; color: #6f6b62; }
code { font: .88em 'JetBrains Mono', Consolas, 'SF Mono', monospace; background: #f3f1ec; padding: .12em .38em; border-radius: 5px; }
pre { background: #f6f4ef; border-radius: 10px; padding: 16px 18px; overflow: auto; line-height: 1.6; page-break-inside: avoid; }
pre code { background: none; padding: 0; font-size: .86em; }
table { border-collapse: collapse; width: 100%; margin: 1.2em 0; font-size: .95em; }
th, td { border: 1px solid #e3dfd5; padding: 8px 14px; text-align: left; }
th { background: #f6f4ef; font-weight: 600; }
tr { page-break-inside: avoid; }
img { max-width: 100%; border-radius: 6px; }
hr { border: 0; border-top: 1px solid #e3dfd5; margin: 2em 0; }
ul.contains-task-list { list-style: none; padding-left: 1.2em; }
.diagram { text-align: center; margin: 1.2em 0; }
.diagram svg { max-width: 100%; height: auto; }
math { font-size: 1.08em; }
math[display="block"] { display: block math; margin: 1em 0; }
.footnotes { margin-top: 3em; font-size: .9em; color: #6f6b62; border-top: 1px solid #e3dfd5; }
.hljs-comment,.hljs-quote { color: #8a857a; font-style: italic; }
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-built_in { color: #b5412c; }
.hljs-string,.hljs-attr,.hljs-addition { color: #3d7a5a; }
.hljs-number,.hljs-symbol,.hljs-bullet { color: #a0661a; }
.hljs-title,.hljs-function,.hljs-section { color: #2d5f9a; }
.hljs-type,.hljs-class .hljs-title { color: #7a4aa0; }
.hljs-deletion { color: #b5412c; }
`

/** 分享長圖：玻璃質感的卡片外框 */
export const SHARE_CSS = `
body { max-width: none; margin: 0; padding: 48px; background: linear-gradient(135deg, #ebe5da 0%, #d9e0e9 55%, #e8dae0 100%); }
.share-card { max-width: 664px; margin: 0 auto; padding: 44px 48px 36px; border-radius: 22px;
  background: rgba(255,255,255,.8); border: 1px solid rgba(255,255,255,.75);
  box-shadow: 0 24px 60px rgba(40,40,70,.16), inset 0 1px 0 #fff; }
.share-foot { margin: 22px 0 0; text-align: center; font-size: 12px; letter-spacing: .18em; color: #8a8478; }
`

/** [TOC] 目錄樣式 */
export const TOC_CSS = `
.toc { margin: 1.4em 0; padding: 14px 18px; border-radius: 10px; background: rgba(120,120,120,.08); }
.toc-title { font-weight: 600; margin-bottom: 6px; }
.toc a { display: block; padding: 2px 0; color: inherit; text-decoration: none; opacity: .85; }
.toc a:hover { text-decoration: underline; }
`

export const SYNTAX_CSS = `
.bilingual{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:1.2em 0}
.bilingual .bi-col+.bi-col{border-left:1px solid #0002;padding-left:18px}
blockquote.callout{--co:#3b82c4;border-left:3px solid var(--co);background:color-mix(in srgb,var(--co) 10%,transparent);border-radius:8px;padding:8px 16px}
blockquote.callout .callout-title{font-size:12px;font-weight:600;letter-spacing:.08em;color:var(--co)}
.callout-tip,.callout-success{--co:#2fa96b}.callout-warning,.callout-caution{--co:#d8902a}
.callout-danger,.callout-important{--co:#d6455d}.callout-question{--co:#8a63d2}
`
