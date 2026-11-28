import type { Cmd } from '@/lib/commands'
import { formatKeys } from '@/lib/keys'
import { RIBBON } from '@/lib/menus'
import { useEffect, useState } from 'react'
import { Icon, type IconName } from './Icon'
import { SpacingControl } from './SpacingControl'
import type { Settings } from '@/lib/settings'
import { TablePicker } from './TablePicker'
import { tr } from '@/lib/i18n'

interface Props {
  commands: Cmd[]
  checks: Record<string, boolean>
  editorEnabled: boolean
  collapsed: boolean
  onCollapse(v: boolean): void
  /** 依狀態改變某個按鈕的名稱／圖示（例如段落已上鎖時顯示「段落解鎖」） */
  overrides?: Record<string, { label?: string; icon?: IconName; glyph?: string }>
  /** 從行列選擇器插入表格 */
  onInsertTable?(rows: number, cols: number): void
  /** 行高滑桿用的設定 */
  spacing?: { settings: Pick<Settings, 'lineHeight' | 'paraGap' | 'listLineHeight'>; update(p: Partial<Settings>): void }
}

/** 仿 Word 的功能區：上方分頁，下方依群組排列按鈕；可收合。 */
export function Ribbon({ commands, checks, editorEnabled, collapsed, onCollapse, overrides, onInsertTable, spacing }: Props) {
  const [subOpen, setSubOpen] = useState<string | null>(null)
  useEffect(() => {
    if (!subOpen) return
    const close = () => setSubOpen(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
    }
  }, [subOpen])
  const [tab, setTab] = useState(RIBBON[0].id)
  const cur = RIBBON.find((t) => t.id === tab) ?? RIBBON[0]
  return (
    <div className={`ribbon${collapsed ? ' collapsed' : ''}`}>
      <div className="rb-tabs" role="tablist">
        <button className="rb-fold" title={collapsed ? tr('展開功能區') : tr('摺疊功能區（雙擊分頁也可以）')} aria-label={collapsed ? tr('展開功能區') : tr('摺疊功能區')} onClick={() => onCollapse(!collapsed)}>
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
        <div className={`rb-body${cur.compact ? ' compact' : ''}`} role="toolbar">
          {cur.groups.map((g) => (
            <div key={g.label} className="rb-group">
              <div className="rb-items" style={cur.compact ? { display: 'grid', gridTemplateColumns: `repeat(${g.cols ?? Math.ceil(g.items.length / 2)}, auto)` } : undefined}>
                {g.items.map((it) => {
                  const cmd = commands.find((c) => c.id === it.cmd)
                  if (!cmd) return null
                  const disabled = !!cmd.editorOnly && !editorEnabled
                  const on = it.check ? checks[it.check] : false
                  const ov = overrides?.[it.cmd]
                  const label = it.label || ov?.label ? tr((ov?.label ?? it.label) as string) : undefined
                  const icon = ov?.icon ?? it.icon
                  const sm = !!cur.compact
                  const glyph = ov?.glyph ?? it.glyph
                  const gl = `rb-ico${glyph ? ' glyph' : ''}${it.gcls ? ` g-${it.gcls}` : ''}`
                  const k = cmd.keys?.[0] ? ` (${formatKeys(cmd.keys[0]).join(' ')})` : ''
                  if (it.grid) {
                    return (
                      <div key={it.cmd} className="rb-split" onMouseEnter={() => !disabled && setSubOpen(it.cmd)} onMouseLeave={() => setSubOpen((o) => (o === it.cmd ? null : o))} onMouseDown={(e) => e.stopPropagation()}>
                        <button
                          className={`rb-btn lg${subOpen === it.cmd ? ' on' : ''}`}
                          disabled={disabled}
                          title={tr('表格：滑過格子選擇行列數')}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setSubOpen(subOpen === it.cmd ? null : it.cmd)}
                        >
                          <span className="rb-ico glyph">{it.glyph}</span>
                          <span className="rb-lbl">{label} ▾</span>
                        </button>
                        {subOpen === it.cmd && (
                          <div className="rb-drop tp-drop">
                            <TablePicker
                              onPick={(r, c) => {
                                setSubOpen(null)
                                window.setTimeout(() => onInsertTable?.(r, c), 0)
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  }
                  if (it.lh) {
                    return (
                      <div key={it.cmd} className="rb-split" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                          className={`rb-btn ${sm ? 'sm' : 'lg'}${subOpen === it.cmd ? ' on' : ''}`}
                          title={tr('行高：段落內／段落間／清單，與設定同步')}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setSubOpen(subOpen === it.cmd ? null : it.cmd)}
                        >
                          <span className={gl}>{icon ? <Icon name={icon} size={sm ? 20 : 22} /> : null}</span>
                          {sm ? <span className="rb-caret">▾</span> : <span className="rb-lbl">{label} ▾</span>}
                        </button>
                        {subOpen === it.cmd && spacing && (
                          <div className="rb-drop sp-drop">
                            <SpacingControl settings={spacing.settings} update={spacing.update} />
                          </div>
                        )}
                      </div>
                    )
                  }
                  if (it.sub) {
                    return (
                      <div key={it.cmd} className={`rb-split${it.gapLeft ? ' gap-l' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
                        <button
                          className={`rb-btn ${sm ? 'sm' : 'lg'}${subOpen === it.cmd ? ' on' : ''}`}
                          disabled={disabled}
                          title={`${label ?? tr(cmd.title)} (${tr('點擊選擇類型')})`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setSubOpen(subOpen === it.cmd ? null : it.cmd)}
                        >
                          <span className={gl}>{glyph ? glyph : icon ? <Icon name={icon} size={sm ? 20 : 22} /> : null}</span>
                          {sm ? <span className="rb-caret">▾</span> : <span className="rb-lbl">{label} ▾</span>}
                        </button>
                        {subOpen === it.cmd && (
                          <div className="rb-drop" role="menu">
                            {it.sub.map((sc) => (
                              <button
                                key={sc.cmd}
                                role="menuitem"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSubOpen(null)
                                  window.setTimeout(() => commands.find((c) => c.id === sc.cmd)?.run(), 0)
                                }}
                              >
                                {tr(sc.label)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }
                  return (
                    <button
                      key={it.cmd}
                      className={`rb-btn ${sm ? 'sm' : 'lg'}${on ? ' on' : ''}${it.gapLeft ? ' gap-l' : ''}`}
                      disabled={disabled}
                      title={`${label ?? tr(cmd.title)}${k}`}
                      aria-label={label ?? tr(cmd.title)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => cmd.run()}
                    >
                      <span className={gl}>
                        {glyph ? glyph : icon ? <Icon name={icon} size={sm ? 20 : 22} /> : null}
                      </span>
                      {!sm && <span className="rb-lbl">{label}</span>}
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
