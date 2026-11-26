/** 估算每個頂層區塊在 .md 原始碼裡的起始行號（渲染模式的行號用），不需要序列化整份文件。 */
export interface LNode {
  type: { name: string }
  childCount: number
  child(i: number): LNode
  textContent: string
  isTextblock?: boolean
  attrs?: Record<string, unknown>
}

const lines = (s: string) => (s ? s.split('\n').length : 1)

export function spanOf(n: LNode): number {
  const name = n.type.name
  if (name === 'code_block' || name === 'math_block') return lines(n.textContent.replace(/\n$/, '')) + 2
  if (name === 'inkwell_front_matter' || name === 'front_matter') return lines(n.textContent) + 2
  if (name === 'heading' || name === 'hr' || name === 'horizontal_rule') return 1
  if (name === 'table') return n.childCount + 1 // 表頭、分隔線、各資料列
  if (n.isTextblock) {
    let extra = 0
    for (let i = 0; i < n.childCount; i++) if (n.child(i).type.name === 'hardbreak' || n.child(i).type.name === 'hard_break') extra++
    return 1 + extra + (n.textContent.match(/\n/g)?.length ?? 0)
  }
  if (n.childCount === 0) return 1
  let total = 0
  for (let i = 0; i < n.childCount; i++) total += spanOf(n.child(i))
  // 引用內段落之間有一條空的「>」行；寬鬆清單項目之間的空行不計（多數是緊湊清單）
  if (name === 'blockquote') total += Math.max(0, n.childCount - 1)
  return Math.max(1, total)
}

/** 回傳每個頂層區塊的起始行號（從 1 起算）。區塊之間以一個空行分隔。 */
export function blockStartLines(doc: LNode): number[] {
  const out: number[] = []
  let line = 1
  for (let i = 0; i < doc.childCount; i++) {
    const n = doc.child(i)
    out.push(line)
    line += spanOf(n) + 1
  }
  return out
}
