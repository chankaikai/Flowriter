import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import { EXPORT_CSS, TOC_CSS } from './exportStyles'
import { renderMermaid } from '@/lib/mermaid'
import { toAbsolutePath } from '@/lib/path'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Markdown → HTML 片段。獨立於編輯器，所以源碼模式下也能匯出。
 * 公式輸出 MathML（Chromium 原生渲染），避免匯出檔還要附帶字型檔。
 */
export async function renderHtmlBody(md: string, docDir: string | null): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      handlers: { yaml: () => undefined }
    })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeKatex, { output: 'mathml', throwOnError: false })
    .use(rehypeHighlight, { detect: false, ignoreMissing: true, plainText: ['mermaid'] })
    .use(rehypeStringify)
    .process(md)

  const dom = new DOMParser().parseFromString(`<body>${String(file)}</body>`, 'text/html')

  // [TOC] → 由標題組成的目錄（標題 id 由 rehype-slug 產生）
  for (const p of Array.from(dom.querySelectorAll('p'))) {
    if (!/^\[toc\]$/i.test((p.textContent || '').trim())) continue
    const heads = Array.from(dom.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter((h) => h.id)
    if (!heads.length) {
      p.remove()
      continue
    }
    const min = Math.min(...heads.map((h) => Number(h.tagName[1])))
    const nav = dom.createElement('nav')
    nav.className = 'toc'
    nav.innerHTML =
      '<div class="toc-title">目錄</div>' +
      heads
        .map(
          (h) =>
            `<a href="#${escapeHtml(h.id)}" style="padding-left:${(Number(h.tagName[1]) - min) * 16}px">${escapeHtml(h.textContent || '')}</a>`
        )
        .join('')
    p.replaceWith(nav)
  }

  // Mermaid → 內嵌 SVG
  const blocks = Array.from(dom.querySelectorAll('pre > code.language-mermaid'))
  for (const code of blocks) {
    try {
      const svg = await renderMermaid(code.textContent || '', false)
      const holder = dom.createElement('div')
      holder.className = 'diagram'
      holder.innerHTML = svg
      code.parentElement?.replaceWith(holder)
    } catch {
      /* 語法錯誤時保留原始代碼塊 */
    }
  }

  // 本機圖片 → data URL，使匯出檔可獨立開啟
  const imgs = Array.from(dom.querySelectorAll('img'))
  await Promise.all(
    imgs.map(async (img) => {
      const abs = toAbsolutePath(docDir, img.getAttribute('src') || '')
      if (!abs) return
      const url = await window.api.readDataUrl(abs)
      if (url) img.setAttribute('src', url)
    })
  )

  return dom.body.innerHTML
}

export function buildHtmlDocument(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}${TOC_CSS}</style>
</head>
<body>
${body}
</body>
</html>
`
}
