/**
 * 輪播圖切卡（純函式）。切法：
 *  1. 文中有 `---`（單獨一行的水平線，代碼圍欄內不算）→ 每條水平線切一張；
 *  2. 否則每個 `## ` 二級標題開一張新卡，標題之前的內容（H1 與前言）是封面。
 * 開頭的 front matter 先去掉。空的段落不產生卡片。
 */
export interface Card { md: string; index: number; total: number; cover: boolean; title: string }

export const CARD_LIMIT = 30
export type Ratio = '3:4' | '4:5'
export const CARD_SIZE: Record<Ratio, { width: number; height: number }> = { '3:4': { width: 600, height: 800 }, '4:5': { width: 600, height: 750 } }

function stripFrontMatter(md: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/.exec(md)
  return m ? md.slice(m[0].length) : md
}

export function splitCards(source: string): Card[] {
  const lines = stripFrontMatter(source.replace(/\r\n?/g, '\n')).split('\n')
  const parts: string[][] = [[]]
  let fence: string | null = null
  // 第一遍：標出代碼圍欄外的 --- 行
  const inFence: boolean[] = []
  for (const l of lines) {
    const m = /^\s*(```+|~~~+)/.exec(l)
    if (m) {
      if (!fence) fence = m[1][0]
      else if (m[1][0] === fence) fence = null
      inFence.push(true)
      continue
    }
    inFence.push(fence !== null)
  }
  // 水平線；`---` 緊接在文字下一行是 setext 標題的底線，不算
  const isHr = (i: number) => !inFence[i] && /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) && !(/^\s*-{3,}\s*$/.test(lines[i]) && i > 0 && /\S/.test(lines[i - 1]) && !inFence[i - 1])
  const useHr = lines.some((_, i) => isHr(i))
  lines.forEach((l, i) => {
    if (useHr) {
      if (isHr(i)) parts.push([])
      else parts[parts.length - 1].push(l)
    } else if (!inFence[i] && /^##\s+\S/.test(l) && parts[parts.length - 1].some((x) => x.trim())) {
      parts.push([l])
    } else parts[parts.length - 1].push(l)
  })
  const mds = parts.map((p) => p.join('\n').trim()).filter(Boolean).slice(0, CARD_LIMIT)
  return mds.map((md, index) => {
    const h = /^#{1,6}\s+(.+?)\s*#*\s*$/m.exec(md)
    return { md, index, total: mds.length, cover: index === 0 && /^#\s+\S/m.test(md), title: h ? h[1] : '' }
  })
}

export function cardFileName(base: string, i: number, total: number): string {
  const w = String(total).length < 2 ? 2 : String(total).length
  return `${base}-${String(i + 1).padStart(w, '0')}.png`
}
