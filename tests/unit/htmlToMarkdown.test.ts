import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, shouldConvertHtml } from '@/lib/htmlToMarkdown'

describe('shouldConvertHtml', () => {
  it('帶有意義標籤的 HTML 才轉換', () => {
    expect(shouldConvertHtml('<h1>t</h1>', ['text/html'])).toBe(true)
    expect(shouldConvertHtml('<span>plain</span>', ['text/html'])).toBe(false)
  })
  it('Inkwell 自己複製的內容不轉', () => {
    expect(shouldConvertHtml('<p data-pm-slice="1 1 []"><b>x</b></p>', [])).toBe(false)
  })
  it('VS Code 的語法高亮 HTML 不轉', () => {
    expect(shouldConvertHtml('<b>x</b>', ['vscode-editor-data'])).toBe(false)
  })
})

describe('htmlToMarkdown', () => {
  it('標題、粗體、連結、清單', () => {
    const md = htmlToMarkdown('<h2>標題</h2><p><strong>粗</strong> 與 <a href="https://a.com">連結</a></p><ul><li>一</li><li>二</li></ul>')
    expect(md).toContain('## 標題')
    expect(md).toContain('**粗**')
    expect(md).toContain('[連結](https://a.com)')
    expect(md).toMatch(/-\s+一/)
  })
  it('表格轉成 GFM 表格', () => {
    const md = htmlToMarkdown('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>')
    expect(md).toContain('| A | B |')
    expect(md).toContain('| 1 | 2 |')
  })
  it('只取 StartFragment 與 EndFragment 之間的內容', () => {
    const md = htmlToMarkdown('<html><body><!--StartFragment--><p>內文</p><!--EndFragment--><p>多餘</p></body></html>')
    expect(md).toBe('內文')
  })
  it('Google 文件的 <b style="font-weight:normal"> 不算粗體', () => {
    const md = htmlToMarkdown('<b style="font-weight:normal"><p>正文</p></b>')
    expect(md).not.toContain('**')
    expect(md).toContain('正文')
  })
  it('去掉 style 與 script', () => {
    expect(htmlToMarkdown('<style>p{}</style><script>alert(1)</script><p>x</p>')).toBe('x')
  })
})
