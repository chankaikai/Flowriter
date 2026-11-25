import { tr } from '@/lib/i18n'
import { useEffect, useRef, useState } from 'react'
import type { Cmd } from '@/lib/commands'
import { formatKeys } from '@/lib/keys'
import { MENUS, type MenuItem } from '@/lib/menus'
import { Icon } from './Icon'

interface Props {
  commands: Cmd[]
  /** 開關類項目目前是否開啟：key 對應 menus.ts 的 check */
  checks: Record<string, boolean>
  /** 目前是否能對編輯器下指令（源碼模式時格式類命令停用） */
  editorEnabled: boolean
}

function Items({ items, props, close }: { items: MenuItem[]; props: Props; close: () => void }) {
  const [subOpen, setSubOpen] = useState<string | null>(null)
  return (
    <>
      {items.map((it, i) => {
        if ('sep' in it) return <div key={i} className="mn-sep" />
        if ('sub' in it)
          return (
            <div key={i} className="mn-item has-sub" onMouseEnter={() => setSubOpen(it.sub)} onMouseLeave={() => setSubOpen(null)}>
              <span className="mn-check" />
              <span className="mn-label">{tr(it.sub)}</span>
              <Icon name="chevron" size={13} />
              {subOpen === it.sub && (
                <div className="mn-panel sub" role="menu">
                  <Items items={it.items} props={props} close={close} />
                </div>
              )}
            </div>
          )
        const cmd = props.commands.find((c) => c.id === it.cmd)
        if (!cmd) return null
        const disabled = !!cmd.editorOnly && !props.editorEnabled
        const on = it.check ? props.checks[it.check] : false
        const keys = cmd.keys?.[0] ? formatKeys(cmd.keys[0]).join(' ') : ''
        return (
          <button
            key={i}
            role="menuitem"
            className={`mn-item${disabled ? ' off' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            disabled={disabled}
            onClick={() => {
              close()
              // 等選單收起、焦點回到編輯器後再執行，避免格式作用在選單上
              window.setTimeout(() => cmd.run(), 0)
            }}
          >
            <span className="mn-check">{on && <Icon name="check" size={13} />}</span>
            <span className="mn-label">{tr(it.label ?? cmd.title)}</span>
            <span className="mn-keys">{keys}</span>
          </button>
        )
      })}
    </>
  )
}

/** 視窗左上角的傳統選單列：檔案、編輯、插入、格式、檢視、工具、說明。 */
export function MenuBar(props: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <nav className="menubar" ref={root} role="menubar">
      {MENUS.map((m) => (
        <div key={m.id} className="mn-top">
          <button
            className={`mn-btn${open === m.id ? ' on' : ''}`}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === m.id}
            onClick={() => setOpen(open === m.id ? null : m.id)}
            onMouseEnter={() => open && setOpen(m.id)}
          >
            {tr(m.label)}
          </button>
          {open === m.id && (
            <div className="mn-panel" role="menu">
              <Items items={m.items} props={props} close={() => setOpen(null)} />
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
