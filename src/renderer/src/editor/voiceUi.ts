/**
 * 語音便籤：在錨定段落的下方插入「聲紋小卡」（Widget Decoration），點擊播放、× 刪除。
 * 只加畫面裝飾，不改文件內容；資料由 App 透過 setVoiceNotes 交進來。
 */
import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { EditorView } from '@milkdown/kit/prose/view'
import { anchorIndex, anchorOf, fmtDur, type VoiceNote } from '@/lib/voice'
import { tr } from '@/lib/i18n'

const key = new PluginKey<{ notes: VoiceNote[]; deco: DecorationSet }>('inkwell-voice')
export interface VoiceBridge {
  onDelete: (id: string) => void
  onPatch: (id: string, patch: { text?: string; hidden?: boolean }) => void
  /** 轉文字：成功回 null，失敗回錯誤訊息 */
  onTranscribe: (id: string) => Promise<string | null>
}
const bridge: { docPath: string } & VoiceBridge = { docPath: '', onDelete: () => {}, onPatch: () => {}, onTranscribe: async () => '' }

/** 同一時間只播一則；換播另一則或刪除時先停掉前一則。 */
let current: { id: string; audio: HTMLAudioElement; url: string; stop: () => void } | null = null
function stopCurrent(): void {
  current?.stop()
  current = null
}

function card(n: VoiceNote, orphan: boolean): HTMLElement {
  const el = document.createElement('div')
  el.className = 'voice-card' + (orphan ? ' orphan' : '')
  el.contentEditable = 'false'
  el.dataset.voice = n.id
  el.title = orphan ? tr('這則語音原本掛的段落已被改掉，先放在文末') : ''
  const play = document.createElement('button')
  play.type = 'button'
  play.className = 'voice-play'
  play.textContent = '▶'
  play.setAttribute('aria-label', tr('播放'))
  const wave = document.createElement('div')
  wave.className = 'voice-wave'
  for (const p of n.peaks) {
    const b = document.createElement('i')
    b.style.height = `${Math.round(10 + p * 90)}%`
    wave.appendChild(b)
  }
  const time = document.createElement('span')
  time.className = 'voice-time'
  time.textContent = fmtDur(n.dur)
  const del = document.createElement('button')
  del.type = 'button'
  del.className = 'voice-del'
  del.textContent = '×'
  del.title = tr('刪除這則語音')
  del.setAttribute('aria-label', tr('刪除這則語音'))
  // 轉文字（只支援中文）：沒轉過→「轉文字」；轉過→「隱藏文字」；已隱藏→「查看文字」。結果存在 voice.json，關掉文件再開也一樣。
  const tt = document.createElement('button')
  tt.type = 'button'
  tt.className = 'voice-tt'
  const paintTt = () => {
    tt.textContent = !n.text ? tr('轉文字') : n.hidden ? tr('查看文字') : tr('隱藏文字')
    tt.title = !n.text ? tr('把這段語音轉成文字（只支援中文）') : ''
  }
  paintTt()
  el.append(play, wave, time, tt, del)
  if (n.text && !n.hidden) {
    const box = document.createElement('div')
    box.className = 'voice-txt'
    box.textContent = n.text
    el.append(box)
  }

  const reset = () => {
    play.textContent = '▶'
    el.classList.remove('playing')
    el.style.setProperty('--vp', '0')
    time.textContent = fmtDur(n.dur)
  }
  const tap = (b: HTMLElement, f: () => void) => {
    b.addEventListener('mousedown', (e) => e.preventDefault()) // 不搶編輯器焦點
    b.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      f()
    })
  }
  tap(play, async () => {
    if (current?.id === n.id) return stopCurrent()
    stopCurrent()
    const buf = await window.api.voiceLoad(bridge.docPath, n.id)
    if (!buf) {
      time.textContent = tr('找不到音檔')
      return
    }
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/webm' }))
    const audio = new Audio(url)
    const stop = () => {
      audio.pause()
      URL.revokeObjectURL(url)
      reset()
    }
    current = { id: n.id, audio, url, stop }
    audio.addEventListener('timeupdate', () => {
      const d = n.dur || audio.duration || 1
      el.style.setProperty('--vp', String(Math.min(1, audio.currentTime / d)))
      time.textContent = fmtDur(audio.currentTime)
    })
    audio.addEventListener('ended', () => {
      if (current?.audio === audio) current = null
      stop()
    })
    audio.addEventListener('error', () => {
      if (current?.audio === audio) current = null
      stop()
      time.textContent = tr('無法播放')
    })
    el.classList.add('playing')
    play.textContent = '❚❚'
    void audio.play().catch(() => {
      if (current?.audio === audio) current = null
      stop()
    })
  })
  tap(tt, async () => {
    if (!n.text) {
      tt.disabled = true
      tt.textContent = tr('轉換中…')
      const e = await bridge.onTranscribe(n.id)
      tt.disabled = false
      if (e) {
        paintTt()
        time.textContent = e.slice(0, 60)
        tt.title = e
      }
      return
    }
    bridge.onPatch(n.id, { hidden: !n.hidden })
  })
  tap(del, () => {
    if (current?.id === n.id) stopCurrent()
    bridge.onDelete(n.id)
  })
  return el
}

function build(doc: any, notes: VoiceNote[]): DecorationSet {
  if (!notes.length) return DecorationSet.empty
  const blocks: { text: string; end: number }[] = []
  doc.forEach((n: any, off: number) => {
    // 只錨定頂層段落／標題等文字區塊（widget 放在區塊結尾之後，不進文字內容）
    blocks.push({ text: n.isTextblock && !n.type.spec.code ? n.textContent : '', end: off + n.nodeSize })
  })
  // 清單、引用、表格裡的段落也能掛語音：改成走訪所有文字區塊
  blocks.length = 0
  doc.descendants((n: any, pos: number) => {
    if (n.isTextblock) {
      if (!n.type.spec.code) blocks.push({ text: n.textContent, end: pos + n.nodeSize })
      return false
    }
    return true
  })
  const texts = blocks.map((b) => b.text)
  const decos: Decoration[] = []
  for (const n of notes) {
    const i = anchorIndex(texts, n.quote)
    const pos = i >= 0 ? blocks[i].end : doc.content.size
    decos.push(Decoration.widget(pos, () => card(n, i < 0), { side: 1, key: `voice-${n.id}-${i < 0 ? 'o' : i}-${n.text ? 1 : 0}${n.hidden ? 'h' : ''}-${(n.text ?? '').length}`, ignoreSelection: true, stopEvent: () => true }))
  }
  return DecorationSet.create(doc, decos)
}

export const voicePlugin = $prose(
  () =>
    new Plugin({
      key,
      state: {
        init: (_c, st) => ({ notes: [], deco: build(st.doc, []) }),
        apply(t, old, _o, st) {
          const meta = t.getMeta(key) as VoiceNote[] | undefined
          if (meta) return { notes: meta, deco: build(t.doc, meta) }
          if (t.docChanged) return { notes: old.notes, deco: build(t.doc, old.notes) }
          return old
        }
      },
      props: { decorations: (st) => key.getState(st)?.deco }
    })
)

export function setVoiceNotes(view: EditorView, notes: VoiceNote[], docPath: string, handlers: VoiceBridge): void {
  bridge.docPath = docPath
  Object.assign(bridge, handlers)
  if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, notes).setMeta('addToHistory', false))
}

/** 游標所在頂層文字區塊的錨點；不在文字區塊裡（或是程式碼區塊）回 null。 */
export function caretAnchor(view: EditorView): string | null {
  const { $from } = view.state.selection
  if ($from.depth < 1) return null
  const n = $from.parent // 游標所在的最內層文字區塊（清單項目、引用、表格格子裡的段落也行）
  if (!n.isTextblock || n.type.spec.code) return null
  const a = anchorOf(n.textContent)
  return a || null
}
export const stopVoicePlayback = stopCurrent
