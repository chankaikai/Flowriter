import { useState } from 'react'
import type { Cmd } from '@/lib/commands'
import { formatKeys } from '@/lib/keys'
import { RIBBON } from '@/lib/menus'
import { Icon, type IconName } from './Icon'
import { tr } from '@/lib/i18n'

interface Props {
  commands: Cmd[]
  checks: Record<string, boolean>
  editorEnabled: boolean
  collapsed: boolean
  onCollapse(v: boolean): void
  /** 依狀態改變某個按鈕的名稱／圖示（例如段落已上鎖時顯示「段落解鎖」） */
  overrides?: Record<string, { label?: string; icon?: IconName }>
}

/** 仿 Word 的功能區：上方分頁，下方依群組排列按鈕；可收合。 */
export function Ribbon({ commands, checks, editorEnabled, collapsed, onCollapse, overrides }: Props) {
  const [tab, setTab] = useState(RIBBON[0].id)
  const cur = RIBBON.find((t) => t.id === tab) ?? RIBBON[0]
  return (
    <div className={`ribbon${collapsed ? ' collapsed' : ''}`}>
      <div className="rb-tabs" role="tablist">
        <button className="rb-fold" title={collapsed ? '展開功能區' : '摺疊功能區（雙擊分頁也可以）'} aria-label={collapsed ? '展開功能區' : '摺疊功能區'} onClick={() => onCollapse(!collapsed)}>
          <Icon name={collapsed ? 'down' : 'up'} size={15} />
        </button>
        {RIBBON.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === tab}
            className={`rb-tab${t.id === tab ? ' on' : ''}`}
            onClick={() => {
              setTab(t.id)
              if (collapsed) onCollapse(false)
            }}
            onDoubleClick={() => onCollapse(!collapsed)}
          >
            {tr(t.label)}
          </button>
        ))}
      </div>
      {!collapsed && (
        <div className="rb-body" role="toolbar">
          {cur.groups.map((g) => (
            <div key={g.label} className="rb-group">
              <div className="rb-items">
                {g.items.map((it) => {
                  const cmd = commands.find((c) => c.id === it.cmd)
                  if (!cmd) return null
                  const disabled = !!cmd.editorOnly && !editorEnabled
                  const on = it.check ? checks[it.check] : false
                  const ov = overrides?.[it.cmd]
                  const label = ov?.label ?? it.label
                  const icon = ov?.icon ?? it.icon
                  const k = cmd.keys?.[0] ? ` (${formatKeys(cmd.keys[0]).join(' ')})` : ''
                  return (
                    <button
                      key={it.cmd}
                      className={`rb-btn lg${on ? ' on' : ''}`}
                      disabled={disabled}
                      title={`${label ?? cmd.title}${k}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => cmd.run()}
                    >
                      <span className={`rb-ico${it.glyph ? ' glyph' : ''}`}>
                        {it.glyph ? it.glyph : icon ? <Icon name={icon} size={22} /> : null}
                      </span>
                      <span className="rb-lbl">{label}</span>
                    </button>
                  )
                })}
              </div>
              <div className="rb-glabel">{tr(g.label)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
