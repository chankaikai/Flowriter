import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  highlightActiveLine,
  keymap,
  rectangularSelection
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { openSearchPanel, search, selectNextOccurrence } from '@codemirror/search'
import { tags as t } from '@lezer/highlight'

export interface SourceHandle {
  getValue(): string
  focus(): void
  openSearch(): void
  scrollToLine(line: number): void
}

interface Props {
  value: string
  onEdit(): void
}

// 以 class 輸出，顏色全部由 CSS 變數決定，所以三套主題自動適配
const highlight = HighlightStyle.define([
  { tag: t.heading, class: 'tok-heading' },
  { tag: t.strong, class: 'tok-strong' },
  { tag: t.emphasis, class: 'tok-em' },
  { tag: t.strikethrough, class: 'tok-strike' },
  { tag: [t.link, t.url], class: 'tok-link' },
  { tag: t.monospace, class: 'tok-mono' },
  { tag: t.quote, class: 'tok-quote' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], class: 'tok-mark' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], class: 'tok-keyword' },
  { tag: [t.string, t.regexp, t.special(t.string)], class: 'tok-string' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'tok-number' },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'tok-comment' },
  { tag: [t.function(t.variableName), t.definition(t.variableName), t.propertyName], class: 'tok-fn' },
  { tag: [t.typeName, t.className, t.tagName], class: 'tok-type' }
])

export const SourceEditor = forwardRef<SourceHandle, Props>(function SourceEditor(
  { value, onEdit },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onEdit)
  onChangeRef.current = onEdit

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          EditorState.allowMultipleSelections.of(true), // 多光標：Alt+點擊、Ctrl/⌘+D
          rectangularSelection(),
          crosshairCursor(),
          search({ top: true }),
          keymap.of([
            { key: 'Mod-d', run: selectNextOccurrence, preventDefault: true },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap
          ]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current()
          })
        ]
      })
    })
    viewRef.current = view
    view.focus()
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 僅在掛載時以 value 初始化；之後內容由 CodeMirror 自己維護
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    getValue: () => viewRef.current?.state.doc.toString() ?? '',
    focus: () => viewRef.current?.focus(),
    openSearch: () => {
      const v = viewRef.current
      if (v) openSearchPanel(v)
    },
    scrollToLine(line) {
      const v = viewRef.current
      const sc = hostRef.current?.closest('.editor-scroll') as HTMLElement | null
      if (!v || !sc) return
      const l = v.state.doc.line(Math.max(1, Math.min(line + 1, v.state.doc.lines)))
      const block = v.lineBlockAt(l.from)
      const top = sc.scrollTop + (v.documentTop + block.top - sc.getBoundingClientRect().top) - 28
      sc.scrollTo({ top, behavior: 'smooth' })
      v.dispatch({ selection: { anchor: l.from } })
    }
  }))

  return <div ref={hostRef} className="source-root" />
})
