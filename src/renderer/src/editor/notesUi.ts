/**
 * 頁邊便條圖示：在便條引文的結尾放一個小圖示；滑鼠移上去時，把整段引文標成高亮，點擊開啟便條面板。
 * 只加畫面裝飾，不改文件內容；資料由 App 透過 setNotesMarks 交進來。
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

export interface NoteMark { id: string; quote: string; text: string; done?: boolean }

interface St { notes: NoteMark[]; hover: string | null; deco: DecorationSet }
const key = new PluginKey<St>('inkwell-notes-marks')
const bridge: { onOpen: (id: string) => void } = { onOpen: () => {} }
const MAX = 200

/** 在文件裡找 text 第一次出現的範圍（只比對單一文字區塊內）。 */
export function findQuoteRange(doc: PMNode, quote: string): { from: number; to: number } | null {
  const needle = quote.trim().slice(0, 80)
  if (!needle) return null
  let hit: { from: number; to: number } | null = null
  doc.descendants((node, pos) => {
    if (hit) return false
    if (!node.isTextblock) return true
    let str = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) map.push(pos + 1 + offset + i)
        str += child.text
      } else {
        map.push(pos + 1 + offset)
        str += '￼'
      }
    })
    const at = str.indexOf(needle)
    if (at >= 0) hit = { from: map[at], to: (map[at + needle.length - 1] ?? map[at]) + 1 }
    return false
  })
  return hit
}

function icon(n: NoteMark): HTMLElement {
  const b = document.createElement('span')
  b.className = 'note-mark' + (n.done ? ' done' : '')
  b.contentEditable = 'false'
  b.dataset.note = n.id
  b.title = n.text.length > 60 ? n.text.slice(0, 60) + '…' : n.text
  b.textContent = '✎'
  b.addEventListener('mousedown', (e) => e.preventDefault())
  b.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    bridge.onOpen(n.id)
  })
  return b
}

function build(doc: PMNode, notes: NoteMark[], hover: string | null): DecorationSet {
  const decos: Decoration[] = []
  for (const n of notes.slice(0, MAX)) {
    const r = findQuoteRange(doc, n.quote)
    if (!r) continue
    if (hover === n.id) decos.push(Decoration.inline(r.from, r.to, { class: 'note-hl' }))
    decos.push(Decoration.widget(r.to, () => {
      const el = icon(n)
      el.addEventListener('mouseenter', () => setHover(el, n.id))
      el.addEventListener('mouseleave', () => setHover(el, null))
      return el
    }, { side: 1, key: `note-${n.id}-${hover === n.id ? 1 : 0}-${n.done ? 1 : 0}`, ignoreSelection: true }))
  }
  return DecorationSet.create(doc, decos)
}

let activeView: EditorView | null = null
function setHover(_el: HTMLElement, id: string | null): void {
  const v = activeView
  if (!v) return
  v.dispatch(v.state.tr.setMeta(key, { hover: id }).setMeta('addToHistory', false))
}

export const notesMarksPlugin = $prose(() => new Plugin<St>({
  key,
  view: (v) => { activeView = v; return { destroy: () => { if (activeView === v) activeView = null } } },
  state: {
    init: (_c, s) => ({ notes: [], hover: null, deco: DecorationSet.create(s.doc, []) }),
    apply: (tr, old) => {
      const meta = tr.getMeta(key) as { notes?: NoteMark[]; hover?: string | null } | undefined
      if (!meta && !tr.docChanged) return old
      const notes = meta?.notes ?? old.notes
      const hover = meta && 'hover' in meta ? meta.hover ?? null : meta?.notes ? null : old.hover
      return { notes, hover, deco: build(tr.doc, notes, hover) }
    }
  },
  props: { decorations: (s) => key.getState(s)?.deco }
}))

export function setNotesMarks(view: EditorView, notes: NoteMark[], onOpen: (id: string) => void): void {
  bridge.onOpen = onOpen
  view.dispatch(view.state.tr.setMeta(key, { notes }).setMeta('addToHistory', false))
}
