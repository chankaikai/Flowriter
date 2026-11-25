import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { confirmBox } from '@/lib/confirm'
import type { DirEntry, SearchHit } from '../../../shared/types'
import type { OutlineItem } from '@/lib/markdown'
import type { SidebarTab } from '@/lib/settings'
import { basename, stripExt } from '@/lib/path'
import { Icon } from './Icon'
import { Segmented } from './Segmented'

/* ------------------------------ 文件樹 ------------------------------ */

type Editing = { kind: 'new'; dir: string } | { kind: 'rename'; entry: DirEntry }
interface Menu {
  x: number
  y: number
  entry: DirEntry | null
}

function InlineInput({
  initial,
  placeholder,
  onSubmit,
  onCancel
}: {
  initial: string
  placeholder?: string
  onSubmit(v: string): void
  onCancel(): void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // 重命名時只選取檔名主體，保留副檔名
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])
  const finish = (ok: boolean) => {
    if (done.current) return
    done.current = true
    const v = ref.current?.value.trim() ?? ''
    if (ok && v) onSubmit(v)
    else onCancel()
  }
  return (
    <input
      ref={ref}
      className="inline-input"
      defaultValue={initial}
      placeholder={placeholder}
      spellCheck={false}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
    />
  )
}

function FileTree({
  root,
  activePath,
  newSignal,
  onOpen,
  onCreated,
  onRenamed,
  onTrashed
}: {
  root: string
  activePath: string | null
  newSignal: number
  onOpen(path: string): void
  onCreated(path: string): void
  onRenamed(from: string, to: string): void
  onTrashed(path: string): void
}) {
  const [cache, setCache] = useState<Record<string, DirEntry[]>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Editing | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)

  const load = useCallback(async (dir: string) => {
    const list = await window.api.readDir(dir)
    setCache((c) => ({ ...c, [dir]: list }))
  }, [])

  useEffect(() => {
    setCache({})
    setOpen(new Set())
    setEditing(null)
    load(root)
  }, [root, load])

  useEffect(() => {
    if (newSignal > 0) setEditing({ kind: 'new', dir: root })
  }, [newSignal, root])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')))

  const toggle = (dir: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(dir)) next.delete(dir)
      else {
        next.add(dir)
        if (!cache[dir]) load(dir)
      }
      return next
    })
  }

  const startNew = (dir: string) => {
    setOpen((prev) => new Set(prev).add(dir))
    if (!cache[dir]) load(dir)
    setEditing({ kind: 'new', dir })
  }

  const submit = async (v: string) => {
    const ed = editing
    setEditing(null)
    if (!ed) return
    if (ed.kind === 'new') {
      const p = await window.api.createFile(ed.dir, v)
      await load(ed.dir)
      if (p) onCreated(p)
    } else {
      const to = await window.api.renamePath(ed.entry.path, v)
      await load(parentOf(ed.entry.path))
      if (to && to !== ed.entry.path) onRenamed(ed.entry.path, to)
    }
  }

  const trash = async (e: DirEntry) => {
    const msg = e.isDir ? `將資料夾「${e.name}」移到回收桶？` : `將「${e.name}」移到回收桶？`
    if (!(await confirmBox(msg, '移到回收桶'))) return
    if (await window.api.trashPath(e.path)) {
      await load(parentOf(e.path))
      onTrashed(e.path)
    }
  }

  const newRow = (dir: string, depth: number) =>
    editing?.kind === 'new' && editing.dir === dir ? (
      <div className="tree-row editing" style={{ paddingLeft: 10 + depth * 14 }}>
        <span className="chev-gap" />
        <InlineInput initial="未命名.md" onSubmit={submit} onCancel={() => setEditing(null)} />
      </div>
    ) : null

  const render = (entries: DirEntry[], depth: number): ReactElement[] =>
    entries.map((e) => {
      const isOpen = open.has(e.path)
      const renaming = editing?.kind === 'rename' && editing.entry.path === e.path
      return (
        <div key={e.path} className={`tree-node${isOpen ? ' open' : ''}`}>
          {renaming ? (
            <div className="tree-row editing" style={{ paddingLeft: 10 + depth * 14 }}>
              <span className="chev-gap" />
              <InlineInput initial={e.name} onSubmit={submit} onCancel={() => setEditing(null)} />
            </div>
          ) : (
            <button
              className={`tree-row${e.path === activePath ? ' active' : ''}`}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => (e.isDir ? toggle(e.path) : onOpen(e.path))}
              onContextMenu={(ev) => {
                ev.preventDefault()
                ev.stopPropagation()
                setMenu({ x: ev.clientX, y: ev.clientY, entry: e })
              }}
              title={e.path}
            >
              {e.isDir ? <Icon name="chevron" size={14} className="chev" /> : <span className="chev-gap" />}
              <span className="tree-name">{e.isDir ? e.name : stripExt(e.name)}</span>
            </button>
          )}
          {e.isDir && (
            <div className="tree-children">
              <div>
                {newRow(e.path, depth + 1)}
                {cache[e.path] ? render(cache[e.path], depth + 1) : null}
              </div>
            </div>
          )}
        </div>
      )
    })

  const entries = cache[root]
  const menuItems: { label: string; run(): void; danger?: boolean }[] = []
  if (menu) {
    const dir = !menu.entry ? root : menu.entry.isDir ? menu.entry.path : parentOf(menu.entry.path)
    menuItems.push({ label: '新建文件', run: () => startNew(dir) })
    if (menu.entry) {
      const en = menu.entry
      menuItems.push({ label: '重命名', run: () => setEditing({ kind: 'rename', entry: en }) })
      menuItems.push({ label: '在檔案管理器中顯示', run: () => window.api.reveal(en.path) })
      menuItems.push({ label: '移到回收桶', run: () => void trash(en), danger: true })
    }
  }

  return (
    <div className="tree" onContextMenu={(ev) => { ev.preventDefault(); setMenu({ x: ev.clientX, y: ev.clientY, entry: null }) }}>
      {!entries && <div className="side-empty">{tr('載入中…')}</div>}
      {entries && newRow(root, 0)}
      {entries && entries.length === 0 && !editing && (
        <div className="side-empty">{tr('此資料夾中沒有 Markdown 檔案')}</div>
      )}
      {entries && render(entries, 0)}
      {menu && (
        <div
          className="ctx-menu"
          style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 170) }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menuItems.map((m) => (
            <button
              key={m.label}
              className={m.danger ? 'danger' : ''}
              onClick={() => {
                setMenu(null)
                m.run()
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------ 大綱 ------------------------------ */

function Outline({
  items,
  active,
  onJump,
  onMove
}: {
  items: OutlineItem[]
  active: number
  onJump(index: number, line: number): void
  onMove(from: number, to: number): void
}) {
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  if (items.length === 0) return <div className="side-empty">{tr('尚無標題')}</div>
  const minLevel = Math.min(...items.map((i) => i.level))
  /** 游標在列的下半部時，落點是「該段落（含子標題）之後」 */
  const afterSection = (i: number) => {
    for (let j = i + 1; j < items.length; j++) if (items[j].level <= items[i].level) return j
    return items.length
  }
  const dropIndex = (e: React.DragEvent, i: number) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientY < r.top + r.height / 2 ? i : afterSection(i)
  }
  return (
    <div className="outline" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}>
      {items.map((it, i) => (
        <button
          key={`${it.line}-${i}`}
          className={`outline-row l${it.level}${i === active ? ' active' : ''}${drag === i ? ' dragging' : ''}${over === i ? ' drop-before' : ''}${over === items.length && i === items.length - 1 ? ' drop-end' : ''}`}
          style={{ paddingLeft: 12 + (it.level - minLevel) * 14 }}
          onClick={() => onJump(i, it.line)}
          title={`${it.text}（可拖曳調整章節順序）`}
          draggable
          onDragStart={(e) => {
            setDrag(i)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', it.text)
          }}
          onDragOver={(e) => {
            if (drag == null) return
            e.preventDefault()
            setOver(dropIndex(e, i))
          }}
          onDrop={(e) => {
            if (drag == null) return
            e.preventDefault()
            onMove(drag, dropIndex(e, i))
            setDrag(null)
            setOver(null)
          }}
          onDragEnd={() => {
            setDrag(null)
            setOver(null)
          }}
        >
          <span>{it.text}</span>
        </button>
      ))}
    </div>
  )
}

/* ------------------------------ 全域搜尋 ------------------------------ */

function Highlighted({ text, query }: { text: string; query: string }) {
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0 || !query) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  )
}

function FolderSearch({
  root,
  focusSignal,
  onOpen
}: {
  root: string | null
  focusSignal: number
  onOpen(path: string, query: string): void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [focusSignal])

  useEffect(() => {
    if (!root || !q.trim()) {
      setHits([])
      setBusy(false)
      return
    }
    setBusy(true)
    const id = ++seq.current
    const t = window.setTimeout(async () => {
      const r = await window.api.searchFolder(root, q)
      if (id === seq.current) {
        setHits(r)
        setBusy(false)
      }
    }, 250)
    return () => window.clearTimeout(t)
  }, [q, root])

  const groups = new Map<string, SearchHit[]>()
  for (const h of hits) groups.set(h.path, [...(groups.get(h.path) ?? []), h])

  return (
    <div className="fsearch">
      <div className="field">
        <Icon name="search" size={15} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={root ? '搜尋資料夾內的內容' : '請先開啟資料夾'}
          disabled={!root}
          spellCheck={false}
        />
      </div>
      <div className="fsearch-results">
        {q.trim() && !busy && hits.length === 0 && <div className="side-empty">{tr('沒有找到結果')}</div>}
        {[...groups.entries()].map(([path, list]) => (
          <div key={path} className="fgroup">
            <div className="fgroup-title">
              {stripExt(basename(path))}
              <span>{list.length}</span>
            </div>
            {list.slice(0, 8).map((h) => (
              <button key={h.line} className="fhit" onClick={() => onOpen(path, q.trim())}>
                <span className="ln">{h.line}</span>
                <span className="tx">
                  <Highlighted text={h.text} query={q.trim()} />
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ 側邊欄本體 ------------------------------ */

export interface SidebarProps {
  open: boolean
  tab: SidebarTab
  onTab(t: SidebarTab): void
  folder: string | null
  onOpenFolder(): void
  activePath: string | null
  onOpenFile(path: string, find?: string): void
  onCreated(path: string): void
  onRenamed(from: string, to: string): void
  onTrashed(path: string): void
  outline: OutlineItem[]
  activeHeading: number
  onJump(index: number, line: number): void
  onMoveSection(from: number, to: number): void
  searchFocusSignal: number
}

import logo from '../assets/logo.png'
import { tr } from '@/lib/i18n'

export function Sidebar(p: SidebarProps) {
  const [newSignal, setNewSignal] = useState(0)
  return (
    <aside className="sidebar" data-open={p.open} aria-hidden={!p.open}>
      <div className="sidebar-inner">
        <div className="sidebar-head">
          <span className="folder-name" title={p.folder ?? ''}>
            {p.folder ? basename(p.folder) : (<><img className="brand-logo" src={logo} alt="" />Flowiter</>)}
          </span>
          <div className="head-actions">
            {p.folder && (
              <button
                className="icon-btn"
                onClick={() => {
                  p.onTab('files')
                  setNewSignal((n) => n + 1)
                }}
                title={tr('新建文件')}
              >
                <Icon name="plus" />
              </button>
            )}
            <button className="icon-btn" onClick={p.onOpenFolder} title={tr('開啟資料夾')}>
              <Icon name="folderOpen" />
            </button>
          </div>
        </div>
        <Segmented<SidebarTab>
          className="side-tabs"
          value={p.tab}
          onChange={p.onTab}
          options={[
            { value: 'files', label: '文件' },
            { value: 'outline', label: '大綱' },
            { value: 'search', label: '搜尋' }
          ]}
        />
        <div className="side-body">
          {p.tab === 'files' &&
            (p.folder ? (
              <FileTree
                root={p.folder}
                activePath={p.activePath}
                newSignal={newSignal}
                onOpen={p.onOpenFile}
                onCreated={p.onCreated}
                onRenamed={p.onRenamed}
                onTrashed={p.onTrashed}
              />
            ) : (
              <div className="side-empty">
                <p>{tr('尚未開啟資料夾')}</p>
                <button className="btn" onClick={p.onOpenFolder}>
                  開啟資料夾
                </button>
              </div>
            ))}
          {p.tab === 'outline' && <Outline items={p.outline} active={p.activeHeading} onJump={p.onJump} onMove={p.onMoveSection} />}
          {p.tab === 'search' && (
            <FolderSearch root={p.folder} focusSignal={p.searchFocusSignal} onOpen={p.onOpenFile} />
          )}
        </div>
      </div>
    </aside>
  )
}
