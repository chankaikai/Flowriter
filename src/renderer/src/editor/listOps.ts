/**
 * 清單操作：在不刪除內容的前提下切換清單類型（無序 ⇄ 有序 ⇄ 任務），
 * 以及整張清單一起縮排。全部走 ProseMirror 交易，只改節點屬性。
 */
import type { EditorView } from '@milkdown/kit/prose/view'

export type ListKind = 'ul' | 'ol' | 'task'

/** 游標所在位置最內層的清單節點深度；不在清單裡回 -1。 */
function listDepth(view: EditorView): number {
  const { $from } = view.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d).type.name
    if (n === 'bullet_list' || n === 'ordered_list') return d
  }
  return -1
}

/** 把游標所在的整張清單換成指定類型；不在清單內回 false（由呼叫端改走原本的「包成清單」）。 */
export function convertList(view: EditorView, kind: ListKind): boolean {
  const d = listDepth(view)
  if (d < 0) return false
  const { state } = view
  const { $from } = state.selection
  const list = $from.node(d)
  const pos = $from.before(d)
  const schema = state.schema
  const itemType = schema.nodes.list_item
  if (!itemType) return false
  const tr = state.tr

  if (kind === 'task') {
    // 已經全是任務就還原成一般項目，否則全部變成未勾選的任務
    let allTask = true
    list.forEach((it) => { if (it.attrs.checked == null) allTask = false })
    list.forEach((it, off) => {
      tr.setNodeMarkup(pos + 1 + off, itemType, { ...it.attrs, checked: allTask ? null : false })
    })
  } else {
    const target = schema.nodes[kind === 'ul' ? 'bullet_list' : 'ordered_list']
    if (!target) return false
    const ordered = kind === 'ol'
    if (list.type !== target) {
      tr.setNodeMarkup(pos, target, ordered ? { ...(target.spec.attrs?.order ? { order: 1 } : {}) } : {})
      let i = 0
      list.forEach((it, off) => {
        tr.setNodeMarkup(pos + 1 + off, itemType, {
          ...it.attrs,
          label: ordered ? `${i + 1}.` : '•',
          listType: ordered ? 'ordered' : 'bullet',
          // 有序清單沒有任務框：切換時保留勾選屬性無意義，統一清掉
          checked: null
        })
        i++
      })
    } else {
      return true // 已經是這個類型
    }
  }
  view.dispatch(tr.scrollIntoView())
  view.focus()
  return true
}
