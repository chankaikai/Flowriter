import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { isMusicLang, musicDebounce, type MusicLang } from '@/lib/music/types'
import { listAbcParts } from '@/lib/music/abc'
import { abcEdit, type AbcTool } from '@/lib/music/abcEdit'
import { createAbcRenderer, MusicError } from '@/lib/music/abcRenderer'

/**
 * 樂譜預覽：語言命中（目前只有 abc）的圍欄代碼塊，下面畫一個唯讀的 widget。
 * widget 只是裝飾，不進入文件；真源永遠是圍欄裡的純文字。
 * 所有樂譜庫都是動態 import：文件裡沒有對應圍欄就不會載入。
 */

type Engine = ReturnType<typeof createAbcRenderer>

interface Block {
  lang: MusicLang
  el: HTMLElement
  mount: HTMLElement
  err: HTMLElement
  bar: HTMLElement
  select: HTMLSelectElement
  playBtn: HTMLButtonElement
  engine: Engine
  part: string
  source: string
  timer: number
  seq: number
  dead: boolean
}

const blocks = new Map<string, Block>()
/** 目前文件裡還在的樂譜圍欄 key（每次重建裝飾時更新） */
let liveKeys = new Set<string>()
const keyOf = (lang: string, ordinal: number) => `music-${lang}-${ordinal}`

function schedule(b: Block, immediate = false): void {
  window.clearTimeout(b.timer)
  b.timer = window.setTimeout(() => void draw(b), immediate ? 0 : musicDebounce(b.lang))
}

async function draw(b: Block): Promise<void> {
  if (b.dead) return
  const my = ++b.seq
  b.err.textContent = ''
  try {
    await b.engine.render(b.source, b.mount, { part: b.part })
    if (b.dead || my !== b.seq) return
  } catch (e) {
    if (b.dead || my !== b.seq) return
    b.mount.replaceChildren()
    b.err.textContent = e instanceof MusicError ? e.message : `無法渲染：${String((e as Error)?.message ?? e).split('\n')[0].slice(0, 160)}`
  }
  b.playBtn.textContent = '▶ 播放'
}

function syncParts(b: Block): void {
  const parts = listAbcParts(b.source)
  // 原來的聲部還在就保持選擇，不在了回到總譜
  if (b.part !== 'all' && !parts.some((p) => p.id === b.part)) b.part = 'all'
  const show = parts.length >= 2
  b.select.style.display = show ? '' : 'none'
  if (show) {
    b.select.replaceChildren(new Option('總譜', 'all'), ...parts.map((p) => new Option(p.name, p.id)))
    b.select.value = b.part
  }
}

function create(lang: MusicLang, source: string): Block {
  const el = document.createElement('div')
  el.className = 'music-block'
  el.contentEditable = 'false'
  const bar = document.createElement('div')
  bar.className = 'music-bar'
  const select = document.createElement('select')
  select.className = 'music-part'
  select.title = '聲部'
  const playBtn = document.createElement('button')
  playBtn.className = 'music-play'
  playBtn.textContent = '▶ 播放'
  bar.append(select, playBtn)
  const mount = document.createElement('div')
  mount.className = 'music-mount'
  const err = document.createElement('div')
  err.className = 'music-err'
  el.append(bar, mount, err)
  const b: Block = { lang, el, mount, err, bar, select, playBtn, engine: createAbcRenderer(), part: 'all', source, timer: 0, seq: 0, dead: false }
  select.addEventListener('change', () => {
    b.part = select.value
    schedule(b, true)
  })
  playBtn.addEventListener('mousedown', (e) => e.preventDefault())
  playBtn.addEventListener('click', async () => {
    if (b.engine.playing()) {
      b.engine.stop()
      playBtn.textContent = '▶ 播放'
      return
    }
    playBtn.textContent = '載入音源…'
    try {
      await b.engine.play()
      playBtn.textContent = b.engine.playing() ? '■ 停止' : '▶ 播放'
    } catch (e) {
      playBtn.textContent = '▶ 播放'
      err.textContent = e instanceof MusicError ? e.message : `無法播放：${String((e as Error)?.message ?? e).slice(0, 120)}`
    }
  })
  syncParts(b)
  schedule(b)
  return b
}

const musicKey = new PluginKey<DecorationSet>('inkwell-music')

function build(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  const counts: Record<string, number> = {}
  const alive = new Set<string>()
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    const lang = String(node.attrs.language ?? '').trim().toLowerCase()
    if (!isMusicLang(lang)) return
    const n = (counts[lang] = (counts[lang] ?? -1) + 1)
    const key = keyOf(lang, n)
    alive.add(key)
    const code = node.textContent
    const existing = blocks.get(key)
    if (existing && existing.source !== code) {
      existing.source = code
      syncParts(existing)
      schedule(existing)
    }
    decos.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => {
          let b = blocks.get(key)
          if (!b || b.dead) {
            b = create(lang, code)
            blocks.set(key, b)
          }
          return b.el
        },
        {
          side: -1,
          key,
          ignoreSelection: true,
          stopEvent: () => true,
          destroy: () => {
            const b = blocks.get(key)
            if (!b) return
            // 同一輪重建時 PM 可能先銷毀舊 widget 再建新的；等一拍，確認這塊真的不在文件裡才清掉
            window.setTimeout(() => {
              if (liveKeys.has(key) || blocks.get(key) !== b) return
              b.dead = true
              window.clearTimeout(b.timer)
              b.engine.destroy()
              blocks.delete(key)
            }, 0)
          }
        } as any
      )
    )
  })
  liveKeys = alive
  return DecorationSet.create(doc, decos)
}

/* ------------------------------ 工具列（游標在樂譜圍欄內才出現） ------------------------------ */

interface ToolDef { tool: AbcTool; label: string; title: string }
const ABC_TOOLS: ToolDef[] = [
  { tool: 'treble', label: '高音譜號', title: '插入 V:1 clef=treble name=""' },
  { tool: 'bass', label: '低音譜號', title: '插入 V:2 clef=bass name=""' },
  { tool: 'alto', label: '中音譜號', title: '插入 V:3 clef=alto name=""' },
  { tool: 'key', label: '調號', title: '插入 K:C；游標在 K: 行上則循環常見調' },
  { tool: 'meter', label: '拍號', title: '插入 M:4/4；游標在 M: 行上則循環' },
  { tool: 'slur', label: '連音線', title: '選區包上 ( )，沒有選區插入 ( C D E )' },
  { tool: 'tie', label: '延音線', title: '在選區最後一個音後插入 -' },
  { tool: 'triplet', label: '三連音', title: '選區變成 (3 …)，沒有選區插入 (3 C D E' },
  { tool: 'ped', label: '踏板踩下', title: '插入 !ped!' },
  { tool: 'pedUp', label: '踏板抬起', title: '插入 !ped-up!' }
]

function musicContext(v: EditorView): { node: PMNode; pos: number; lang: MusicLang } | null {
  const { $from } = v.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name !== 'code_block') continue
    const lang = String(n.attrs.language ?? '').trim().toLowerCase()
    return isMusicLang(lang) ? { node: n, pos: $from.before(d), lang } : null
  }
  return null
}

function runTool(v: EditorView, tool: AbcTool): void {
  const ctx = musicContext(v)
  if (!ctx || ctx.lang !== 'abc') return
  const text = ctx.node.textContent
  const base = ctx.pos + 1
  const { from, to } = v.state.selection
  const e = abcEdit(tool, text, Math.max(0, from - base), Math.max(0, to - base))
  const tr = v.state.tr
  if (e.insert) tr.insertText(e.insert, base + e.from, base + e.to)
  else tr.delete(base + e.from, base + e.to)
  const end = base + e.from + e.insert.length
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size))))
  v.dispatch(tr.scrollIntoView())
  v.focus()
}

export const musicPlugin = $prose(
  () =>
    new Plugin({
      key: musicKey,
      state: {
        init: (_c, st) => build(st.doc),
        apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old)
      },
      props: {
        decorations: (st) => musicKey.getState(st)
      },
      view(v) {
        const bar = document.createElement('div')
        bar.className = 'tb-bar music-tools'
        bar.style.display = 'none'
        document.body.appendChild(bar)
        const makeButtons = () => {
          bar.replaceChildren()
          for (const t of ABC_TOOLS) {
            const b = document.createElement('button')
            b.textContent = t.label
            b.title = t.title
            b.addEventListener('mousedown', (e) => e.preventDefault()) // 不搶走編輯器的焦點與選區
            b.addEventListener('click', () => runTool(v, t.tool))
            bar.appendChild(b)
          }
        }
        makeButtons()
        let raf = 0
        const render = () => {
          raf = 0
          if (v.isDestroyed) return
          const ctx = v.hasFocus() || bar.matches(':hover') ? musicContext(v) : null
          if (!ctx || ctx.lang !== 'abc') {
            if (!bar.matches(':hover')) bar.style.display = 'none'
            return
          }
          const el = v.nodeDOM(ctx.pos) as HTMLElement | null
          const rect = el?.getBoundingClientRect()
          if (!rect || rect.width === 0) {
            bar.style.display = 'none'
            return
          }
          bar.style.display = 'flex'
          const bw = bar.offsetWidth
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - bw - 8))
          const top = Math.max(8, Math.min(rect.top - bar.offsetHeight - 6, window.innerHeight - bar.offsetHeight - 8))
          bar.style.left = `${left}px`
          bar.style.top = `${top}px`
        }
        const sched = () => {
          if (!raf) raf = requestAnimationFrame(render)
        }
        window.addEventListener('scroll', sched, true)
        window.addEventListener('resize', sched)
        sched()
        return {
          update: sched,
          destroy() {
            window.removeEventListener('scroll', sched, true)
            window.removeEventListener('resize', sched)
            cancelAnimationFrame(raf)
            bar.remove()
            for (const [k, b] of blocks) {
              b.dead = true
              window.clearTimeout(b.timer)
              b.engine.destroy()
              blocks.delete(k)
            }
          }
        }
      }
    })
)
