import type { MaterialSupport } from '../../../shared/types'
import type { Cmd } from '@/lib/commands'
import { formatKeys } from '@/lib/keys'
import type { Settings } from '@/lib/settings'
import { THEMES } from '@/lib/themes'
import { ExpandCard } from './ExpandCard'
import { Icon } from './Icon'
import { AiSetup } from './AiSetup'
import { resolveAi } from '@/lib/ai'
import { Segmented } from './Segmented'

const SYSTEM_CARD = { id: 'system', label: '跟隨系統', bg: 'linear-gradient(135deg,#fbfaf7 50%,#1c1b19 50%)', fg: '#888', accent: '#888' }
const themeCards = (list: typeof THEMES) => list.map((t) => ({ id: t.id, label: t.label, bg: t.bg, fg: t.fg, accent: t.accent }))

const FONT_LABEL = { sans: '無襯線', serif: '襯線', mono: '等寬' } as const

function Row({ label, children, value }: { label: string; children: React.ReactNode; value?: string }) {
  return (
    <div className="set-row">
      <div className="set-label">
        {label}
        {value && <span>{value}</span>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`switch${on ? ' on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <i />
    </button>
  )
}

export function SettingsPanel({
  open,
  settings,
  update,
  commands,
  materialKind,
  onClose
}: {
  open: boolean
  settings: Settings
  update(p: Partial<Settings>): void
  commands: Cmd[]
  materialKind: MaterialSupport
  onClose(): void
}) {
  const keyed = commands.filter((c) => c.keys?.length)
  const themeLabel = [...THEMES, SYSTEM_CARD].find((t) => ('value' in t ? false : t.id === settings.theme))?.label ?? ''
  const on = (v: boolean) => (v ? '開' : '關')

  return (
    <div className={`overlay side${open ? ' open' : ''}`} onMouseDown={onClose}>
      <div
        className="drawer"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="drawer-head">
          <h2>偏好設定</h2>
          <button className="icon-btn" onClick={onClose} title="關閉">
            <Icon name="close" />
          </button>
        </div>

        <div className="drawer-body">
          <div className="xgrid">
            <ExpandCard
              active={open}
              icon="half"
              title="外觀"
              summary={
                <>
                  <span className="swatches">
                    {THEMES.filter((t) => ['word', 'ocean', 'lavender', 'midnight', 'nord'].includes(t.id)).map((t) => (
                      <i key={t.id} style={{ background: t.bg, boxShadow: `inset -5px 0 0 ${t.accent}` }} />
                    ))}
                  </span>
                  {themeLabel}
                </>
              }
            >
              {[
                ['淺色主題', themeCards(THEMES.filter((t) => !t.dark))],
                ['深色主題', themeCards(THEMES.filter((t) => t.dark))],
                ['', [SYSTEM_CARD]]
              ].map(([title, list]) => (
                <div key={title as string}>
                  {title && <div className="theme-title">{title as string}</div>}
                  <div className="theme-grid">
                    {(list as (typeof SYSTEM_CARD)[]).map((t) => (
                      <button
                        key={t.id}
                        className={`theme-card${settings.theme === t.id ? ' on' : ''}`}
                        onClick={() => update({ theme: t.id })}
                      >
                        <span className="swatch" style={{ background: t.bg, color: t.fg }}>
                          Aa
                          <i style={{ background: t.accent }} />
                        </span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="set-sep" />
              <Row label="依時段自動換主題（日間淺色、傍晚護眼、夜間深色）">
                <Toggle on={settings.autoTheme} onChange={(v) => update({ autoTheme: v })} />
              </Row>
              <Row label={materialKind === 'none' ? '系統毛玻璃（此系統不支援）' : '系統毛玻璃'}>
                <Toggle
                  on={settings.translucent && materialKind !== 'none'}
                  onChange={(v) => materialKind !== 'none' && update({ translucent: v })}
                />
              </Row>
              {materialKind !== 'none' && settings.translucent && (
                <>
                  <Row label="內容區不透明度" value={`${Math.round(settings.surfaceOpacity * 100)}%`}>
                    <input type="range" min={0.35} max={0.98} step={0.01} value={settings.surfaceOpacity}
                      onChange={(e) => update({ surfaceOpacity: +e.target.value })} />
                  </Row>
                  {materialKind === 'win' && (
                    <Row label="材質">
                      <Segmented
                        value={settings.winMaterial}
                        onChange={(v) => update({ winMaterial: v })}
                        options={[
                          { value: 'acrylic', label: '亞克力' },
                          { value: 'mica', label: '雲母' }
                        ]}
                      />
                    </Row>
                  )}
                </>
              )}
            </ExpandCard>

            <ExpandCard
              active={open}
              icon="type"
              title="排版"
              summary={`${FONT_LABEL[settings.fontFamily]} · ${settings.fontSize}px · 行高 ${settings.lineHeight.toFixed(2)} · 寬 ${settings.maxWidth}px`}
            >
              <Row label="字體">
                <Segmented
                  value={settings.fontFamily}
                  onChange={(v) => update({ fontFamily: v })}
                  options={[
                    { value: 'sans', label: '無襯線' },
                    { value: 'serif', label: '襯線' },
                    { value: 'mono', label: '等寬' }
                  ]}
                />
              </Row>
              <Row label="字號" value={`${settings.fontSize}px`}>
                <input type="range" min={14} max={24} step={1} value={settings.fontSize}
                  onChange={(e) => update({ fontSize: +e.target.value })} />
              </Row>
              <Row label="行高" value={settings.lineHeight.toFixed(2)}>
                <input type="range" min={1.4} max={2.3} step={0.05} value={settings.lineHeight}
                  onChange={(e) => update({ lineHeight: +e.target.value })} />
              </Row>
              <Row label="內容最大寬度" value={`${settings.maxWidth}px`}>
                <input type="range" min={560} max={1200} step={20} value={settings.maxWidth}
                  onChange={(e) => update({ maxWidth: +e.target.value })} />
              </Row>
            </ExpandCard>

            <ExpandCard
              active={open}
              icon="pen"
              title="寫作"
              summary={`自動儲存 ${on(settings.autosave)} · 聚焦 ${on(settings.focusMode)} · 打字機 ${on(settings.typewriter)}`}
            >
              <Row label="自動儲存（已有檔案）">
                <Toggle on={settings.autosave} onChange={(v) => update({ autosave: v })} />
              </Row>
              <Row label="全域快捷鍵 Ctrl/⌘+Alt+Space 叫出收件匣（任何程式中都可用）">
                <Toggle on={settings.inboxShortcut} onChange={(v) => update({ inboxShortcut: v })} />
              </Row>
              <Row label="聚焦模式">
                <Toggle on={settings.focusMode} onChange={(v) => update({ focusMode: v })} />
              </Row>
              <Row label="打字機模式">
                <Toggle on={settings.typewriter} onChange={(v) => update({ typewriter: v })} />
              </Row>
              <Row label="輸入時的墨水漣漪">
                <Toggle on={settings.inkRipple} onChange={(v) => update({ inkRipple: v })} />
              </Row>
              <Row label="每日寫作目標" value={`${settings.dailyGoal} 字`}>
                <input type="range" min={100} max={5000} step={100} value={settings.dailyGoal}
                  onChange={(e) => update({ dailyGoal: +e.target.value })} />
              </Row>
            </ExpandCard>

            <ExpandCard
              active={open}
              icon="sparkle"
              title="AI 改寫"
              summary={(() => {
                const r = resolveAi(settings)
                return r.missing ? `${r.provider.label} · 尚未完成設定` : `${r.provider.label} · ${r.model}`
              })()}
            >
              <AiSetup s={settings} update={update} />
            </ExpandCard>

            <ExpandCard
              active={open}
              icon="code"
              title="自訂 CSS"
              summary={settings.customCss.trim() ? `已設定 ${settings.customCss.trim().split('\n').length} 行` : '尚未設定'}
            >
              <textarea
                className="css-box"
                style={{ height: 260 }}
                spellCheck={false}
                placeholder={'/* 例如 */\n.milkdown .ProseMirror h1 { color: #b5412c; }'}
                value={settings.customCss}
                onChange={(e) => update({ customCss: e.target.value })}
              />
            </ExpandCard>

            <ExpandCard wide active={open} icon="keyboard" title="快捷鍵" summary={`共 ${keyed.length} 個，點擊查看完整清單`}>
              <div className="keylist">
                {keyed.map((c) => (
                  <div key={c.id} className="keyrow">
                    <span>{c.title}</span>
                    <span className="pal-keys">
                      {formatKeys(c.keys![0]).map((k, i) => (
                        <kbd key={i}>{k}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </ExpandCard>
          </div>
        </div>
      </div>
    </div>
  )
}
