import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

let service: TurndownService | null = null
function td(): TurndownService {
  if (!service) {
    service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      hr: '---'
    })
    service.use(gfm) // 表格、刪除線、任務列表
    service.remove(['style', 'script', 'meta', 'title', 'head'])
  }
  return service
}

/** 只有剪貼簿帶有「有意義的 HTML 格式」時才轉換；編輯器內部複製與程式碼編輯器一律不碰。 */
export function shouldConvertHtml(html: string, types: readonly string[]): boolean {
  if (/data-pm-slice/.test(html)) return false // 從 Flowiter 自己複製的內容
  if (types.includes('vscode-editor-data')) return false // VS Code 的語法高亮 HTML
  return /<(h[1-6]|ul|ol|li|a|strong|b|em|i|table|img|pre|blockquote|del|s)[\s>]/i.test(html)
}

export function htmlToMarkdown(html: string): string {
  // 瀏覽器 / Office 複製時會包 <!--StartFragment-->…<!--EndFragment-->
  const m = /<!--StartFragment-->([\s\S]*?)<!--EndFragment-->/.exec(html)
  const doc = new DOMParser().parseFromString(`<body>${m ? m[1] : html}</body>`, 'text/html')
  // Google 文件會用 <b style="font-weight:normal"> 包住整份內容，不能當粗體
  doc.querySelectorAll('b[style*="font-weight:normal"], b[style*="font-weight: normal"]').forEach((b) => {
    b.replaceWith(...Array.from(b.childNodes))
  })
  return td().turndown(doc.body).replace(/\n{3,}/g, '\n\n').trim()
}
