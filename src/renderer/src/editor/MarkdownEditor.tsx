import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { callCommand, insert } from '@milkdown/kit/utils'
import {
  createCodeBlockCommand,
  insertHrCommand,
  liftListItemCommand,
  sinkListItemCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  toggleStrongCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInHeadingCommand,
  wrapInOrderedListCommand
} from '@milkdown/kit/preset/commonmark'
import { insertTableCommand, toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { redoCommand, undoCommand } from '@milkdown/kit/plugin/history'
import type { EditorView } from '@milkdown/kit/prose/view'

import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'
import 'katex/dist/katex.min.css'

import {
  activeBlockPlugin,
  makeChangePlugin,
  searchClear,
  searchPlugin,
  wikiPlugin,
  searchReplaceAll,
  searchReplaceCurrent,
  searchSet,
  searchStep,
  typewriterPlugin,
  type SearchInfo
} from './plugins'
import { TextSelection } from '@milkdown/kit/prose/state'
import { runBlockAtCaret } from './runUi'
import { languages } from '@codemirror/language-data'
import { LanguageDescription, LanguageSupport, StreamLanguage } from '@codemirror/language'
import { caretAnchor, setVoiceNotes, stopVoicePlayback, type VoiceBridge } from './voiceUi'
import { setNotesMarks, type NoteMark } from './notesUi'
import { convertList } from './listOps'
import type { VoiceNote } from '@/lib/voice'
import { blockTexts } from './extras'
import { locate, ordinalOf, snippetOf, type CaretInfo } from '@/lib/caretMap'
import { refreshLens, gotoBlockOffset, setTaskChecked, insertCallout, removeFrontMatter, isLockedAtCaret, setLockTexts, toggleLockAtCaret, gotoText, textFromCaret, gotoTask, sortTable, BILINGUAL_SNIPPET, extraPlugins, insertFootnote, insertFrontMatter, jumpFootnote, listFootnotes, renameFootnote, type FootnoteInfo } from './extras'
import { LARGE_DOC } from '@/lib/markdown'

export type FormatName =
  | 'strong' | 'em' | 'strike' | 'code' | 'link'
  | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p'
  | 'quote' | 'ul' | 'ol' | 'task' | 'codeblock' | 'math' | 'table' | 'hr'
  | 'undo' | 'redo' | 'toc' | 'footnote' | 'frontmatter' | 'bilingual' | 'callout' | 'callout:note' | 'callout:tip' | 'callout:important' | 'callout:warning' | 'callout:summary' | 'callout:quote' | 'frontmatter:remove' | 'sortasc' | 'sortdesc'

export interface EditorHandle {
  getMarkdown(): string
  focus(): void
  format(name: FormatName): void
  insert(markdown: string): void
  find(query: string, caseSensitive: boolean): SearchInfo
  findStep(dir: 1 | -1): SearchInfo
  replaceCurrent(text: string): SearchInfo
  replaceAll(text: string): SearchInfo
  clearFind(): void
  scrollToHeading(index: number): void
  scroller(): HTMLElement | null
  /** 目前選取的純文字（沒有選取時為空字串） */
  selectionText(): string
  setReadonly(ro: boolean): void
  /** 游標位置（ProseMirror 位置，不是字元偏移） */
  getCaret(): number
  /** 把游標移到指定位置並捲動到可見處；超出範圍會夾住。成功回傳 true */
  setCaret(pos: number): boolean
  /** 切換所見即所得／源碼時用的游標錨點 */
  caretInfo(): CaretInfo | null
  footnotes(): FootnoteInfo[]
  insertFootnote(label?: string): boolean
  renameFootnote(from: string, to: string): boolean
  restoreCaretInfo(info: CaretInfo): boolean
  refreshLens(): void
  /** 游標所在段落的語音錨點；不在文字段落回 null */
  voiceAnchor(): string | null
  /** 所有文字區塊（index 與 gotoBlock 一致），逆向大綱用 */
  blockTexts(): { index: number; text: string; skip: boolean }[]
  /** 同步語音便籤清單與刪除回呼 */
  setVoice(notes: VoiceNote[], docPath: string, handlers: VoiceBridge): void
  stopVoice(): void
  /** 同步頁邊便條圖示 */
  setNoteMarks(notes: NoteMark[], onOpen: (id: string) => void): void
  /** 跳到文字相符的任務項目 */
  gotoTask(text: string): boolean
  /** 跳到第 n 個文字區塊的指定偏移並高亮（儀表板／排版檢查用） */
  gotoBlock(blockIndex: number, offset?: number, len?: number): boolean
  /** 勾選／取消第 index 個任務（儀表盤雙向同步用） */
  setTask(index: number, checked: boolean): boolean
  /** 找到並選取第一處包含該文字的位置 */
  gotoText(text: string): boolean
  /** 從游標所在段落到文末的純文字 */
  textFromCaret(): string
  /** 游標前最多 max 個字元的純文字 */
  textBeforeCaret(max: number): string
  /** 把選取收成游標，停在選取尾端 */
  collapseToEnd(): void
  /** 切換游標所在段落的鎖定；回傳新狀態，游標不在可鎖的段落時回傳 null */
  toggleLock(): { locked: boolean; text: string } | null
  /** 以一組段落文字取代目前的鎖定清單 */
  setLocks(texts: string[]): void
  /** 插入指定行列數的表格 */
  insertTable(rows: number, cols: number): void
  /** 游標所在段落目前是否已上鎖 */
  lockedAtCaret(): boolean
  /** 執行游標所在的代碼塊（支援 JavaScript／Python）；不在可執行的代碼塊內回傳 false */
  runAtCaret(): boolean
  /** 游標的螢幕座標，沒有編輯器或找不到時回傳 null */
  caretRect(): { left: number; top: number; bottom: number } | null
}

interface Props {
  initialValue: string
  autofocus?: boolean
  isDark: boolean
  /** 文檔有變動（不帶內容；需要內容時呼叫 getMarkdown） */
  onEdit(): void
  onReady?(): void
  uploadImage(file: File): Promise<string>
  resolveImageUrl(src: string): string
}

/** 先銷毀 ProseMirror 視圖（此時上下文仍完整），再釋放 Milkdown，避免釋放途中還有更新抵達 */
function destroyEditor(crepe: Crepe): void {
  try {
    crepe.editor.action((ctx) => ctx.get(editorViewCtx).destroy())
  } catch {
    /* 尚未建立完成或已釋放 */
  }
  void crepe.destroy()
}

const MERMAID_LANG = LanguageDescription.of({
  name: 'Mermaid',
  alias: ['mermaid', 'mmd'],
  extensions: ['mmd', 'mermaid'],
  support: new LanguageSupport(StreamLanguage.define({ token: (stream) => (stream.skipToEnd(), null) }))
})

/** 樂譜圍欄：語言名固定為 abc（其餘譜種在後續階段加入）；內文是純文字，不做語法上色 */
const ABC_LANG = LanguageDescription.of({
  name: 'abc',
  alias: ['abc'],
  extensions: ['abc'],
  support: new LanguageSupport(StreamLanguage.define({ token: (stream) => (stream.skipToEnd(), null) }))
})

/** 簡譜圍欄：語言名固定為 jianpu；內文是純文字 */
const TAB_LANG = LanguageDescription.of({
  name: 'tab',
  alias: ['tab'],
  extensions: ['tab'],
  support: new LanguageSupport(StreamLanguage.define({ token: (stream) => (stream.skipToEnd(), null) }))
})
/** 純文字：讓代碼塊也能寫一般文字（語言標籤 text / txt / plain） */
const TEXT_LANG = LanguageDescription.of({ name: 'Text', alias: ['text', 'txt', 'plain', 'plaintext'], extensions: ['txt'], support: new LanguageSupport(StreamLanguage.define({ token: (stream) => (stream.skipToEnd(), null) })) })
const MEI_LANG = LanguageDescription.of({ name: 'mei', alias: ['mei'], extensions: ['mei'], support: new LanguageSupport(StreamLanguage.define({ token: (stream) => (stream.skipToEnd(), null) })) })
const JIANPU_LANG = LanguageDescription.of({
  name: 'jianpu',
  alias: ['jianpu'],
  extensions: ['jianpu'],
  support: new LanguageSupport(StreamLanguage.define({ token: (stream) => (stream.skipToEnd(), null) }))
})

export const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(props, ref) {
  const rootRef = useRef<HTMLDivElement>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props

  const view = (): EditorView | null => {
    const c = crepeRef.current
    if (!c) return null
    try {
      const v = c.editor.action((ctx) => ctx.get(editorViewCtx))
      return v.isDestroyed ? null : v
    } catch {
      return null
    }
  }

  useEffect(() => {
    const mount = rootRef.current
    if (!mount) return
    let cancelled = false
    // 每次掛載使用獨立容器，StrictMode 重複執行 effect 時不會互相干擾
    const root = document.createElement('div')
    mount.appendChild(root)

    const crepe = new Crepe({
      root,
      defaultValue: propsRef.current.initialValue,
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: '開始書寫…', mode: 'doc' },
        // 代碼塊的語言清單加入 Mermaid（內建清單沒有它），選了之後即時渲染成圖
        [Crepe.Feature.CodeMirror]: { languages: [TEXT_LANG, ...languages, MERMAID_LANG, ABC_LANG, JIANPU_LANG, TAB_LANG, MEI_LANG] },
        [Crepe.Feature.ImageBlock]: {
          onUpload: (file: File) => propsRef.current.uploadImage(file),
          proxyDomURL: (url: string) => propsRef.current.resolveImageUrl(url)
        }
      }
    })

    crepe.editor
      .use(activeBlockPlugin)
      .use(typewriterPlugin)
      .use(searchPlugin)
      .use(wikiPlugin)
      .use(extraPlugins)
      .use(makeChangePlugin(() => propsRef.current.onEdit()))

    const start = async () => {
      // 大文件解析會阻塞主執行緒：先讓出兩幀，載入提示才畫得出來
      if (propsRef.current.initialValue.length > LARGE_DOC) {
        await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 30)))
      }
      if (cancelled) {
        root.remove()
        return
      }
      await crepe.create()
      if (cancelled) {
        destroyEditor(crepe)
        root.remove()
        return
      }
      crepeRef.current = crepe
      if (propsRef.current.autofocus) view()?.focus()
      propsRef.current.onReady?.()
    }
    void start()

    return () => {
      cancelled = true
      if (crepeRef.current === crepe) {
        crepeRef.current = null
        destroyEditor(crepe)
        root.remove()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tab / Shift+Tab：列表縮排與反縮排
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onKey = (e: KeyboardEvent) => {
      const bracket = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === '[' || e.key === ']')
      if (!bracket && (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing)) return
      const c = crepeRef.current
      const v = view()
      if (!c || !v) return
      if ((e.target as HTMLElement).closest('.cm-editor')) return
      const { $from } = v.state.selection
      let inList = false
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'list_item') {
          inList = true
          break
        }
      }
      if (!inList) return
      e.preventDefault()
      e.stopPropagation()
      c.editor.action(callCommand((bracket ? e.key === '[' : e.shiftKey) ? liftListItemCommand.key : sinkListItemCommand.key))
    }
    root.addEventListener('keydown', onKey, true)
    return () => root.removeEventListener('keydown', onKey, true)
  }, [])

  // Ctrl/⌘ + 點擊連結：以系統瀏覽器開啟
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('.fn-ref, .fn-label')) {
        const v = view()
        if (v && jumpFootnote(v, t)) return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
      if (!a) return
      e.preventDefault()
      window.api.openExternal(a.href)
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [])

  useImperativeHandle(ref, () => ({
    getMarkdown: () => crepeRef.current?.getMarkdown() ?? '',
    focus: () => view()?.focus(),
    selectionText: () => {
      const v = view()
      if (!v) return ''
      const { from, to, empty } = v.state.selection
      return empty ? '' : v.state.doc.textBetween(from, to, '\n\n')
    },
    getCaret: () => view()?.state.selection.head ?? 0,
    footnotes: () => {
      const v = view()
      return v ? listFootnotes(v) : []
    },
    insertFootnote: (label) => {
      const v = view()
      return v ? insertFootnote(v, label) : false
    },
    renameFootnote: (from, to) => {
      const v = view()
      return v ? renameFootnote(v, from, to) : false
    },
    caretInfo: () => {
      const v = view()
      if (!v) return null
      const { $head, head } = v.state.selection
      const blocks: { text: string; first: string }[] = []
      let cur = -1
      v.state.doc.descendants((n: any, pos: number) => {
        if (!n.isTextblock) return true
        if (pos === $head.before($head.depth)) cur = blocks.length
        blocks.push({ text: n.textContent, first: n.firstChild?.isText ? n.firstChild.text ?? '' : n.textContent })
        return false
      })
      const frac = v.state.doc.content.size ? head / v.state.doc.content.size : 0
      if (cur < 0) return { snippet: '', ordinal: 0, col: 0, frac }
      const snippet = snippetOf(blocks[cur].first)
      const texts = blocks.map((b) => b.text)
      return { snippet, ordinal: snippet ? ordinalOf(texts, cur, snippet) : 0, col: Math.max(0, $head.parentOffset), frac }
    },
    restoreCaretInfo: (info) => {
      const v = view()
      if (!v) return false
      const found: { pos: number; text: string }[] = []
      v.state.doc.descendants((n: any, pos: number) => {
        if (!n.isTextblock) return true
        found.push({ pos, text: n.textContent })
        return false
      })
      const hit = locate(found.map((f) => f.text), info.snippet, info.ordinal)
      let target: number
      if (hit) {
        const f = found[hit.item]
        target = f.pos + 1 + Math.min(f.text.length, hit.at + info.col)
      } else {
        target = Math.round(info.frac * v.state.doc.content.size)
      }
      const h = ref && typeof ref === 'object' ? (ref.current as EditorHandle | null) : null
      return h ? h.setCaret(target) : false
    },
    refreshLens: () => {
      const v = view()
      if (v) refreshLens(v)
    },
    blockTexts: () => {
      const v = view()
      return v ? blockTexts(v) : []
    },
    voiceAnchor: () => {
      const v = view()
      return v ? caretAnchor(v) : null
    },
    setVoice: (notes, docPath, handlers) => {
      const v = view()
      if (v) setVoiceNotes(v, notes, docPath, handlers)
    },
    stopVoice: () => stopVoicePlayback(),
    setNoteMarks: (notes, onOpen) => {
      const v = view()
      if (v) setNotesMarks(v, notes, onOpen)
    },
    setCaret: (pos) => {
      const v = view()
      if (!v) return false
      const p = Math.max(1, Math.min(pos, v.state.doc.content.size))
      try {
        v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(p))).scrollIntoView())
        v.focus()
        // 剛開啟時版面（圖片、代碼塊、樂譜）還在撐開，一次捲動常常不準：
        // 依序在下一幀與 250ms、700ms 後把游標所在行重新置於視窗上三分之一處
        const settle = () => {
          try {
            const sc = v.dom.closest('.editor-scroll') as HTMLElement | null
            if (!sc) return
            const c = v.coordsAtPos(v.state.selection.head)
            const box = sc.getBoundingClientRect()
            const want = box.top + box.height / 3
            sc.scrollTop += c.top - want
          } catch {
            /* 視圖已銷毀 */
          }
        }
        requestAnimationFrame(settle)
        window.setTimeout(settle, 250)
        window.setTimeout(settle, 700)
        return true
      } catch {
        return false
      }
    },
    caretRect: () => {
      const v = view()
      if (!v) return null
      try {
        const c = v.coordsAtPos(v.state.selection.head)
        return { left: c.left, top: c.top, bottom: c.bottom }
      } catch {
        return null
      }
    },
    setReadonly: (ro) => {
      const v = view()
      if (v) v.setProps({ editable: () => !ro })
    },
    scroller: () => rootRef.current?.closest('.editor-scroll') as HTMLElement | null,

    format(name) {
      const c = crepeRef.current
      if (!c) return
      const run = (key: Parameters<typeof callCommand>[0], payload?: unknown) =>
        c.editor.action(callCommand(key as never, payload as never))
      switch (name) {
        case 'strong': run(toggleStrongCommand.key); break
        case 'em': run(toggleEmphasisCommand.key); break
        case 'strike': run(toggleStrikethroughCommand.key); break
        case 'code': run(toggleInlineCodeCommand.key); break
        case 'link': run(toggleLinkCommand.key, { href: 'https://' }); break
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
          run(wrapInHeadingCommand.key, Number(name[1])); break
        case 'p': run(turnIntoTextCommand.key); break
        case 'quote': run(wrapInBlockquoteCommand.key); break
        case 'ul': { const v = view(); if (!(v && convertList(v, 'ul'))) run(wrapInBulletListCommand.key); break }
        case 'ol': { const v = view(); if (!(v && convertList(v, 'ol'))) run(wrapInOrderedListCommand.key); break }
        case 'task': { const v = view(); if (!(v && convertList(v, 'task'))) c.editor.action(insert('- [ ] ')); break }
        case 'codeblock': run(createCodeBlockCommand.key); break
        case 'math': c.editor.action(insert('$$\n\n$$')); break
        case 'table': run(insertTableCommand.key, { row: 3, col: 3 }); break
        case 'hr': run(insertHrCommand.key); break
        case 'sortasc': { const v = view(); if (v && !sortTable(v, 'asc')) return; break }
        case 'sortdesc': { const v = view(); if (v && !sortTable(v, 'desc')) return; break }
        case 'bilingual': c.editor.action(insert(BILINGUAL_SNIPPET)); break
        case 'callout': case 'callout:note': { const v = view(); if (v) insertCallout(v, 'note'); break }
        case 'callout:tip': case 'callout:important': case 'callout:warning': case 'callout:summary': case 'callout:quote': {
          const v = view()
          if (v) insertCallout(v, name.slice('callout:'.length))
          break
        }
        case 'frontmatter:remove': { const v = view(); if (v) removeFrontMatter(v); break }
        case 'toc': c.editor.action(insert('[TOC]')); break
        case 'frontmatter': {
          const v = view()
          if (!v) return
          if (v.state.doc.firstChild?.type.name === 'inkwell_front_matter') removeFrontMatter(v)
          else insertFrontMatter(v)
          return
        }
        case 'footnote': { const v = view(); if (v) insertFootnote(v); return }
        case 'undo': run(undoCommand.key); break
        case 'redo': run(redoCommand.key); break
      }
      view()?.focus()
    },

    insert(markdown) {
      const c = crepeRef.current
      if (!c) return
      // 取代選取 / 插入：自己解析 Markdown 後用一般 transaction 寫入。
      // 先前直接用 Milkdown 的 insert()，在某些選取狀態下會丟出 "reading 'lastChild' of null"。
      let done = false
      try {
        c.editor.action((ctx) => {
          const v = ctx.get(editorViewCtx)
          const doc = ctx.get(parserCtx)(markdown)
          if (!doc || !doc.content || doc.content.childCount === 0) return
          const { from, to } = v.state.selection
          const frag = doc.content
          const only = frag.childCount === 1 ? frag.firstChild : null
          // 單一段落 → 當成行內文字替換，不會多出空段落
          const body = only && only.type.name === 'paragraph' ? only.content : frag
          v.dispatch(v.state.tr.replaceWith(from, to, body).scrollIntoView())
          done = true
        })
      } catch (e) {
        console.warn('[inkwell] insert via transaction failed, falling back', e)
      }
      if (!done) {
        try {
          c.editor.action(insert(markdown))
        } catch {
          const v = view()
          if (v) v.dispatch(v.state.tr.insertText(markdown))
        }
      }
      view()?.focus()
    },

    find: (q, cs) => {
      const v = view()
      return v ? searchSet(v, q, cs) : { total: 0, current: -1 }
    },
    findStep: (dir) => {
      const v = view()
      return v ? searchStep(v, dir) : { total: 0, current: -1 }
    },
    replaceCurrent: (t) => {
      const v = view()
      return v ? searchReplaceCurrent(v, t) : { total: 0, current: -1 }
    },
    replaceAll: (t) => {
      const v = view()
      return v ? searchReplaceAll(v, t) : { total: 0, current: -1 }
    },
    clearFind: () => {
      const v = view()
      if (v) searchClear(v)
    },

    textBeforeCaret(max) {
      const v = view()
      if (!v) return ''
      const pos = v.state.selection.from
      return v.state.doc.textBetween(Math.max(0, pos - max), pos, '\n', ' ')
    },
    collapseToEnd() {
      const v = view()
      if (!v) return
      const to = v.state.selection.to
      v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, to)))
    },
    toggleLock() {
      const v = view()
      if (!v) return null
      const r = toggleLockAtCaret(v)
      return r ? { locked: r.locked, text: r.text } : null
    },
    setLocks(texts) {
      const v = view()
      if (v) setLockTexts(v, texts)
    },
    insertTable(rows, cols) {
      const c = crepeRef.current
      if (!c) return
      const r = Math.max(1, Math.min(50, Math.floor(rows) || 1))
      const k = Math.max(1, Math.min(20, Math.floor(cols) || 1))
      c.editor.action(callCommand(insertTableCommand.key as never, { row: r, col: k } as never))
    },
    lockedAtCaret() {
      const v = view()
      return v ? isLockedAtCaret(v) : false
    },
    runAtCaret() {
      const v = view()
      return v ? runBlockAtCaret(v) : false
    },
    setTask(index, checked) {
      const v = view()
      return v ? setTaskChecked(v, index, checked) : false
    },
    gotoBlock(i, offset = 0, len = 0) {
      const v = view()
      return v ? gotoBlockOffset(v, i, offset, len) : false
    },
    gotoText(text) {
      const v = view()
      return v ? gotoText(v, text) : false
    },

    textFromCaret() {
      const v = view()
      return v ? textFromCaret(v) : ''
    },

    gotoTask(text) {
      const v = view()
      return v ? gotoTask(v, text) : false
    },

    scrollToHeading(index) {
      const v = view()
      if (!v) return
      const el = v.dom.querySelectorAll('h1,h2,h3,h4,h5,h6')[index] as HTMLElement | undefined
      const sc = rootRef.current?.closest('.editor-scroll') as HTMLElement | null
      if (!el || !sc) return
      const top = sc.scrollTop + (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) - 28
      sc.scrollTo({ top, behavior: 'smooth' })
    }
  }))

  return <div ref={rootRef} className="editor-root" />
})
