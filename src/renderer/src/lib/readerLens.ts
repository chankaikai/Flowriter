/**
 * 讀者視角（純函式）：找出
 *  1. 首次出現、文中沒有解釋的縮寫（全大寫，2–8 字元）
 *  2. 「轉折缺少鋪墊」的段落：以轉折／因果連接詞開頭，但前面沒有可以承接的正文
 * 只回傳範圍與提示文字，不改文件。
 */
const SKIP = new Set(['OK', 'AM', 'PM', 'TV', 'PDF', 'URL', 'HTML', 'CSS', 'JSON', 'XML', 'USB', 'APP', 'VS', 'ID', 'PC', 'DIY', 'FAQ', 'TODO', 'NOTE', 'TIP'])
const ABBR = /(?<![A-Za-z0-9_])[A-Z][A-Z0-9]{1,7}(?![A-Za-z0-9_])/g

export interface AbbrHit { start: number; end: number; term: string }

/** 單段文字裡的縮寫（不判斷是否第一次、是否已解釋） */
export function abbrevsIn(text: string): AbbrHit[] {
  const out: AbbrHit[] = []
  ABBR.lastIndex = 0
  for (let m: RegExpExecArray | null; (m = ABBR.exec(text)); ) {
    if (SKIP.has(m[0]) || /^\d+$/.test(m[0])) continue
    out.push({ start: m.index, end: m.index + m[0].length, term: m[0] })
  }
  return out
}

/** 全文裡已被解釋或已建立連結的縮寫：`TERM（…）`、`TERM(…)`、`(TERM)`、`（TERM）`、`[[TERM]]` */
export function explainedTerms(full: string): Set<string> {
  const set = new Set<string>()
  for (const m of full.matchAll(/(?<![A-Za-z0-9_])([A-Z][A-Z0-9]{1,7})\s*[（(]/g)) set.add(m[1])
  for (const m of full.matchAll(/[（(]\s*([A-Z][A-Z0-9]{1,7})\s*[)）]/g)) set.add(m[1])
  for (const m of full.matchAll(/\[\[([^\]]+)\]\]/g)) set.add(m[1].trim())
  return set
}

const CONNECTIVE = /^\s*(但是|但|然而|不過|不过|可是|相反|反之|因此|所以|於是|于是|從而|从而|換言之|换言之|However|But|Therefore|Thus|Hence|Yet)(?![A-Za-z])/i

export interface BlockInfo { type: 'paragraph' | 'other'; text: string }

/** 回傳「轉折缺少鋪墊」的區塊序號 */
export function jumpyBlocks(blocks: BlockInfo[]): number[] {
  const out: number[] = []
  blocks.forEach((b, i) => {
    if (b.type !== 'paragraph' || !CONNECTIVE.test(b.text)) return
    const prev = blocks[i - 1]
    if (!prev || prev.type !== 'paragraph' || prev.text.trim().length < 12) out.push(i)
  })
  return out
}

/** 全文第一次出現且未被解釋的縮寫，依出現順序。blocks 內每個元素是一個文字區塊的純文字。 */
export function firstUnexplained(texts: string[]): { block: number; hit: AbbrHit }[] {
  const explained = explainedTerms(texts.join('\n'))
  const seen = new Set<string>()
  const out: { block: number; hit: AbbrHit }[] = []
  texts.forEach((t, block) => {
    for (const hit of abbrevsIn(t)) {
      if (seen.has(hit.term)) continue
      seen.add(hit.term)
      if (!explained.has(hit.term)) out.push({ block, hit })
    }
  })
  return out
}
