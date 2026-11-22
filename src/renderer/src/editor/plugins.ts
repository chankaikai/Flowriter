import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'

/* ------------------------------------------------------------------ */
/* 平滑滾動：打字機模式與查找跳轉共用，用緩動逼近目標而非瞬移          */
/* ------------------------------------------------------------------ */
let glideFrame = 0
let glideTarget = 0
export function glide(el: HTMLElement, to: number): void {
  glideTarget = Math.max(0, Math.min(to, el.scrollHeight - el.clientHeight))
  cancelAnimationFrame(glideFrame)
  const step = () => {
    const d = glideTarget - el.scrollTop
    if (Math.abs(d) < 0.5) {
      el.scrollTop = glideTarget
      return
    }
    el.scrollTop += d * 0.18
    glideFrame = requestAnimationFrame(step)
  }
  step()
}

/* ------------------------------------------------------------------ */
/* 文檔變更訊號：只比對 doc 物件身分（O(1)），不序列化 Markdown。       */
/* 序列化留給防抖後的同步 / 儲存，避免大文件每次輸入都付出完整成本。   */
/* ------------------------------------------------------------------ */
export const makeChangePlugin = (onChange: () => void) =>
  $prose(
    () =>
      new Plugin({
        key: new PluginKey('inkwell-change'),
        view: () => ({
          update(view, prev) {
            if (prev.doc !== view.state.doc) onChange()
          }
        })
      })
  )

/* ------------------------------------------------------------------ */
/* 聚焦模式：標記游標所在的頂層區塊，其餘由 CSS 淡化                     */
/* ------------------------------------------------------------------ */
export const activeBlockPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey('inkwell-active-block'),
      props: {
        decorations(state) {
          const { $from } = state.selection
          if ($from.depth < 1) return null
          const start = $from.before(1)
          const node = state.doc.nodeAt(start)
          if (!node) return null
          return DecorationSet.create(state.doc, [
            Decoration.node(start, start + node.nodeSize, { class: 'is-active-block' })
          ])
        }
      }
    })
)

/* ------------------------------------------------------------------ */
/* 打字機模式：游標行保持在視窗約 40% 的位置                            */
/* ------------------------------------------------------------------ */
export const typewriterPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey('inkwell-typewriter'),
      view: () => ({
        update(view, prev) {
          if (!document.body.classList.contains('typewriter')) return
          if (!view.hasFocus()) return
          if (prev.selection.eq(view.state.selection) && prev.doc.eq(view.state.doc)) return
          const sc = view.dom.closest('.editor-scroll') as HTMLElement | null
          if (!sc) return
          try {
            const c = view.coordsAtPos(view.state.selection.head)
            const r = sc.getBoundingClientRect()
            const offset = c.top - (r.top + r.height * 0.4)
            if (Math.abs(offset) > 4) glide(sc, sc.scrollTop + offset)
          } catch {
            /* 位置尚未渲染 */
          }
        }
      })
    })
)

/* ------------------------------------------------------------------ */
/* 查找 / 替換                                                          */
/* ------------------------------------------------------------------ */
interface Match {
  from: number
  to: number
}
interface SearchState {
  query: string
  cs: boolean
  matches: Match[]
  current: number
}

export const searchKey = new PluginKey<SearchState>('inkwell-search')

function findMatches(doc: PMNode, query: string, cs: boolean): Match[] {
  const out: Match[] = []
  if (!query) return out
  const q = cs ? query : query.toLowerCase()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, undefined, '￼')
    const hay = cs ? text : text.toLowerCase()
    let i = 0
    while ((i = hay.indexOf(q, i)) !== -1) {
      out.push({ from: pos + 1 + i, to: pos + 1 + i + q.length })
      i += q.length || 1
    }
    return false
  })
  return out
}

export const searchPlugin = $prose(
  () =>
    new Plugin<SearchState>({
      key: searchKey,
      state: {
        init: () => ({ query: '', cs: false, matches: [], current: -1 }),
        apply(tr, val, _old, next) {
          const meta = tr.getMeta(searchKey) as
            | { query?: string; cs?: boolean; current?: number }
            | undefined
          if (meta) {
            const query = meta.query ?? val.query
            const cs = meta.cs ?? val.cs
            const matches = findMatches(next.doc, query, cs)
            let current = meta.current ?? (matches.length ? 0 : -1)
            if (current >= matches.length) current = matches.length - 1
            return { query, cs, matches, current }
          }
          if (tr.docChanged && val.query) {
            // 大文件：不重掃全文，只把既有結果映射到新位置，保持輸入流暢
            if (next.doc.content.size > 300_000) {
              const mapped = val.matches
                .map((m) => ({ from: tr.mapping.map(m.from, 1), to: tr.mapping.map(m.to, -1) }))
                .filter((m) => m.to > m.from)
              return { ...val, matches: mapped, current: Math.min(val.current, mapped.length - 1) }
            }
            const matches = findMatches(next.doc, val.query, val.cs)
            return { ...val, matches, current: Math.min(val.current, matches.length - 1) }
          }
          return val
        }
      },
      props: {
        decorations(state) {
          const s = searchKey.getState(state)
          if (!s || !s.matches.length) return null
          return DecorationSet.create(
            state.doc,
            s.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class: i === s.current ? 'search-hit current' : 'search-hit'
              })
            )
          )
        }
      }
    })
)

export interface SearchInfo {
  total: number
  current: number
}

export function searchInfo(view: EditorView): SearchInfo {
  const s = searchKey.getState(view.state)
  return { total: s?.matches.length ?? 0, current: s ? s.current : -1 }
}

function reveal(view: EditorView): void {
  const s = searchKey.getState(view.state)
  if (!s || s.current < 0) return
  const m = s.matches[s.current]
  const sc = view.dom.closest('.editor-scroll') as HTMLElement | null
  if (!sc || !m) return
  try {
    const c = view.coordsAtPos(m.from)
    const r = sc.getBoundingClientRect()
    if (c.top < r.top + 80 || c.bottom > r.bottom - 80) {
      glide(sc, sc.scrollTop + (c.top - r.top) - r.height * 0.35)
    }
  } catch {
    /* ignore */
  }
}

export function searchSet(view: EditorView, query: string, cs: boolean): SearchInfo {
  const matches = findMatches(view.state.doc, query, cs)
  const head = view.state.selection.from
  let cur = matches.findIndex((m) => m.from >= head)
  if (cur < 0) cur = matches.length ? 0 : -1
  view.dispatch(view.state.tr.setMeta(searchKey, { query, cs, current: cur }))
  reveal(view)
  return searchInfo(view)
}

export function searchStep(view: EditorView, dir: 1 | -1): SearchInfo {
  const s = searchKey.getState(view.state)
  if (!s || !s.matches.length) return searchInfo(view)
  const n = s.matches.length
  const next = (s.current + dir + n) % n
  view.dispatch(view.state.tr.setMeta(searchKey, { current: next }))
  reveal(view)
  return searchInfo(view)
}

export function searchReplaceCurrent(view: EditorView, text: string): SearchInfo {
  const s = searchKey.getState(view.state)
  if (!s || s.current < 0) return searchInfo(view)
  const m = s.matches[s.current]
  const tr = view.state.tr.insertText(text, m.from, m.to)
  view.dispatch(tr)
  reveal(view)
  return searchInfo(view)
}

export function searchReplaceAll(view: EditorView, text: string): SearchInfo {
  const s = searchKey.getState(view.state)
  if (!s || !s.matches.length) return searchInfo(view)
  const tr = view.state.tr
  for (let i = s.matches.length - 1; i >= 0; i--) {
    tr.insertText(text, s.matches[i].from, s.matches[i].to)
  }
  view.dispatch(tr)
  return searchInfo(view)
}

export function searchClear(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(searchKey, { query: '' }))
}

export function selectMatch(view: EditorView): void {
  const s = searchKey.getState(view.state)
  if (!s || s.current < 0) return
  const m = s.matches[s.current]
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)))
}

/* ------------------------------------------------------------------ */
/* [[雙向連結]]：把文字中的 [[名稱]] 標成連結樣式，點擊由 App 處理      */
/* ------------------------------------------------------------------ */
const WIKI_RE = /\[\[([^[\]\n]{1,120})\]\]/g
const WIKI_MAX_DOC = 400_000

function wikiDecos(doc: PMNode): DecorationSet {
  if (doc.content.size > WIKI_MAX_DOC) return DecorationSet.empty
  const list: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') return false
    if (!node.isText || !node.text) return
    if (node.marks.some((m) => m.type.name === 'inlineCode')) return
    WIKI_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKI_RE.exec(node.text))) {
      list.push(
        Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
          class: 'wikilink',
          'data-wiki': m[1].split('|')[0].trim()
        })
      )
    }
  })
  return DecorationSet.create(doc, list)
}

export const wikiPlugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey('inkwell-wiki'),
      state: {
        init: (_c, st) => wikiDecos(st.doc),
        apply: (tr, old) => (tr.docChanged ? wikiDecos(tr.doc) : old)
      },
      props: {
        decorations(state) {
          return this.getState(state)
        }
      }
    })
)
