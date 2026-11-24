/**
 * 編輯器內的 YAML front matter、腳註與 [TOC]。
 * 三者在 mdast 裡都不是 Milkdown 預設認得的節點：
 *   - front matter 若不處理，`---` 會被當成分隔線 / setext 標題，存檔時內容會被改壞
 *   - 腳註 remark-gfm 會解析成 footnoteReference / footnoteDefinition，預設沒有對應的 schema
 *   - `[TOC]` 預設是普通文字，序列化時還會被跳脫成 `\[TOC]`
 * 這裡用自訂節點讓它們可以原樣往返（Markdown → 編輯器 → Markdown）。
 * 節點名稱都加上 inkwell 前綴，避免與未來預設 preset 的同名節點衝突。
 */
import { $inputRule, $node, $prose, $remark, $view } from '@milkdown/kit/utils'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { calcTransform, calloutTransform, bilingualTransform, CALLOUT_TYPES } from '@/lib/mdTransforms'
import { sortOrder } from '@/lib/tableSort'
import { parseFrontMatter, toggleBool } from '@/lib/frontMatter'
import { collectVars, evaluate, formatNumber } from '@/lib/calc'
import remarkFrontmatter from 'remark-frontmatter'
import { renderMermaid } from '@/lib/mermaid'
import { runUiPlugin } from './runUi'
import { normLock, touchesLocked, type Range } from '@/lib/locks'

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ------------------------------ YAML front matter ------------------------------ */

export const frontMatterRemark = $remark('inkwellFrontmatter', () => remarkFrontmatter as any, ['yaml'] as never)

export const frontMatterNode = $node('inkwell_front_matter', () => ({
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  isolating: true,
  parseDOM: [{ tag: 'pre[data-front-matter]', preserveWhitespace: 'full' as const }],
  toDOM: () => ['pre', { 'data-front-matter': '', class: 'front-matter', spellcheck: 'false' }, ['code', 0]] as any,
  parseMarkdown: {
    match: (n: any) => n.type === 'yaml',
    runner: (state: any, node: any, type: any) => {
      state.openNode(type)
      if (node.value) state.addText(node.value)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (n: any) => n.type.name === 'inkwell_front_matter',
    runner: (state: any, node: any) => {
      state.addNode('yaml', undefined, node.textContent)
    }
  }
}))

/* ------------------------------ 腳註 ------------------------------ */

export const footnoteRefNode = $node('inkwell_fnref', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: { label: { default: '' } },
  parseDOM: [
    { tag: 'sup[data-fn-ref]', getAttrs: (d: any) => ({ label: (d as HTMLElement).dataset.label || '' }) }
  ],
  toDOM: (n: any) =>
    ['sup', { class: 'fn-ref', 'data-fn-ref': '', 'data-label': n.attrs.label }, String(n.attrs.label)] as any,
  parseMarkdown: {
    match: (n: any) => n.type === 'footnoteReference',
    runner: (state: any, node: any, type: any) => {
      state.addNode(type, { label: String(node.label ?? node.identifier ?? '') })
    }
  },
  toMarkdown: {
    match: (n: any) => n.type.name === 'inkwell_fnref',
    runner: (state: any, node: any) => {
      state.addNode('footnoteReference', undefined, undefined, {
        identifier: node.attrs.label,
        label: node.attrs.label
      })
    }
  }
}))

export const footnoteDefNode = $node('inkwell_fndef', () => ({
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  attrs: { label: { default: '' } },
  parseDOM: [
    { tag: 'div[data-fn-def]', getAttrs: (d: any) => ({ label: (d as HTMLElement).dataset.label || '' }) }
  ],
  toDOM: (n: any) =>
    [
      'div',
      { class: 'fn-def', 'data-fn-def': '', 'data-label': n.attrs.label },
      ['span', { class: 'fn-label', contenteditable: 'false' }, String(n.attrs.label)],
      ['div', { class: 'fn-body' }, 0]
    ] as any,
  parseMarkdown: {
    match: (n: any) => n.type === 'footnoteDefinition',
    runner: (state: any, node: any, type: any) => {
      state.openNode(type, { label: String(node.label ?? node.identifier ?? '') })
      state.next(node.children)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (n: any) => n.type.name === 'inkwell_fndef',
    runner: (state: any, node: any) => {
      state.openNode('footnoteDefinition', undefined, { identifier: node.attrs.label, label: node.attrs.label })
      state.next(node.content)
      state.closeNode()
    }
  }
}))

/** 輸入 [^名稱] 時自動變成腳註引用 */
export const footnoteInputRule = $inputRule(
  (ctx) =>
    new InputRule(/\[\^([^\]\s]{1,30})\]$/, (state, match, start, end) => {
      const type = footnoteRefNode.type(ctx)
      return state.tr.replaceWith(start, end, type.create({ label: match[1] }))
    })
)

/** 在游標處插入下一個編號的腳註引用，並在文末補上對應的定義，游標移到定義內。 */
export function insertFootnote(view: EditorView): void {
  const { state } = view
  const ref = state.schema.nodes.inkwell_fnref
  const def = state.schema.nodes.inkwell_fndef
  const para = state.schema.nodes.paragraph
  if (!ref || !def || !para) return
  let max = 0
  state.doc.descendants((n) => {
    if (n.type === def) {
      const k = Number(n.attrs.label)
      if (Number.isFinite(k)) max = Math.max(max, k)
    }
  })
  const label = String(max + 1)
  let tr = state.tr.replaceSelectionWith(ref.create({ label }), false)
  const end = tr.doc.content.size
  tr = tr.insert(end, def.create({ label }, para.create()))
  // 定義內第一個段落的起點：文末 - 定義結尾(1) - 段落結尾(1)
  const inside = tr.doc.content.size - 2
  const $pos = tr.doc.resolve(inside)
  tr = tr.setSelection((state.selection.constructor as any).near($pos)).scrollIntoView()
  view.dispatch(tr)
  view.focus()
}

/** 點引用跳到定義，點定義的編號跳回第一個引用；找不到回傳 false。 */
export function jumpFootnote(view: EditorView, from: HTMLElement): boolean {
  const root = view.dom as HTMLElement
  const refEl = from.closest('.fn-ref') as HTMLElement | null
  const defEl = from.closest('.fn-label') as HTMLElement | null
  let target: HTMLElement | null = null
  if (refEl) {
    target = Array.from(root.querySelectorAll<HTMLElement>('.fn-def')).find((d) => d.dataset.label === refEl.dataset.label) ?? null
  } else if (defEl) {
    const label = (defEl.closest('.fn-def') as HTMLElement | null)?.dataset.label
    target = Array.from(root.querySelectorAll<HTMLElement>('.fn-ref')).find((d) => d.dataset.label === label) ?? null
  }
  if (!target) return false
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  target.classList.remove('fn-flash')
  void target.offsetWidth
  target.classList.add('fn-flash')
  return true
}

/* ------------------------------ [TOC] ------------------------------ */

/** 把整段只有 [TOC] 的段落換成 tocMarker，序列化時再以原始 HTML 節點輸出 `[TOC]`（避免被跳脫）。 */
export const tocRemark = $remark('inkwellToc', () => () => (tree: any) => {
  if (!tree || !Array.isArray(tree.children)) return
  tree.children = tree.children.map((n: any) =>
    n.type === 'paragraph' &&
    n.children?.length === 1 &&
    n.children[0].type === 'text' &&
    /^\[(toc|TOC)\]$/.test(String(n.children[0].value).trim())
      ? { type: 'tocMarker' }
      : n
  )
})

export const tocNode = $node('inkwell_toc', () => ({
  group: 'block',
  atom: true,
  selectable: true,
  parseDOM: [{ tag: 'div[data-toc]' }],
  toDOM: () => ['div', { 'data-toc': '', class: 'md-toc' }] as any,
  parseMarkdown: {
    match: (n: any) => n.type === 'tocMarker',
    runner: (state: any, _node: any, type: any) => {
      state.addNode(type)
    }
  },
  toMarkdown: {
    match: (n: any) => n.type.name === 'inkwell_toc',
    runner: (state: any) => {
      state.addNode('html', undefined, '[TOC]')
    }
  }
}))

const TOC_MAX_DOC = 400_000
interface TocEntry {
  dom: HTMLElement
  render(): void
}
const tocViews = new Set<TocEntry>()

function renderToc(dom: HTMLElement, view: EditorView): void {
  dom.textContent = ''
  const title = document.createElement('div')
  title.className = 'md-toc-title'
  title.textContent = '目錄'
  dom.appendChild(title)
  if (view.state.doc.content.size > TOC_MAX_DOC) {
    const p = document.createElement('div')
    p.className = 'md-toc-empty'
    p.textContent = '文件過大，目錄已停用'
    dom.appendChild(p)
    return
  }
  const items: { level: number; text: string; pos: number }[] = []
  view.state.doc.descendants((n, pos) => {
    if (n.type.name === 'heading') {
      const text = n.textContent.trim()
      if (text) items.push({ level: n.attrs.level as number, text, pos })
      return false
    }
    return true
  })
  if (!items.length) {
    const p = document.createElement('div')
    p.className = 'md-toc-empty'
    p.textContent = '尚無標題'
    dom.appendChild(p)
    return
  }
  const min = Math.min(...items.map((i) => i.level))
  for (const it of items) {
    const a = document.createElement('a')
    a.className = 'md-toc-item'
    a.style.paddingLeft = `${(it.level - min) * 16}px`
    a.dataset.pos = String(it.pos)
    a.textContent = it.text
    dom.appendChild(a)
  }
}

export const tocView = $view(tocNode, () => (_node: any, view: EditorView) => {
  const dom = document.createElement('div')
  dom.className = 'md-toc'
  dom.contentEditable = 'false'
  const entry: TocEntry = { dom, render: () => renderToc(dom, view) }
  dom.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a.md-toc-item') as HTMLElement | null
    if (!a) return
    e.preventDefault()
    const el = view.nodeDOM(Number(a.dataset.pos)) as HTMLElement | null
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })
  tocViews.add(entry)
  entry.render()
  return {
    dom,
    ignoreMutation: () => true,
    stopEvent: (e: Event) => e.type === 'mousedown' && !!(e.target as HTMLElement).closest('a.md-toc-item'),
    destroy: () => {
      tocViews.delete(entry)
    }
  }
})

/** 文件變動後（防抖）重畫所有目錄 */
export const tocRefreshPlugin = $prose(() => {
  let timer = 0
  return new Plugin({
    key: new PluginKey('inkwell-toc-refresh'),
    view: () => ({
      update(view, prev) {
        if (prev.doc === view.state.doc || tocViews.size === 0) return
        window.clearTimeout(timer)
        timer = window.setTimeout(() => tocViews.forEach((t) => t.render()), 250)
      },
      destroy() {
        window.clearTimeout(timer)
      }
    })
  })
})

/** 插入 YAML front matter（已存在則回傳 false）；游標放進去。 */
export function insertFrontMatter(view: EditorView): boolean {
  const { state } = view
  const type = state.schema.nodes.inkwell_front_matter
  if (!type) return false
  if (state.doc.firstChild?.type === type) return false
  const node = type.create(null, state.schema.text('title: \ntags: []'))
  let tr = state.tr.insert(0, node)
  tr = tr.setSelection((state.selection.constructor as any).near(tr.doc.resolve(1 + 'title: '.length))).scrollIntoView()
  view.dispatch(tr)
  view.focus()
  return true
}


/* ------------------------------ 提示框 / 算式 / 雙語（mdast 轉換） ------------------------------ */

export const calloutRemark = $remark('inkwellCallout', () => () => (tree: any) => void calloutTransform(tree))
export const calcRemark = $remark('inkwellCalc', () => () => (tree: any) => void calcTransform(tree))
export const bilingualRemark = $remark('inkwellBilingual', () => () => (tree: any) => void bilingualTransform(tree))

/* ------------------------------ 雙語對照 ------------------------------ */

export const biColNode = $node('inkwell_bi_col', () => ({
  group: 'inkwell_bi',
  content: 'block+',
  isolating: true,
  defining: true,
  parseDOM: [{ tag: 'div.bi-col' }],
  toDOM: () => ['div', { class: 'bi-col' }, 0] as any,
  parseMarkdown: {
    match: (n: any) => n.type === 'bilingualCol',
    runner: (state: any, node: any, type: any) => {
      state.openNode(type).next(node.children).closeNode()
    }
  },
  toMarkdown: {
    match: (n: any) => n.type.name === 'inkwell_bi_col',
    runner: (state: any, node: any) => {
      state.next(node.content)
    }
  }
}))

export const biBlockNode = $node('inkwell_bilingual', () => ({
  group: 'block',
  content: 'inkwell_bi_col inkwell_bi_col',
  isolating: true,
  defining: true,
  parseDOM: [{ tag: 'div.bilingual' }],
  toDOM: () => ['div', { class: 'bilingual' }, 0] as any,
  parseMarkdown: {
    match: (n: any) => n.type === 'bilingualBlock',
    runner: (state: any, node: any, type: any) => {
      state.openNode(type).next(node.children).closeNode()
    }
  },
  toMarkdown: {
    match: (n: any) => n.type.name === 'inkwell_bilingual',
    runner: (state: any, node: any) => {
      state.addNode('html', undefined, ':::bilingual')
      node.forEach((col: any, _o: number, i: number) => {
        if (i === 1) state.addNode('thematicBreak')
        state.next(col.content)
      })
      state.addNode('html', undefined, ':::')
    }
  }
}))

export const BILINGUAL_SNIPPET = ':::bilingual\n\n原文\n\n---\n\n譯文\n\n:::'

/* ------------------------------ 提示框裝飾（只加 class，不動文件） ------------------------------ */

const CALLOUT_LABEL: Record<string, string> = {
  note: '備註', tip: '提示', important: '重要', warning: '警告', caution: '注意',
  info: '資訊', danger: '危險', success: '成功', question: '疑問'
}
const CALLOUT_RE = new RegExp(`^\\[!(${CALLOUT_TYPES.join('|')})\\]$`, 'i')

export const calloutPlugin = $prose(() => {
  const key = new PluginKey('inkwell-callout')
  return new Plugin({
    key,
    state: {
      init: (_c, state) => build(state.doc),
      apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old)
    },
    props: { decorations: (state) => key.getState(state) }
  })
  function build(doc: any): DecorationSet {
    const decos: Decoration[] = []
    doc.descendants((node: any, pos: number) => {
      if (node.type.name !== 'blockquote') return true
      const para = node.firstChild
      const atom = para?.firstChild
      if (para?.type.name === 'paragraph' && atom?.type.name === 'html' && CALLOUT_RE.test(String(atom.attrs.value))) {
        const type = String(atom.attrs.value).slice(2, -1).toLowerCase()
        decos.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: `glass-callout callout-${type}`,
            'data-callout-label': CALLOUT_LABEL[type] || type
          })
        )
        decos.push(Decoration.node(pos + 1 + 1, pos + 1 + 1 + atom.nodeSize, { class: 'callout-tag' }))
      }
      return false
    })
    return DecorationSet.create(doc, decos)
  }
})

/* ------------------------------ 行內算式 {{a * b}}（只顯示結果，不寫進檔案） ------------------------------ */

const CALC_MAX_DOC = 300_000

export const calcPlugin = $prose(() => {
  const key = new PluginKey('inkwell-calc')
  let timer = 0
  const compute = (doc: any): DecorationSet => {
    if (doc.content.size > CALC_MAX_DOC) return DecorationSet.empty
    const lines: string[] = []
    doc.descendants((n: any) => {
      if (n.type.name === 'paragraph') lines.push(n.textContent)
      return true
    })
    const vars = collectVars(lines)
    const decos: Decoration[] = []
    doc.descendants((n: any, pos: number) => {
      const expr =
        n.type.name === 'html' && /^\{\{[^{}]+\}\}$/.test(String(n.attrs.value))
          ? String(n.attrs.value).slice(2, -2)
          : null
      if (expr == null) return true
      const v = evaluate(expr, vars)
      if (v == null) return false
      decos.push(
        Decoration.widget(
          pos + n.nodeSize,
          () => {
            const el = document.createElement('span')
            el.className = 'calc-result'
            el.textContent = `= ${formatNumber(v)}`
            return el
          },
          { side: 1, key: `calc-${pos}-${v}` }
        )
      )
      return false
    })
    return DecorationSet.create(doc, decos)
  }
  return new Plugin({
    key,
    state: {
      init: (_c, state) => compute(state.doc),
      apply(tr, old) {
        const meta = tr.getMeta(key)
        if (meta) return meta as DecorationSet
        return tr.docChanged ? old.map(tr.mapping, tr.doc) : old
      }
    },
    props: { decorations: (state) => key.getState(state) },
    view: () => ({
      update(view, prev) {
        if (prev.doc === view.state.doc) return
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          if (view.isDestroyed) return
          view.dispatch(view.state.tr.setMeta(key, compute(view.state.doc)).setMeta('addToHistory', false))
        }, 400)
      },
      destroy: () => window.clearTimeout(timer)
    })
  })
})

/* ------------------------------ 腳註懸浮預覽 ------------------------------ */

export const footnoteTipPlugin = $prose(() => {
  let tip: HTMLElement | null = null
  const hide = () => {
    tip?.remove()
    tip = null
  }
  return new Plugin({
    key: new PluginKey('inkwell-fn-tip'),
    props: {
      handleDOMEvents: {
        mouseover(view, e) {
          const el = (e.target as HTMLElement)?.closest?.('.fn-ref') as HTMLElement | null
          if (!el) return false
          const label = el.dataset.label
          let text = ''
          view.state.doc.descendants((n: any) => {
            if (n.type.name === 'inkwell_fndef' && String(n.attrs.label) === label) {
              text = n.textContent
              return false
            }
            return true
          })
          if (!text) return false
          hide()
          tip = document.createElement('div')
          tip.className = 'fn-tip'
          tip.textContent = text.length > 240 ? text.slice(0, 240) + '…' : text
          document.body.appendChild(tip)
          const r = el.getBoundingClientRect()
          tip.style.left = `${Math.min(r.left, window.innerWidth - 320)}px`
          tip.style.top = `${r.bottom + 6}px`
          return false
        },
        mouseout(_v, e) {
          if ((e.target as HTMLElement)?.closest?.('.fn-ref')) hide()
          return false
        }
      }
    },
    view: () => ({ destroy: hide })
  })
})

/* ------------------------------ 任務跳轉 / 表格排序（都是一般 transaction，可復原） ------------------------------ */

export function gotoTask(view: EditorView, text: string): boolean {
  let found = -1
  view.state.doc.descendants((n: any, pos: number) => {
    if (found >= 0) return false
    if (n.type.name === 'list_item' && n.attrs.checked != null && n.textContent.trim() === text.trim()) {
      found = pos
      return false
    }
    return true
  })
  if (found < 0) return false
  const sel = (view.state.selection.constructor as any).near(view.state.doc.resolve(found + 2))
  view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
  view.focus()
  return true
}

/** 依游標所在欄排序表格資料列（表頭不動）。 */
export function sortTable(view: EditorView, dir: 'asc' | 'desc'): boolean {
  const { $from } = view.state.selection
  let tableDepth = -1
  let col = 0
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (/^table_(cell|header)$/.test(n.type.name)) col = $from.index(d - 1)
    if (n.type.name === 'table') {
      tableDepth = d
      break
    }
  }
  if (tableDepth < 0) return false
  const table = $from.node(tableDepth)
  const pos = $from.before(tableDepth)
  if (table.childCount < 3) return false
  const rows: any[] = []
  for (let i = 1; i < table.childCount; i++) rows.push(table.child(i))
  const keys = rows.map((r) => (r.maybeChild(col)?.textContent ?? '').trim())
  const order = sortOrder(keys, dir)
  if (order.every((v, i) => v === i)) return true
  const next = table.type.create(table.attrs, [table.child(0), ...order.map((i) => rows[i])], table.marks)
  view.dispatch(view.state.tr.replaceWith(pos, pos + table.nodeSize, next).scrollIntoView())
  view.focus()
  return true
}

/** 在文件裡找第一處包含 text 的文字並選取（用來從診斷結果、朗讀跳到對應位置）。 */
export function gotoText(view: EditorView, text: string, from = 0): boolean {
  const needle = text.trim()
  if (!needle) return false
  let hit: { from: number; to: number } | null = null
  view.state.doc.descendants((node: any, pos: number) => {
    if (hit) return false
    if (!node.isTextblock) return true
    let str = ''
    const map: number[] = []
    node.forEach((child: any, offset: number) => {
      if (child.isText) {
        for (let i = 0; i < child.text.length; i++) map.push(pos + 1 + offset + i)
        str += child.text
      } else {
        map.push(pos + 1 + offset)
        str += '\ufffc'
      }
    })
    const at = str.indexOf(needle.length > 80 ? needle.slice(0, 80) : needle)
    if (at >= 0 && pos + 1 + at >= from) {
      const len = Math.min(needle.length, 80)
      hit = { from: map[at], to: (map[at + len - 1] ?? map[at]) + 1 }
    }
    return false
  })
  if (!hit) return false
  const h = hit as { from: number; to: number }
  const TS = (view.state.selection.constructor as any)
  const sel = (TS as any).create ? TS.create(view.state.doc, h.from, h.to) : TS.near(view.state.doc.resolve(h.from))
  view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
  return true
}

/** 從游標所在的段落開始到文末的純文字（每個區塊一行）。 */
export function textFromCaret(view: EditorView): string {
  const { doc, selection } = view.state
  const start = selection.$from.start(Math.min(1, selection.$from.depth)) - (selection.$from.depth ? 1 : 0)
  const parts: string[] = []
  doc.nodesBetween(Math.max(0, start), doc.content.size, (node: any) => {
    if (node.isTextblock) {
      if (node.type.name !== 'inkwell_front_matter' && !node.type.spec.code) parts.push(node.textContent)
      return false
    }
    return true
  })
  return parts.join('\n')
}

/* ------------------------------ 段落權重（只加 class，由 CSS 決定要不要顯示） ------------------------------ */

export const weightPlugin = $prose(() => {
  const key = new PluginKey('inkwell-weight')
  const build = (doc: any): DecorationSet => {
    const lens: number[] = []
    doc.forEach((n: any) => lens.push(n.type.name === 'paragraph' ? n.textContent.length : 0))
    const sorted = lens.filter((n) => n > 0).sort((a, b) => a - b)
    if (sorted.length < 4) return DecorationSet.empty
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
    const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)]
    const decos: Decoration[] = []
    let pos = 0
    doc.forEach((n: any, _o: number, i: number) => {
      const len = lens[i]
      if (len > 0) {
        const w = 1 + cuts.filter((c) => len > c).length // 1..5
        decos.push(Decoration.node(pos, pos + n.nodeSize, { class: `pw pw-${w}` }))
      }
      pos += n.nodeSize
    })
    return DecorationSet.create(doc, decos)
  }
  let timer = 0
  return new Plugin({
    key,
    state: {
      init: (_c, st) => build(st.doc),
      apply(tr, old) {
        const meta = tr.getMeta(key)
        if (meta) return meta as DecorationSet
        return tr.docChanged ? old.map(tr.mapping, tr.doc) : old
      }
    },
    props: { decorations: (st) => key.getState(st) },
    view: () => ({
      update(view, prev) {
        if (prev.doc === view.state.doc || !document.body.classList.contains('show-weight')) return
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, build(view.state.doc)).setMeta('addToHistory', false))
        }, 600)
      },
      destroy: () => window.clearTimeout(timer)
    })
  })
})

/* ------------------------------ front matter 徽章（畫面裝飾；布林可點擊切換） ------------------------------ */

export const frontMatterBadgePlugin = $prose(() => {
  const key = new PluginKey('inkwell-fm-badges')
  return new Plugin({
    key,
    props: {
      decorations(state) {
        const first = state.doc.firstChild
        if (!first || first.type.name !== 'inkwell_front_matter') return null
        const fields = parseFrontMatter(first.textContent)
        if (!fields.length) return null
        return DecorationSet.create(state.doc, [
          Decoration.widget(
            first.nodeSize,
            (view) => {
              const box = document.createElement('div')
              box.className = 'fm-badges'
              box.contentEditable = 'false'
              for (const f of fields) {
                const chip = document.createElement('span')
                chip.className = `fm-chip fm-${f.kind}`
                if (f.kind === 'bool') {
                  chip.textContent = `${f.key}: ${f.value ? '是' : '否'}`
                  chip.classList.toggle('on', f.value === true)
                  chip.title = '點擊切換'
                  chip.addEventListener('mousedown', (e) => {
                    e.preventDefault()
                    const cur = view.state.doc.firstChild
                    if (!cur || cur.type.name !== 'inkwell_front_matter') return
                    const next = toggleBool(cur.textContent, f.key)
                    if (next == null) return
                    const tr = view.state.tr.replaceWith(1, 1 + cur.content.size, view.state.schema.text(next))
                    view.dispatch(tr)
                  })
                } else if (f.kind === 'list') {
                  chip.textContent = `${f.key}: ${(f.items || []).map((t) => '#' + t).join(' ')}`
                } else {
                  chip.textContent = `${f.key}: ${String(f.value)}`
                }
                box.appendChild(chip)
              }
              return box
            },
            { side: -1, key: 'fm-' + fields.map((f) => f.key + String(f.value)).join('|'), ignoreSelection: true }
          )
        ])
      }
    }
  })
})

/* ------------------------------ Mermaid 即時渲染 ------------------------------ */
// 不依賴 Crepe 的預覽 API：在 language=mermaid 的代碼塊後面插入唯讀的圖表 widget。
// 只是裝飾（Decoration），不會進入文件內容，所以不影響儲存出來的 Markdown。

const mermaidCache = new Map<string, HTMLElement>()
const mermaidTimers = new Map<string, number>()

function mermaidWidget(code: string): HTMLElement {
  const dark = document.documentElement.dataset.tone === 'dark'
  const key = `${dark ? 'd' : 'l'}|${code}`
  const hit = mermaidCache.get(key)
  if (hit) return hit
  const el = document.createElement('div')
  el.className = 'mermaid-preview'
  el.contentEditable = 'false'
  el.textContent = '圖表渲染中…'
  mermaidCache.set(key, el)
  if (mermaidCache.size > 60) {
    const first = mermaidCache.keys().next().value
    if (first !== undefined) mermaidCache.delete(first)
  }
  // 打字時每個按鍵都會重建裝飾；延後 350ms 再真正渲染，避免狂跑 mermaid
  window.clearTimeout(mermaidTimers.get(key))
  mermaidTimers.set(
    key,
    window.setTimeout(() => {
      mermaidTimers.delete(key)
      renderMermaid(code, dark)
        .then((svg) => {
          el.innerHTML = svg
        })
        .catch((e: unknown) => {
          el.classList.add('err')
          el.textContent = '圖表語法有誤：' + String((e as Error)?.message ?? e).split('\n')[0].slice(0, 120)
        })
    }, 350)
  )
  return el
}

const mermaidKey = new PluginKey('inkwell-mermaid')
function buildMermaid(doc: import('@milkdown/kit/prose/model').Node): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    if (String(node.attrs.language ?? '').toLowerCase() !== 'mermaid') return
    const code = node.textContent
    if (!code.trim()) return
    decos.push(Decoration.widget(pos + node.nodeSize, () => mermaidWidget(code), { side: -1, key: `mmd-${code.length}-${code.slice(0, 40)}-${document.documentElement.dataset.tone}`, ignoreSelection: true }))
  })
  return DecorationSet.create(doc, decos)
}

export const mermaidPlugin = $prose(
  () =>
    new Plugin({
      key: mermaidKey,
      state: {
        init: (_c, st) => buildMermaid(st.doc),
        apply: (tr, old) => (tr.docChanged ? buildMermaid(tr.doc) : old)
      },
      props: {
        decorations(st) {
          return mermaidKey.getState(st)
        }
      }
    })
)

/* ------------------------------ 段落上鎖 ------------------------------ */
// 被鎖的段落（以純文字比對）不能被修改；邊界上新增段落仍可。上鎖資訊不在文件內。

interface LockState {
  texts: Set<string>
  decos: DecorationSet
  ranges: Range[]
}
const lockKey = new PluginKey<LockState>('inkwell-lock')

function computeLocks(doc: import('@milkdown/kit/prose/model').Node, texts: Set<string>): LockState {
  const ranges: Range[] = []
  const decos: Decoration[] = []
  if (texts.size) {
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return true
      if (node.type.name !== 'code_block' && node.textContent.trim() && texts.has(normLock(node.textContent))) {
        ranges.push({ from: pos, to: pos + node.nodeSize })
        decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-locked' }))
      }
      return false
    })
  }
  return { texts, ranges, decos: DecorationSet.create(doc, decos) }
}

let lockToastAt = 0
export const lockPlugin = $prose(
  () =>
    new Plugin<LockState>({
      key: lockKey,
      state: {
        init: (_c, st) => computeLocks(st.doc, new Set()),
        apply: (tr, old, _o, st) => {
          const meta = tr.getMeta(lockKey) as { texts: string[] } | undefined
          if (meta) return computeLocks(st.doc, new Set(meta.texts.map(normLock)))
          return tr.docChanged ? computeLocks(st.doc, old.texts) : old
        }
      },
      props: {
        decorations: (st) => lockKey.getState(st)?.decos
      },
      filterTransaction(tr, st) {
        if (!tr.docChanged) return true
        let rs = lockKey.getState(st)?.ranges ?? []
        if (!rs.length) return true
        for (const step of tr.steps) {
          const map = step.getMap()
          let hit = false
          map.forEach((os, oe) => {
            if (touchesLocked(os, oe, rs)) hit = true
          })
          if (hit) {
            if (Date.now() - lockToastAt > 1500) {
              lockToastAt = Date.now()
              window.dispatchEvent(new CustomEvent('inkwell-locked'))
            }
            return false
          }
          rs = rs.map((r) => ({ from: map.map(r.from, 1), to: map.map(r.to, -1) }))
        }
        return true
      }
    })
)

export function setLockTexts(view: EditorView, texts: string[]): void {
  view.dispatch(view.state.tr.setMeta(lockKey, { texts }).setMeta('addToHistory', false))
}

/** 切換游標所在段落的鎖定狀態；回傳新狀態與段落文字，找不到可鎖的段落回傳 null */
export function toggleLockAtCaret(view: EditorView): { locked: boolean; text: string; texts: string[] } | null {
  const { $from } = view.state.selection
  const block = $from.parent
  if (!block.isTextblock || block.type.name === 'code_block' || !block.textContent.trim()) return null
  const st = lockKey.getState(view.state)
  const texts = new Set(st?.texts ?? [])
  const t = normLock(block.textContent)
  const locked = !texts.has(t)
  if (locked) texts.add(t)
  else texts.delete(t)
  setLockTexts(view, [...texts])
  return { locked, text: block.textContent, texts: [...texts] }
}

export const extraPlugins = [
  frontMatterRemark,
  tocRemark,
  frontMatterNode,
  footnoteRefNode,
  footnoteDefNode,
  footnoteInputRule,
  tocNode,
  tocView,
  tocRefreshPlugin,
  calloutRemark,
  calcRemark,
  bilingualRemark,
  biColNode,
  biBlockNode,
  calloutPlugin,
  mermaidPlugin,
  lockPlugin,
  runUiPlugin,
  calcPlugin,
  footnoteTipPlugin,
  frontMatterBadgePlugin,
  weightPlugin
].flat()
