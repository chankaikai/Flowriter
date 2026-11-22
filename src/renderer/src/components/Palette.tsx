import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileListItem } from '../../../shared/types'
import type { Cmd } from '@/lib/commands'
import { formatKeys } from '@/lib/keys'
import { fuzzyScore } from '@/lib/markdown'
import { basename, stripExt } from '@/lib/path'

interface Item {
  key: string
  title: string
  hint?: string
  keys?: string[]
  run(): void
}

export function Palette({
  mode,
  commands,
  recent,
  folder,
  onClose,
  onOpenFile,
  onOpenFolder
}: {
  mode: 'files' | 'commands' | 'recent' | null
  commands: Cmd[]
  recent: string[]
  folder: string | null
  onClose(): void
  onOpenFile(path: string): void
  onOpenFolder(): void
}) {
  const open = mode !== null
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [files, setFiles] = useState<FileListItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setSel(0)
    requestAnimationFrame(() => inputRef.current?.focus())
    if (mode === 'files' && folder) window.api.listAll(folder).then(setFiles)
  }, [open, mode, folder])

  const items: Item[] = useMemo(() => {
    let all: Item[] = []
    if (mode === 'commands') {
      all = commands.map((c) => ({
        key: c.id,
        title: c.title,
        hint: c.group,
        keys: c.keys?.[0] ? formatKeys(c.keys[0]) : undefined,
        run: c.run
      }))
    } else if (mode === 'recent') {
      all = recent.map((p) => ({ key: p, title: stripExt(basename(p)), hint: p, run: () => onOpenFile(p) }))
    } else if (mode === 'files') {
      all = files.map((f) => ({
        key: f.path,
        title: stripExt(f.name),
        hint: f.rel,
        run: () => onOpenFile(f.path)
      }))
    }
    if (!q) return all.slice(0, 60)
    return all
      .map((it) => ({ it, s: fuzzyScore(q, it.title + ' ' + (it.hint ?? '')) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 60)
      .map((x) => x.it)
  }, [mode, commands, files, recent, q, onOpenFile])

  useEffect(() => setSel(0), [q, mode])

  useEffect(() => {
    listRef.current?.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel, items])

  const choose = (it?: Item) => {
    if (!it) return
    onClose()
    // 等關閉動畫起步後再執行，避免焦點被覆蓋層搶走
    requestAnimationFrame(() => it.run())
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(items[sel])
    }
  }

  return (
    <div className={`overlay${open ? ' open' : ''}`} onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mode === 'commands' ? '輸入命令…' : mode === 'recent' ? '最近開啟的檔案…' : '搜尋檔案…'}
          spellCheck={false}
        />
        <div className="pal-list" ref={listRef}>
          {mode === 'files' && !folder && (
            <div className="pal-empty">
              尚未開啟資料夾 <button className="btn sm" onClick={() => { onClose(); onOpenFolder() }}>開啟</button>
            </div>
          )}
          {items.map((it, i) => (
            <div
              key={it.key}
              className={`pal-item${i === sel ? ' sel' : ''}`}
              onMouseMove={() => setSel(i)}
              onClick={() => choose(it)}
            >
              <span className="pal-title">{it.title}</span>
              {it.hint && <span className="pal-hint">{it.hint}</span>}
              {it.keys && (
                <span className="pal-keys">
                  {it.keys.map((k, j) => (
                    <kbd key={j}>{k}</kbd>
                  ))}
                </span>
              )}
            </div>
          ))}
          {open && items.length === 0 && (mode !== 'files' || folder) && (
            <div className="pal-empty">沒有符合的項目</div>
          )}
        </div>
      </div>
    </div>
  )
}
