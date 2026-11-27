/**
 * Markdown AST（mdast）轉換：把 Milkdown 預設會「跳脫壞掉」的語法換成可以原樣往返的節點。
 * 用到的技巧：行內 html 節點在序列化時會原樣輸出，不會被加上反斜線。
 * 這些都是純函式，編輯器與匯出共用。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

type Node = any

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution', 'info', 'danger', 'success', 'question', 'summary', 'quote'] as const
const CALLOUT_RE = new RegExp(`^\\[!(${CALLOUT_TYPES.join('|')})\\]`, 'i')

/**
 * `> [!NOTE]` 提示框：開頭標記換成行內 html 節點，避免被存成 `\[!NOTE]`。
 * 回傳處理的數量（測試用）。
 */
export function calloutTransform(tree: Node): number {
  let n = 0
  const visit = (node: Node): void => {
    if (node.type === 'blockquote') {
      const para = node.children?.[0]
      const first = para?.type === 'paragraph' ? para.children?.[0] : null
      if (first?.type === 'text') {
        const m = CALLOUT_RE.exec(first.value)
        if (m) {
          const rest = first.value.slice(m[0].length)
          const tail: Node[] = para.children.slice(1)
          if (/^\s*\n/.test(rest) || (!rest && tail.length)) {
            // `[!NOTE]` 後面接換行的內文：拆成「標籤段落」＋「內文段落」。
            // 若留在同一段，換行會被 Milkdown 轉成硬換行，存檔就變成 `<br />[!NOTE]`。
            const body = rest.replace(/^\s*\n/, '')
            const bodyKids: Node[] = []
            if (body) bodyKids.push({ type: 'text', value: body })
            bodyKids.push(...tail)
            para.children = [{ type: 'html', value: m[0] }]
            if (bodyKids.length) node.children.splice(1, 0, { type: 'paragraph', children: bodyKids })
          } else {
            const repl: Node[] = [{ type: 'html', value: m[0] }]
            if (rest) repl.push({ type: 'text', value: rest })
            para.children.splice(0, 1, ...repl)
          }
          n++
        }
      }
    }
    node.children?.forEach(visit)
  }
  visit(tree)
  return n
}

/** `{{算式}}` 換成行內 html 節點，避免算式中的 * 被存成 \*。 */
export function calcTransform(tree: Node): number {
  let n = 0
  const re = /\{\{([^{}\n]+)\}\}/g
  const visit = (node: Node): void => {
    if (!node.children) return
    if (node.type === 'code' || node.type === 'inlineCode') return
    const out: Node[] = []
    let changed = false
    for (const c of node.children) {
      if (c.type !== 'text' || !c.value.includes('{{')) {
        visit(c)
        out.push(c)
        continue
      }
      let last = 0
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(c.value))) {
        if (m.index > last) out.push({ type: 'text', value: c.value.slice(last, m.index) })
        out.push({ type: 'html', value: m[0] })
        last = m.index + m[0].length
        changed = true
        n++
      }
      if (last < c.value.length) out.push({ type: 'text', value: c.value.slice(last) })
    }
    if (changed) node.children = out
  }
  visit(tree)
  return n
}

const isFence = (n: Node, re: RegExp) =>
  n?.type === 'paragraph' && n.children?.length === 1 && n.children[0].type === 'text' && re.test(String(n.children[0].value).trim())

/**
 * 雙語對照：
 *   :::bilingual
 *   左欄（原文）
 *   ---
 *   右欄（譯文）
 *   :::
 * 換成 bilingualBlock > [bilingualCol, bilingualCol]。沒有分隔線時右欄為空。
 * 只處理最上層。
 */
export function bilingualTransform(tree: Node): number {
  if (!Array.isArray(tree?.children)) return 0
  const out: Node[] = []
  let n = 0
  const kids = tree.children as Node[]
  for (let i = 0; i < kids.length; i++) {
    if (!isFence(kids[i], /^:::\s*bilingual$/i)) {
      out.push(kids[i])
      continue
    }
    let j = i + 1
    while (j < kids.length && !isFence(kids[j], /^:::$/)) j++
    if (j >= kids.length) {
      out.push(kids[i]) // 沒有結尾，當一般文字
      continue
    }
    const inner = kids.slice(i + 1, j)
    const cut = inner.findIndex((k) => k.type === 'thematicBreak')
    const left = cut < 0 ? inner : inner.slice(0, cut)
    const right = cut < 0 ? [] : inner.slice(cut + 1)
    const fill = (a: Node[]) => (a.length ? a : [{ type: 'paragraph', children: [] }])
    out.push({
      type: 'bilingualBlock',
      data: { hName: 'div', hProperties: { className: ['bilingual'] } },
      children: [
        { type: 'bilingualCol', data: { hName: 'div', hProperties: { className: ['bi-col'] } }, children: fill(left) },
        { type: 'bilingualCol', data: { hName: 'div', hProperties: { className: ['bi-col'] } }, children: fill(right) }
      ]
    })
    n++
    i = j
  }
  tree.children = out
  return n
}
