import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { preflight, runKind } from '@/lib/runner'
import { runCode, type RunHandle, type RunResult } from '@/lib/runnerHost'

/**
 * 代碼塊直接執行：
 * - 常用語言（JavaScript、Python）的代碼塊右上角浮出「▶ 執行」，不必開面板。
 * - 結果顯示在代碼塊正下方（Decoration，唯讀、不進文件內容，不影響儲存的 Markdown）。
 * - 修改代碼後，舊結果自動消失（結果以「語言＋程式碼」為鍵）。
 */

interface Entry {
  status: 'loading' | 'running' | 'done'
  res?: RunResult
  handle?: RunHandle
  /** 不能執行時的說明（例如含被禁止的語法） */
  note?: string
}
type RunState = Map<string, Entry>
const runKey = new PluginKey<RunState>('inkwell-run')
const cacheKey = (lang: string, code: string) => `${lang.trim().toLowerCase()}|${code}`
const PY_CONSENT = 'flowiter.pyConsent'

function setEntry(view: EditorView, k: string, entry: Entry | null): void {
  view.dispatch(view.state.tr.setMeta(runKey, { k, entry }).setMeta('addToHistory', false))
}

function runBlock(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos)
  if (!node || node.type.name !== 'code_block') return
  const lang = String(node.attrs.language ?? '')
  const code = node.textContent
  const kind = runKind(lang)
  if (!kind) return
  const k = cacheKey(lang, code)
  const cur = runKey.getState(view.state)?.get(k)
  if (cur && cur.status !== 'done') return

  const pf = preflight(lang, code)
  if (!pf.runnable) return setEntry(view, k, { status: 'done', note: pf.reason })
  if (pf.warnings.length && !window.confirm(`這段程式碼含有：\n・${pf.warnings.join('\n・')}\n\n仍要在隔離環境中執行嗎？`)) return
  if (kind === 'py') {
    let ok = false
    try {
      ok = localStorage.getItem(PY_CONSENT) === '1'
    } catch {
      /* 忽略 */
    }
    if (!ok) {
      if (!window.confirm('首次執行 Python 會從 cdn.jsdelivr.net 下載 Python 執行環境（約 10 MB，之後瀏覽器會快取）。\n\n程式碼仍在隔離的 WebAssembly 環境中執行，碰不到你的檔案與網路。要繼續嗎？')) return
      try {
        localStorage.setItem(PY_CONSENT, '1')
      } catch {
        /* 忽略 */
      }
    }
  }

  const handle = runCode(kind, code, (phase) => {
    const e = runKey.getState(view.state)?.get(k)
    if (e && e.status !== 'done') setEntry(view, k, { ...e, status: phase })
  })
  setEntry(view, k, { status: kind === 'py' ? 'loading' : 'running', handle })
  void handle.done.then((res) => {
    // 視圖可能已被銷毀（切換分頁／關閉），那就不用顯示了
    try {
      setEntry(view, k, { status: 'done', res })
    } catch {
      /* 忽略 */
    }
  })
}

/** 執行游標所在的代碼塊（給命令／選單用） */
export function runBlockAtCaret(view: EditorView): boolean {
  const { $from } = view.state.selection
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === 'code_block') {
      if (!runKind(String($from.node(d).attrs.language ?? ''))) return false
      runBlock(view, $from.before(d))
      return true
    }
  }
  return false
}

function outputDom(view: EditorView, k: string, e: Entry): HTMLElement {
  const box = document.createElement('div')
  box.className = 'run-out'
  box.contentEditable = 'false'
  const head = document.createElement('div')
  head.className = 'run-head'
  const label = document.createElement('span')
  const actions = document.createElement('span')
  actions.className = 'run-actions'
  const mkBtn = (text: string, fn: () => void) => {
    const b = document.createElement('button')
    b.textContent = text
    b.onmousedown = (ev) => ev.preventDefault()
    b.onclick = fn
    actions.appendChild(b)
  }
  head.append(label, actions)
  box.appendChild(head)

  if (e.status !== 'done') {
    label.textContent = e.status === 'loading' ? '載入 Python 環境中（首次需下載約 10 MB）…' : '執行中…'
    mkBtn('停止', () => e.handle?.stop())
    return box
  }
  const r = e.res
  const statusText = e.note
    ? '無法執行'
    : r?.status === 'ok'
      ? '完成'
      : r?.status === 'timeout'
        ? '逾時中止'
        : r?.status === 'stopped'
          ? '已停止'
          : '發生錯誤'
  label.textContent = `${statusText}${r ? ` · ${r.ms} ms` : ''}`
  label.className = e.note || (r && r.status !== 'ok') ? 'bad' : ''
  const addLine = (text: string, cls: string) => {
    const pre = document.createElement('pre')
    pre.className = `run-line ${cls}`
    pre.textContent = text
    box.appendChild(pre)
  }
  if (e.note) addLine(e.note, 'error')
  for (const l of r?.lines ?? []) addLine((l.kind === 'result' ? '⇒ ' : '') + l.text, l.kind)
  if (r?.truncated) addLine('輸出過長，已截斷', 'warn')
  if (r?.error) addLine(r.error, 'error')
  const out = (r?.lines ?? []).map((l) => l.text).join('\n')
  if (out) mkBtn('複製輸出', () => void navigator.clipboard.writeText(out))
  mkBtn('清除', () => setEntry(view, k, null))
  return box
}

function buildDecos(view: EditorView, doc: PMNode, state: RunState): DecorationSet {
  if (!state.size) return DecorationSet.empty
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    const k = cacheKey(String(node.attrs.language ?? ''), node.textContent)
    const e = state.get(k)
    if (!e) return
    const sig = `${e.status}-${e.res?.ms ?? ''}-${e.res?.lines.length ?? ''}-${e.note ?? ''}`
    decos.push(Decoration.widget(pos + node.nodeSize, () => outputDom(view, k, e), { side: -1, key: `run-${k.length}-${k.slice(0, 30)}-${sig}`, ignoreSelection: true }))
  })
  return DecorationSet.create(doc, decos)
}

export const runUiPlugin = $prose(() => {
  let viewRef: EditorView | null = null
  return new Plugin<RunState>({
    key: runKey,
    state: {
      init: () => new Map(),
      apply: (tr, old) => {
        const m = tr.getMeta(runKey) as { k: string; entry: Entry | null } | undefined
        if (!m) return old
        const next = new Map(old)
        if (m.entry) next.set(m.k, m.entry)
        else next.delete(m.k)
        if (next.size > 40) next.delete(next.keys().next().value as string)
        return next
      }
    },
    props: {
      decorations(st) {
        const s = runKey.getState(st)
        return s && viewRef ? buildDecos(viewRef, st.doc, s) : DecorationSet.empty
      }
    },
    view(v) {
      viewRef = v
      const layer = document.createElement('div')
      layer.className = 'run-layer'
      document.body.appendChild(layer)
      const btns: HTMLButtonElement[] = []
      let raf = 0

      const render = () => {
        raf = 0
        const items: { pos: number; node: PMNode }[] = []
        v.state.doc.descendants((node, pos) => {
          if (node.type.name === 'code_block' && runKind(String(node.attrs.language ?? ''))) items.push({ pos, node })
          return node.type.name !== 'code_block'
        })
        const scroller = v.dom.closest('.editor-scroll')
        const sr = scroller?.getBoundingClientRect()
        while (btns.length < items.length) {
          const b = document.createElement('button')
          b.className = 'run-btn'
          b.onmousedown = (ev) => ev.preventDefault()
          layer.appendChild(b)
          btns.push(b)
        }
        btns.forEach((b, i) => {
          const it = items[i]
          const el = it ? (v.nodeDOM(it.pos) as HTMLElement | null) : null
          const rect = el?.getBoundingClientRect()
          if (!it || !el || !rect || rect.width === 0 || !el.isConnected) {
            b.style.display = 'none'
            return
          }
          const copy = [...el.querySelectorAll('button')].find((x) => /copy|複製/i.test(x.textContent ?? ''))
          const cr = copy?.getBoundingClientRect()
          const w = 78
          const left = cr && cr.width ? cr.left - w - 8 : rect.right - 210
          const top = cr && cr.height ? cr.top + (cr.height - 28) / 2 : rect.top + 30
          const outside = sr ? top < sr.top + 4 || top > sr.bottom - 30 : false
          b.style.display = outside ? 'none' : ''
          b.style.left = `${Math.max(rect.left + 8, left)}px`
          b.style.top = `${top}px`
          const e = runKey.getState(v.state)?.get(cacheKey(String(it.node.attrs.language ?? ''), it.node.textContent))
          const running = !!e && e.status !== 'done'
          b.textContent = running ? '■ 停止' : '▶ 執行'
          b.classList.toggle('stop', running)
          b.title = running ? '停止執行' : `執行這段 ${String(it.node.attrs.language)} 程式碼（在隔離環境中，不會動到你的檔案）`
          b.onclick = () => {
            if (running) e?.handle?.stop()
            else runBlock(v, it.pos)
          }
        })
      }
      const schedule = () => {
        if (!raf) raf = requestAnimationFrame(render)
      }
      window.addEventListener('scroll', schedule, true)
      window.addEventListener('resize', schedule)
      const ro = new ResizeObserver(schedule)
      ro.observe(v.dom)
      schedule()
      return {
        update: schedule,
        destroy() {
          window.removeEventListener('scroll', schedule, true)
          window.removeEventListener('resize', schedule)
          ro.disconnect()
          cancelAnimationFrame(raf)
          layer.remove()
          // 銷毀視圖時停掉還在跑的 Worker
          runKey.getState(v.state)?.forEach((e) => e.status !== 'done' && e.handle?.stop())
          viewRef = null
        }
      }
    }
  })
})
