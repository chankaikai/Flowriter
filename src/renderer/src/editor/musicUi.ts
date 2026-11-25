import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { isMusicLang, musicDebounce, type MusicLang } from '@/lib/music/types'
import { listAbcParts } from '@/lib/music/abc'
import { abcEdit, type AbcTool } from '@/lib/music/abcEdit'
import { createAbcRenderer, MusicError } from '@/lib/music/abcRenderer'
import { createJianpuRenderer } from '@/lib/music/jianpuRender'
import { jianpuEdit, type JianpuTool } from '@/lib/music/jianpuEdit'
import { createVerovioRenderer } from '@/lib/music/verovioRenderer'
import { listScoreParts } from '@/lib/music/scoreParts'
import { createTabRenderer } from '@/lib/music/tabRenderer'
import { tabEdit, type TabTool } from '@/lib/music/tabEdit'
import type { MusicRenderer } from '@/lib/music/types'

/**
 * 樂譜預覽：語言命中（目前只有 abc）的圍欄代碼塊，下面畫一個唯讀的 widget。
 * widget 只是裝飾，不進入文件；真源永遠是圍欄裡的純文字。
 * 所有樂譜庫都是動態 import：文件裡沒有對應圍欄就不會載入。
 */

type Engine = MusicRenderer & { play?(): Promise<void>; stop?(): void; playing?(): boolean }

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

/** 每個編輯器一份登錄表（切換源碼／所見即所得會建新編輯器，舊的銷毀不能動到新的） */
interface Reg {
  blocks: Map<string, Block>
  /** 目前文件裡還在的樂譜圍欄 key（每次重建裝飾時更新） */
  live: Set<string>
  view: EditorView | null
}
/** 只顯示譜、隱藏代碼的圍欄（跨編輯器重建保留，純 UI 狀態，不寫進 md） */
const hiddenKeys = new Set<string>()
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

function partsOf(b: Block): { id: string; name: string }[] {
  if (b.lang === 'abc') return listAbcParts(b.source)
  if (b.lang === 'mei' || b.lang === 'xml') return listScoreParts(b.lang, b.source)
  return []
}

function syncParts(b: Block): void {
  if (b.lang !== 'abc' && b.lang !== 'mei' && b.lang !== 'xml') return
  const parts = partsOf(b)
  // 原來的聲部還在就保持選擇，不在了回到總譜
  if (b.part !== 'all' && !parts.some((p) => p.id === b.part)) b.part = 'all'
  const show = parts.length >= 2
  b.select.style.display = show ? '' : 'none'
  if (show) {
    b.select.replaceChildren(new Option('總譜', 'all'), ...parts.map((p) => new Option(p.name, p.id)))
    b.select.value = b.part
  }
}

function create(lang: MusicLang, source: string, key: string, reg: Reg): Block {
  const el = document.createElement('div')
  el.className = 'music-block'
  el.dataset.lang = lang
  el.contentEditable = 'false'
  const bar = document.createElement('div')
  bar.className = 'music-bar'
  const select = document.createElement('select')
  select.className = 'music-part'
  select.title = '聲部'
  const playBtn = document.createElement('button')
  playBtn.className = 'music-play'
  playBtn.textContent = '▶ 播放'
  // 只有 abc 有聲部與播放；其他譜種這一階段不做播放
  const hideBtn = document.createElement('button')
  hideBtn.className = 'music-hide'
  const paintHide = () => {
    hideBtn.textContent = hiddenKeys.has(key) ? '顯示代碼' : '隱藏代碼'
    hideBtn.title = '只留譜、收起代碼（不影響 Markdown 內容）'
  }
  paintHide()
  hideBtn.addEventListener('mousedown', (e) => e.preventDefault())
  hideBtn.addEventListener('click', () => {
    if (hiddenKeys.has(key)) hiddenKeys.delete(key)
    else hiddenKeys.add(key)
    paintHide()
    const v = reg.view
    if (v && !v.isDestroyed) v.dispatch(v.state.tr.setMeta(musicKey, 'rebuild'))
  })
  if (lang === 'abc' || lang === 'mei' || lang === 'xml') bar.append(select)
  if (lang === 'abc' || lang === 'tab') bar.append(playBtn)
  bar.append(hideBtn)
  const mount = document.createElement('div')
  mount.className = 'music-mount'
  const err = document.createElement('div')
  err.className = 'music-err'
  el.append(bar, mount, err)
  const b: Block = { lang, el, mount, err, bar, select, playBtn, engine: lang === 'abc' ? createAbcRenderer() : lang === 'tab' ? createTabRenderer() : lang === 'mei' || lang === 'xml' ? createVerovioRenderer(lang) : createJianpuRenderer(), part: 'all', source, timer: 0, seq: 0, dead: false }
  select.addEventListener('change', () => {
    b.part = select.value
    schedule(b, true)
  })
  playBtn.addEventListener('mousedown', (e) => e.preventDefault())
  playBtn.addEventListener('click', async () => {
    if (b.engine.playing?.()) {
      b.engine.stop?.()
      playBtn.textContent = '▶ 播放'
      return
    }
    playBtn.textContent = '載入音源…'
    try {
      await b.engine.play?.()
      playBtn.textContent = b.engine.playing?.() ? '■ 停止' : '▶ 播放'
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

function build(doc: PMNode, reg: Reg): DecorationSet {
  const decos: Decoration[] = []
  const counts: Record<string, number> = {}
  const alive = new Set<string>()
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    const lang = String(node.attrs.language ?? '').trim().toLowerCase()
    if (!isMusicLang(lang)) return
    // xml 圍欄很常是普通的 XML 範例；不是 MusicXML 的就維持一般代碼塊，不顯示譜面也不報錯
    if (lang === 'xml' && !/<score-(partwise|timewise)[\s>]/.test(node.textContent)) return
    const n = (counts[lang] = (counts[lang] ?? -1) + 1)
    const key = keyOf(lang, n)
    alive.add(key)
    const code = node.textContent
    const existing = reg.blocks.get(key)
    if (existing && existing.source !== code) {
      existing.source = code
      syncParts(existing)
      schedule(existing)
    }
    if (hiddenKeys.has(key)) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'music-code-hidden' }))
    decos.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => {
          let b = reg.blocks.get(key)
          if (!b || b.dead) {
            b = create(lang, code, key, reg)
            reg.blocks.set(key, b)
          }
          return b.el
        },
        {
          side: -1,
          key,
          ignoreSelection: true,
          stopEvent: () => true,
          destroy: () => {
            const b = reg.blocks.get(key)
            if (!b) return
            // 同一輪重建時 PM 可能先銷毀舊 widget 再建新的；等一拍，確認這塊真的不在文件裡才清掉
            window.setTimeout(() => {
              if (reg.live.has(key) || reg.blocks.get(key) !== b) return
              b.dead = true
              window.clearTimeout(b.timer)
              b.engine.destroy()
              reg.blocks.delete(key)
            }, 0)
          }
        } as any
      )
    )
  })
  reg.live = alive
  return DecorationSet.create(doc, decos)
}

/* ------------------------------ 工具列（游標在樂譜圍欄內才出現） ------------------------------ */

interface ToolDef { id: string; label: string; title: string }
const ABC_TOOLS: ToolDef[] = [
  { id: 'treble', label: '高音譜號', title: '插入 V:1 clef=treble name=""' },
  { id: 'bass', label: '低音譜號', title: '插入 V:2 clef=bass name=""' },
  { id: 'alto', label: '中音譜號', title: '插入 V:3 clef=alto name=""' },
  { id: 'key', label: '調號', title: '插入 K:C；游標在 K: 行上則循環常見調' },
  { id: 'meter', label: '拍號', title: '插入 M:4/4；游標在 M: 行上則循環' },
  { id: 'slur', label: '連音線', title: '選區包上 ( )，沒有選區插入 ( C D E )' },
  { id: 'tie', label: '延音線', title: '在選區最後一個音後插入 -' },
  { id: 'triplet', label: '三連音', title: '選區變成 (3 …)，沒有選區插入 (3 C D E' },
  { id: 'ped', label: '踏板踩下', title: '插入 !ped!' },
  { id: 'pedUp', label: '踏板抬起', title: '插入 !ped-up!' },
  { id: 'tablature', label: '六線譜', title: '在最前面加一行 %%abcjs_render_params，譜下方同步顯示吉他六線譜（已有就不重複插）' }
]
const JIANPU_TOOLS: ToolDef[] = [
  { id: 'octUp', label: '高八度', title: "選中一個音符就加 '，否則插入 1'" },
  { id: 'octDown', label: '低八度', title: '選中一個音符就加 ,，否則插入 1,' },
  { id: 'dot', label: '附點', title: '給選中的音符加 .，否則插入 5.' },
  { id: 'eighth', label: '八分', title: '給選中的音符加 /，否則插入 1/' },
  { id: 'sixteenth', label: '十六分', title: '給選中的音符加 //，否則插入 1//' },
  { id: 'dash', label: '延時線', title: '插入 -' },
  { id: 'slur', label: '連音線', title: '選區包上 ( )，否則插入 (1 2 3)' },
  { id: 'tuplet', label: '三連音', title: '插入 (3: 1 2 3)' },
  { id: 'func', label: '功能標記', title: '在第一行下方插入 func: T（已有就不再插）' }
]
const TAB_TOOLS: ToolDef[] = [
  { id: 'tuning', label: '標準調弦', title: '在最前面插入 \\tuning E4 B3 G3 D3 A2 E2（已有就不重複插）' },
  { id: 'bar', label: '小節線', title: '插入 |' },
  { id: 'dur8', label: '八分音符', title: '插入 :8（之後的音都是八分）' },
  { id: 'chord', label: '和弦', title: '選區包成 (…)，否則插入 (0.3 2.2)' },
  { id: 'tie', label: '連結音', title: '插入 -.3（與同弦前一音相連）' },
  { id: 'rest', label: '休止', title: '插入 r.4' }
]
const TOOLS: Partial<Record<MusicLang, ToolDef[]>> = { abc: ABC_TOOLS, jianpu: JIANPU_TOOLS, tab: TAB_TOOLS }

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

function runTool(v: EditorView, id: string): void {
  const ctx = musicContext(v)
  if (!ctx) return
  const text = ctx.node.textContent
  const base = ctx.pos + 1
  const { from, to } = v.state.selection
  const a = Math.max(0, from - base)
  const b = Math.max(0, to - base)
  const e = ctx.lang === 'abc' ? abcEdit(id as AbcTool, text, a, b) : ctx.lang === 'tab' ? tabEdit(id as TabTool, text, a, b) : jianpuEdit(id as JianpuTool, text, a, b)
  if (!e.insert && e.from === e.to) return // 不需要改（例如已經有 func: 行）
  const tr = v.state.tr
  if (e.insert) tr.insertText(e.insert, base + e.from, base + e.to)
  else tr.delete(base + e.from, base + e.to)
  const end = base + e.from + e.insert.length
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end, tr.doc.content.size))))
  v.dispatch(tr.scrollIntoView())
  v.focus()
}

export const musicPlugin = $prose(() => {
  const reg: Reg = { blocks: new Map(), live: new Set(), view: null }
  return new Plugin({
      key: musicKey,
      state: {
        init: (_c, st) => build(st.doc, reg),
        apply: (tr, old) => (tr.docChanged || tr.getMeta(musicKey) === 'rebuild' ? build(tr.doc, reg) : old)
      },
      props: {
        decorations: (st) => musicKey.getState(st)
      },
      view(v) {
        reg.view = v
        const bar = document.createElement('div')
        bar.className = 'tb-bar music-tools'
        bar.style.display = 'none'
        document.body.appendChild(bar)
        let barLang: MusicLang | null = null
        const makeButtons = (lang: MusicLang) => {
          if (barLang === lang) return
          barLang = lang
          bar.replaceChildren()
          for (const t of TOOLS[lang] ?? []) {
            const b = document.createElement('button')
            b.textContent = t.label
            b.title = t.title
            b.addEventListener('mousedown', (e) => e.preventDefault()) // 不搶走編輯器的焦點與選區
            b.addEventListener('click', () => runTool(v, t.id))
            bar.appendChild(b)
          }
        }
        let raf = 0
        const render = () => {
          raf = 0
          if (v.isDestroyed) return
          const ctx = v.hasFocus() || bar.matches(':hover') ? musicContext(v) : null
          if (!ctx || !TOOLS[ctx.lang]) {
            if (!bar.matches(':hover')) bar.style.display = 'none'
            return
          }
          makeButtons(ctx.lang)
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
            reg.view = null
            for (const [k, b] of reg.blocks) {
              b.dead = true
              window.clearTimeout(b.timer)
              b.engine.destroy()
              reg.blocks.delete(k)
            }
          }
        }
      }
  })
})
