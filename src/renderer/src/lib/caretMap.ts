/**
 * 所見即所得 ⇄ 源碼 切換時，游標要回到同一個位置。
 * 兩邊座標不同（ProseMirror 位置 vs. .md 字元），所以用「文字錨點」對應：
 * 錨點 = 游標所在行／段落的開頭文字（遇到 Markdown 符號就截斷）＋它是第幾個含有這段文字的行（ordinal）＋游標離錨點的偏移。
 * 找不到時退回「全文比例」。純函式，方便測試。
 */
export interface CaretInfo {
  snippet: string
  ordinal: number
  /** 游標離錨點開頭幾個字元（≥0） */
  col: number
  /** 游標在全文的比例（0～1），錨點找不到時用 */
  frac: number
}

const MARK = /[*_~`\\[\]!<>|]/

/** 去掉行首的引用、標題、清單、勾選框符號，得到「純文字」開頭 */
export function stripMd(line: string): string {
  let s = line.replace(/^\s{0,3}/, '')
  for (let i = 0; i < 4 && /^>\s?/.test(s); i++) s = s.replace(/^>\s?/, '')
  s = s.replace(/^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d{1,9}[.)]\s+)/, '')
  return s
}

/** 取開頭一小段（遇到 Markdown 符號就停），太短就不當錨點 */
export function snippetOf(text: string, max = 24): string {
  const t = text.replace(/^\s+/, '')
  let n = 0
  while (n < t.length && n < max && !MARK.test(t[n])) n++
  const s = t.slice(0, n).replace(/\s+$/, '')
  return s.length >= 2 ? s : ''
}

/** 在「第 ordinal 個含有 snippet 的項目」裡定位；items 是每行（或每段）的純文字。回傳項目編號與 snippet 在該項目內的位置，找不到回傳 null */
export function locate(items: string[], snippet: string, ordinal: number): { item: number; at: number } | null {
  if (!snippet) return null
  let k = 0
  for (let i = 0; i < items.length; i++) {
    const at = items[i].indexOf(snippet)
    if (at < 0) continue
    if (k === ordinal) return { item: i, at }
    k++
  }
  return null
}

/** 目標項目之前有幾個項目含有 snippet */
export function ordinalOf(items: string[], upTo: number, snippet: string): number {
  let k = 0
  for (let i = 0; i < upTo && i < items.length; i++) if (items[i].includes(snippet)) k++
  return k
}
