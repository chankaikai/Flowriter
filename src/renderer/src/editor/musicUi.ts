import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey, TextSelection } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode } from '@milkdown/kit/prose/model'
import { isMusicLang, musicDebounce, type MusicLang } from '@/lib/music/types'
import { listAbcParts } from '@/lib/music/abc'
import { abcEdit, type AbcTool } from '@/lib/music/abcEdit'
import { MusicError } from '@/lib/music/abcRenderer'
import { copyElementPng } from '@/lib/copyPng'
import { createEngine, type Engine } from '@/lib/music/engines'
import { NotePlayer, fmtTime, markFromEvents, type Mark, type PlayInfo, type Transport } from '@/lib/music/player'
import { jianpuEdit, type JianpuTool } from '@/lib/music/jianpuEdit'
import { listScoreParts } from '@/lib/music/scoreParts'
import { gongcheEdit } from '@/lib/music/gongcheEdit'
import { GONGCHE_CHARS } from '@/lib/music/gongche'
import { standaloneSvg, svgFileName } from '@/lib/music/svgExport'
import { tabEdit, type TabTool } from '@/lib/music/tabEdit'
import { getLang, tr } from '@/lib/i18n'

/**
 * 樂譜預覽：語言命中（目前只有 abc）的圍欄代碼塊，下面畫一個唯讀的 widget。
 * widget 只是裝飾，不進入文件；真源永遠是圍欄裡的純文字。
 * 所有樂譜庫都是動態 import：文件裡沒有對應圍欄就不會載入。
 */

interface Block {
  lang: MusicLang
  el: HTMLElement
  mount: HTMLElement
  err: HTMLElement
  bar: HTMLElement
  select: HTMLSelectElement
  /** 播放控制：播放／暫停、停止、進度條、狀態文字 */
  tp: { play: HTMLButtonElement; stop: HTMLButtonElement; range: HTMLInputElement; status: HTMLElement; wrap: HTMLElement }
  player: NotePlayer | null
  transport: Transport | null
  /** 正在高亮的譜面元素與代碼範圍 */
  lit: Element[]
  litKey: string
  ranges: [number, number][]
  /** 圍欄內文第一個字元在文件中的位置 */
  base: number
  loading: boolean
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
/** 每個圍欄只能收起「代碼」或「譜面」其中一個（兩個都收起就什麼都看不到） */
const hidden = new Map<string, 'code' | 'score'>()
const keyOf = (lang: string, ordinal: number) => `music-${lang}-${ordinal}`
/** 匯出時查詢：第 ordinal 個該語言的譜目前收起了什麼（null＝兩者都顯示） */
export const musicHiddenMode = (lang: string, ordinal: number): 'code' | 'score' | null => hidden.get(keyOf(lang, ordinal)) ?? null

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
  resetPlayer(b) // 譜變了：舊的播放內容作廢
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
    b.select.replaceChildren(new Option(tr('總譜'), 'all'), ...parts.map((p) => new Option(p.name, p.id)))
    b.select.value = b.part
  }
}


/* ------------------------------ 播放控制 ------------------------------ */

function makeTransport(): Block['tp'] {
  const wrap = document.createElement('div')
  wrap.className = 'music-tp'
  const mk = (cls: string, text: string, title: string) => {
    const x = document.createElement('button')
    x.className = cls
    x.textContent = text
    x.title = tr(title)
    x.addEventListener('mousedown', (e) => e.preventDefault())
    return x
  }
  const play = mk('music-play', '▶', '播放／暫停')
  const stop = mk('music-stop', '■', '停止並回到開頭')
  const range = document.createElement('input')
  range.type = 'range'
  range.className = 'music-seek'
  range.min = '0'
  range.max = '1000'
  range.value = '0'
  range.title = tr('拖曳跳到想聽的位置')
  const status = document.createElement('span')
  status.className = 'music-status'
  status.textContent = tr('尚未播放')
  wrap.append(play, stop, range, status)
  return { play, stop, range, status, wrap }
}

function clearMarks(b: Block, reg: Reg): void {
  for (const e of b.lit) e.classList.remove('mp-on')
  b.lit = []
  b.litKey = ''
  if (b.ranges.length) {
    b.ranges = []
    pokeHl(reg)
  }
}

function pokeHl(reg: Reg): void {
  const v = reg.view
  if (v && !v.isDestroyed) v.dispatch(v.state.tr.setMeta(musicKey, 'hl').setMeta('addToHistory', false))
}

function resetPlayer(b: Block, reg?: Reg): void {
  b.player?.destroy()
  b.player = null
  b.transport = null
  for (const e of b.lit) e.classList.remove('mp-on')
  b.lit = []
  b.litKey = ''
  b.ranges = []
  b.tp.play.textContent = '▶'
  b.tp.range.value = '0'
  b.tp.status.textContent = tr('尚未播放')
  if (reg) pokeHl(reg)
}

const STATUS: Record<string, string> = { idle: '已停止', loading: '載入中…', playing: '播放中', paused: '已暫停', ended: '播放完畢' }

function wireTransport(b: Block, reg: Reg): void {
  const { play, stop, range, status } = b.tp
  let dragging = false
  const onInfo = (i: PlayInfo) => {
    play.textContent = i.status === 'playing' ? '⏸' : '▶'
    status.textContent = `${tr(STATUS[i.status] ?? '')}  ${fmtTime(i.cur)} / ${fmtTime(i.total)}`
    if (!dragging && i.total > 0) range.value = String(Math.round((i.cur / i.total) * 1000))
  }
  const apply = (m: Mark) => {
    if (m.key === b.litKey) return
    b.litKey = m.key
    for (const e of b.lit) e.classList.remove('mp-on')
    b.lit = m.els
    for (const e of m.els) e.classList.add('mp-on')
    const same = m.ranges.length === b.ranges.length && m.ranges.every((r, i) => r[0] === b.ranges[i][0] && r[1] === b.ranges[i][1])
    b.ranges = m.ranges
    if (!same) pokeHl(reg)
  }
  const ensure = async (): Promise<boolean> => {
    if (b.player) return true
    if (b.loading) return false
    if (!b.engine.transport) {
      status.textContent = tr('這種譜暫不支援播放')
      return false
    }
    b.loading = true
    status.textContent = tr('載入中…')
    try {
      const t = await b.engine.transport()
      if (b.dead) return false
      if (!t) {
        status.textContent = tr('這份譜沒有可播放的音符（先確認譜面能正常顯示）')
        return false
      }
      b.transport = t
      b.player = new NotePlayer(t.events, {
        onInfo,
        onActive: () => undefined,
        onTime: (sec) => apply(t.mark ? t.mark(sec) : markFromEvents(t.events, b.mount, sec))
      })
      return true
    } catch (e) {
      status.textContent = e instanceof MusicError ? e.message : `${tr('無法播放')}：${String((e as Error)?.message ?? e).slice(0, 100)}`
      return false
    } finally {
      b.loading = false
    }
  }
  play.addEventListener('click', async () => {
    if (b.player?.state === 'playing') {
      b.player.pause()
      return
    }
    if (!(await ensure())) return
    try {
      await b.player!.play()
    } catch (e) {
      status.textContent = `${tr('無法播放')}：${String((e as Error)?.message ?? e).slice(0, 100)}`
    }
  })
  stop.addEventListener('click', () => {
    b.player?.stop()
    clearMarks(b, reg)
    range.value = '0'
    status.textContent = tr('已停止')
  })
  range.addEventListener('pointerdown', () => (dragging = true))
  range.addEventListener('change', () => (dragging = false))
  range.addEventListener('input', async () => {
    dragging = true
    if (!(await ensure())) {
      range.value = '0'
      dragging = false
      return
    }
    b.player!.seek(+range.value / 1000)
  })
  range.addEventListener('pointerup', () => (dragging = false))
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
  select.title = tr('聲部')
  const hideBtn = document.createElement('button')
  hideBtn.className = 'music-hide'
  const hideScoreBtn = document.createElement('button')
  hideScoreBtn.className = 'music-hide'
  const paintHide = () => {
    const m = hidden.get(key)
    hideBtn.textContent = m === 'code' ? tr('顯示代碼') : tr('隱藏代碼')
    hideBtn.title = tr('只留譜、收起代碼（不影響 Markdown 內容；匯出時也只輸出譜）')
    hideScoreBtn.textContent = m === 'score' ? tr('顯示譜面') : tr('隱藏譜面')
    hideScoreBtn.title = tr('只留代碼、收起譜面（匯出時也只輸出代碼文字）')
    el.classList.toggle('score-hidden', m === 'score')
  }
  const toggle = (what: 'code' | 'score') => {
    if (hidden.get(key) === what) hidden.delete(key)
    else hidden.set(key, what) // 收起一個時，另一個自動恢復顯示
    paintHide()
    const v = reg.view
    if (v && !v.isDestroyed) v.dispatch(v.state.tr.setMeta(musicKey, 'rebuild'))
  }
  for (const [btn, what] of [[hideBtn, 'code'], [hideScoreBtn, 'score']] as const) {
    btn.addEventListener('mousedown', (e) => e.preventDefault())
    btn.addEventListener('click', () => toggle(what))
  }
  if (lang === 'abc' || lang === 'mei' || lang === 'xml') bar.append(select)
  const tp = makeTransport()
  bar.append(tp.wrap)
  const dlBtn = document.createElement('button')
  dlBtn.className = 'music-dl'
  dlBtn.textContent = tr('下載 SVG')
  dlBtn.title = tr('把這塊譜存成 SVG 檔（不含代碼）')
  dlBtn.addEventListener('mousedown', (e) => e.preventDefault())
  dlBtn.addEventListener('click', () => {
    const svgs = [...mount.querySelectorAll('svg')]
    if (!svgs.length) {
      err.textContent = tr('還沒有可下載的譜面')
      return
    }
    svgs.forEach((svg, i) => {
      const blob = new Blob([standaloneSvg(new XMLSerializer().serializeToString(svg))], { type: 'image/svg+xml' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = svgFileName(lang, i, svgs.length)
      document.body.appendChild(a)
      window.setTimeout(() => {
        a.click()
        a.remove()
        window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      }, i * 250) // 多頁時錯開，避免被瀏覽器當成連續彈出而擋掉
    })
  })
  const pngBtn = document.createElement('button')
  pngBtn.className = 'music-dl'
  pngBtn.textContent = tr('複製 PNG')
  pngBtn.title = tr('透明底、貼齊譜面外緣的 PNG')
  pngBtn.addEventListener('mousedown', (e) => e.preventDefault())
  pngBtn.addEventListener('click', async () => {
    const first = mount.querySelector('svg')
    if (!first) {
      err.textContent = tr('還沒有可複製的譜面')
      return
    }
    let ok = false
    try {
      ok = await copyElementPng(first as unknown as HTMLElement)
    } catch {
      ok = false
    }
    pngBtn.textContent = ok ? tr('已複製') : tr('複製失敗')
    window.setTimeout(() => (pngBtn.textContent = tr('複製 PNG')), 1400)
  })
  bar.append(pngBtn, dlBtn, hideScoreBtn, hideBtn)
  paintHide()
  const mount = document.createElement('div')
  mount.className = 'music-mount'
  const err = document.createElement('div')
  err.className = 'music-err'
  el.append(bar, mount, err)
  const b: Block = { lang, el, mount, err, bar, select, tp, player: null, transport: null, lit: [], litKey: '', ranges: [], base: 0, loading: false, engine: createEngine(lang), part: 'all', source, timer: 0, seq: 0, dead: false }
  select.addEventListener('change', () => {
    b.part = select.value
    schedule(b, true)
  })
  wireTransport(b, reg)
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
    if (existing) existing.base = pos + 1
    if (existing && existing.source !== code) {
      existing.source = code
      syncParts(existing)
      schedule(existing)
    }
    if (hidden.get(key) === 'code') decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'music-code-hidden' }))
    decos.push(
      Decoration.widget(
        pos + node.nodeSize,
        () => {
          let b = reg.blocks.get(key)
          if (!b || b.dead) {
            b = create(lang, code, key, reg)
            b.base = pos + 1
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
              b.player?.destroy()
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
const GONGCHE_TOOLS: ToolDef[] = [
  ...GONGCHE_CHARS.map((c) => ({ id: `ch:${c}`, label: c, title: `插入「${c}」加一個空格` })),
  { id: 'dot', label: '附點', title: '給前一個譜字加 .（已有就不重複）' },
  { id: 'octUp', label: '高八度', title: "給前一個譜字加 '（已有低八度記號則改為拿掉一個 ,）" },
  { id: 'bar', label: '小節線', title: '插入 | ' }
]
const TOOLS: Partial<Record<MusicLang, ToolDef[]>> = { abc: ABC_TOOLS, jianpu: JIANPU_TOOLS, tab: TAB_TOOLS, gongche: GONGCHE_TOOLS }

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
  const e = ctx.lang === 'abc' ? abcEdit(id as AbcTool, text, a, b) : ctx.lang === 'tab' ? tabEdit(id as TabTool, text, a, b) : ctx.lang === 'gongche' ? gongcheEdit(id, text, a, b) : jianpuEdit(id as JianpuTool, text, a, b)
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
        decorations: (st) => {
          const set = musicKey.getState(st)!
          const extra: Decoration[] = []
          const size = st.doc.content.size
          for (const b of reg.blocks.values()) {
            for (const [a, z] of b.ranges) {
              const from = b.base + a
              const to = b.base + z
              if (from >= 1 && to <= size && from < to) extra.push(Decoration.inline(from, to, { class: 'music-play-hl' }))
            }
          }
          return extra.length ? set.add(st.doc, extra) : set
        }
      },
      view(v) {
        reg.view = v
        const bar = document.createElement('div')
        bar.className = 'tb-bar music-tools'
        bar.style.display = 'none'
        document.body.appendChild(bar)
        let barLang: MusicLang | null = null
        let barKey = ''
        const makeButtons = (lang: MusicLang) => {
          const stamp = `${lang}|${getLang()}`
          if (barKey === stamp) return
          barKey = stamp
          barLang = lang
          bar.replaceChildren()
          for (const t of TOOLS[lang] ?? []) {
            const b = document.createElement('button')
            b.textContent = tr(t.label)
            b.title = tr(t.title)
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
              b.player?.destroy()
              b.engine.destroy()
              reg.blocks.delete(k)
            }
          }
        }
      }
  })
})
