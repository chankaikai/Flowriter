/**
 * 全域介面翻譯：監看畫面，把「翻譯表裡有的」文字與 title／placeholder／aria-label 換成目前語言。
 * 寫作區（所見即所得、源碼、預覽、代碼塊）一律不動，所以「除了寫作區以外全部翻譯」，
 * 而且沒有逐個呼叫 tr() 的地方（變數、清單、函式回傳的字串）也一併涵蓋。
 * 切回繁體中文時，會還原成原本的文字。
 */
import { getLang, trKnown } from './index'

const CJK = /[一-鿿]/
const SKIP = '.ProseMirror, .cm-editor, .src-preview, textarea, script, style, pre, code, [data-no-i18n]'
const ATTRS = ['title', 'placeholder', 'aria-label']

const textState = new WeakMap<Text, { orig: string; out: string }>()
const attrState = new WeakMap<Element, Record<string, { orig: string; out: string }>>()

function skipped(n: Node): boolean {
  const el = n.nodeType === 1 ? (n as Element) : n.parentElement
  return !el || !!el.closest(SKIP)
}

function doText(t: Text): void {
  const cur = t.data
  const st = textState.get(t)
  const source = st && cur === st.out ? st.orig : cur
  if (getLang() === 'zh-TW') {
    if (st && cur === st.out) t.data = st.orig
    textState.delete(t)
    return
  }
  if (!CJK.test(source) || skipped(t)) { textState.delete(t); return }
  const core = source.trim()
  const hit = core ? trKnown(core) : null
  if (!hit || hit === core) { textState.delete(t); return }
  const lead = source.slice(0, source.indexOf(core))
  const trail = source.slice(lead.length + core.length)
  const out = lead + hit + trail
  textState.set(t, { orig: source, out })
  if (t.data !== out) t.data = out
}

function doAttrs(el: Element): void {
  if (skipped(el)) return
  let rec = attrState.get(el)
  for (const a of ATTRS) {
    const cur = el.getAttribute(a)
    if (cur == null) continue
    const st = rec?.[a]
    const source = st && cur === st.out ? st.orig : cur
    if (getLang() === 'zh-TW') {
      if (st && cur === st.out) el.setAttribute(a, st.orig)
      if (rec) delete rec[a]
      continue
    }
    if (!CJK.test(source)) { if (rec) delete rec[a]; continue }
    const hit = trKnown(source.trim())
    if (!hit || hit === source.trim()) { if (rec) delete rec[a]; continue }
    rec ??= {}
    attrState.set(el, rec)
    rec[a] = { orig: source, out: hit }
    if (cur !== hit) el.setAttribute(a, hit)
  }
}

function walk(root: Node): void {
  if (root.nodeType === 3) return doText(root as Text)
  if (root.nodeType !== 1) return
  const el = root as Element
  if (el.closest(SKIP)) return
  doAttrs(el)
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
  })
  let n: Node | null = tw.nextNode()
  while (n) {
    if (n.nodeType === 3) doText(n as Text)
    else doAttrs(n as Element)
    n = tw.nextNode()
  }
}

let started = false
export function startDomTranslate(): void {
  if (started || typeof document === 'undefined') return
  started = true
  const pending = new Set<Node>()
  const attrQueue = new Set<Element>()
  let raf = 0
  const flush = () => {
    raf = 0
    const items = [...pending]
    pending.clear()
    const attrs = [...attrQueue]
    attrQueue.clear()
    for (const n of items) if (n.isConnected) walk(n)
    for (const e of attrs) if (e.isConnected) doAttrs(e)
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(flush) }
  const queue = (n: Node) => {
    pending.add(n)
    kick()
  }
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(queue)
      else if (m.type === 'characterData') queue(m.target)
      else if (m.type === 'attributes') { attrQueue.add(m.target as Element); kick() }
    }
  })
  mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  window.addEventListener('inkwell-lang', () => queue(document.body))
  queue(document.body)
}
