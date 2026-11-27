import { useState } from 'react'
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
import { AboutPanel } from './AboutPanel'
import { DataPanel } from './DataPanel'
import { LANGS, tr, trf } from '@/lib/i18n'
import { importThemeCss, listImported, removeImported, MAX_THEME_CSS } from '@/lib/themeImport'
import type { UpdateStatus } from '../../../shared/update'

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
    <button
      className={`switch${on ? ' on' : ''}`}
      role="switch"
      aria-checked={on}
      // 按下即切換：不依賴「按下與放開在同一元素」的 click，避免開關在動畫中被位移而點不動；鍵盤操作(detail=0)仍走 click
      onPointerDown={(e) => {
        if (e.button === 0) {
          e.preventDefault()
          onChange(!on)
        }
      }}
      onClick={(e) => {
        if (e.detail === 0) onChange(!on)
      }}
    >
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
  version,
  updateStatus,
  onClose
}: {
  open: boolean
  settings: Settings
  update(p: Partial<Settings>): void
  commands: Cmd[]
  materialKind: MaterialSupport
  version: string
  updateStatus: UpdateStatus
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
          <h2>{tr('偏好設定')}</h2>
          <button className="icon-btn" onClick={onClose} title={tr('關閉')}>
            <Icon name="close" />
          </button>
        </div>

        <div className="drawer-body">
          <div className="xgrid">
            <div className="xgroup">{tr('介面與外觀')}</div>
            <ExpandCard wide
              active={open}
              icon="half"
              title={tr('外觀')}
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
                        {tr(t.label)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="set-sep" />
              <Row label={tr('依時段自動換主題（日間淺色、傍晚護眼、夜間深色）')}>
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
                  <Row label={tr('內容區不透明度')} value={`${Math.round(settings.surfaceOpacity * 100)}%`}>
                    <input type="range" min={0.35} max={0.98} step={0.01} value={settings.surfaceOpacity}
                      onChange={(e) => update({ surfaceOpacity: +e.target.value })} />
                  </Row>
                  {materialKind === 'win' && (
                    <Row label={tr('材質')}>
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

            <ExpandCard wide
              active={open}
              icon="type"
              title={tr('排版')}
              summary={`${FONT_LABEL[settings.fontFamily]} · ${settings.fontSize}px · 行高 ${settings.lineHeight.toFixed(2)} · 寬 ${settings.maxWidth}px`}
            >
              <Row label={tr('字體')}>
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
              <Row label={tr('字號')} value={`${settings.fontSize}px`}>
                <input type="range" min={14} max={24} step={1} value={settings.fontSize}
                  onChange={(e) => update({ fontSize: +e.target.value })} />
              </Row>
              <Row label={tr('行高')} value={settings.lineHeight.toFixed(2)}>
                <input type="range" min={1.4} max={2.3} step={0.05} value={settings.lineHeight}
                  onChange={(e) => update({ lineHeight: +e.target.value })} />
              </Row>
              <Row label={tr('行號：代碼塊')}>
                <Toggle on={settings.lnCode} onChange={(v) => update({ lnCode: v })} />
              </Row>
              <Row label={tr('行號：渲染模式（每個區塊在 .md 的起始行）')}>
                <Toggle on={settings.lnWysiwyg} onChange={(v) => update({ lnWysiwyg: v })} />
              </Row>
              <Row label={tr('行號：源碼模式')}>
                <Toggle on={settings.lnSource} onChange={(v) => update({ lnSource: v })} />
              </Row>
              <Row label={tr('內容最大寬度')} value={`${settings.maxWidth}px`}>
                <input type="range" min={560} max={1200} step={20} value={settings.maxWidth}
                  onChange={(e) => update({ maxWidth: +e.target.value })} />
              </Row>
            </ExpandCard>

            <div className="xgroup">{tr('寫作與儲存')}</div>
            <ExpandCard wide
              active={open}
              icon="pen"
              title={tr('寫作')}
              summary={`自動儲存 ${on(settings.autosave)} · 聚焦 ${on(settings.focusMode)} · 打字機 ${on(settings.typewriter)}`}
            >
              <Row label={tr('自動儲存（已有檔案）')}>
                <Toggle on={settings.autosave} onChange={(v) => update({ autosave: v })} />
              </Row>
              {settings.autosave && (
                <Row label={tr('自動儲存間隔（與時光機同步）')}>
                  <select className="ai-input" value={settings.autosaveSec} onChange={(e) => update({ autosaveSec: Number(e.target.value) })}>
                    {AUTOSAVE_OPTS.map(([sec, label]) => (
                      <option key={sec} value={sec}>{tr(label)}</option>
                    ))}
                  </select>
                </Row>
              )}
              <Row label={tr('重新開啟軟體時')}>
                <Segmented
                  value={settings.startupDoc}
                  onChange={(v) => update({ startupDoc: v })}
                  options={[
                    { value: 'last', label: '還原上次的分頁' },
                    { value: 'blank', label: '空白未儲存文件' }
                  ]}
                />
              </Row>
              <Row label={tr('全域快捷鍵 Ctrl/⌘+Alt+Space 叫出收件匣（任何程式中都可用）')}>
                <Toggle on={settings.inboxShortcut} onChange={(v) => update({ inboxShortcut: v })} />
              </Row>
              <Row label={tr('聚焦模式')}>
                <Toggle on={settings.focusMode} onChange={(v) => update({ focusMode: v })} />
              </Row>
              <Row label={tr('打字機模式')}>
                <Toggle on={settings.typewriter} onChange={(v) => update({ typewriter: v })} />
              </Row>
              <Row label={tr('輸入時的墨水漣漪')}>
                <Toggle on={settings.inkRipple} onChange={(v) => update({ inkRipple: v })} />
              </Row>
              <Row label={tr('每日寫作目標')} value={`${settings.dailyGoal} 字`}>
                <input type="range" min={100} max={5000} step={100} value={settings.dailyGoal}
                  onChange={(e) => update({ dailyGoal: +e.target.value })} />
              </Row>
            </ExpandCard>

            <div className="xgroup">{tr('AI 與自訂')}</div>
            <ExpandCard wide
              active={open}
              icon="sparkle"
              title={tr('AI 改寫')}
              summary={(() => {
                const r = resolveAi(settings)
                return r.missing ? trf('{0} · 尚未完成設定', r.provider.label) : `${r.provider.label} · ${r.model}`
              })()}
            >
              <AiSetup s={settings} update={update} />
            </ExpandCard>

            <ExpandCard wide
              active={open}
              icon="code"
              title={tr('自訂 CSS')}
              summary={settings.customCss.trim() ? `已設定 ${settings.customCss.trim().split('\n').length} 行` : '尚未設定'}
            >
              <CssSettings settings={settings} update={update} />
            </ExpandCard>

            <div className="xgroup">{tr('語言')}</div>
            <ExpandCard wide active={open} icon="type" title={tr('語言')} summary={LANGS.find((l) => l.id === settings.uiLang)?.label ?? ''}>
              <div className="set-help">{tr('除了寫作區的文字（你的文件內容）以外，選單、功能區、面板與提示訊息都會切換成所選語言。')}</div>
              <div className="lang-grid">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    className={`lang-btn${settings.uiLang === l.id ? ' on' : ''}`}
                    onPointerDown={(e) => {
                      if (e.button === 0) {
                        e.preventDefault()
                        update({ uiLang: l.id })
                      }
                    }}
                    onClick={(e) => e.detail === 0 && update({ uiLang: l.id })}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </ExpandCard>

            <div className="xgroup">{tr('資料與維護')}</div>
            <ExpandCard wide active={open} icon="folder" title={tr('資料與維護')} summary={tr('備份／匯入、清除快取')}>
              <DataPanel />
            </ExpandCard>

            <div className="xgroup">{tr('更新、快捷鍵與關於')}</div>
            <ExpandCard wide
              active={open}
              icon="sparkle"
              title={tr('更新與關於')}
              summary={`版本 ${version || '—'}`}
            >
              <AboutPanel version={version} status={updateStatus} />
            </ExpandCard>

            <ExpandCard wide active={open} icon="keyboard" title={tr('快捷鍵')} action={tr('查看')} summary={`共 ${keyed.length} 個，點擊查看完整清單`}>
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

const AUTOSAVE_OPTS: [number, string][] = [
  [0, '即時（每次輸入後立即儲存）'], [30, '30 秒'], [60, '1 分鐘'], [120, '2 分鐘'], [300, '5 分鐘'], [600, '10 分鐘'],
  [1800, '30 分鐘'], [3600, '1 小時'], [10800, '3 小時'], [21600, '6 小時']
]

const CSS_HELP = `自訂 CSS 會在所有主題之上套用，只影響畫面，不會寫進你的 .md 檔案。

常用選擇器
・編輯區整體：.editor-col .milkdown .ProseMirror
・標題：…ProseMirror h1 … h6　　段落：…ProseMirror p
・代碼塊：.milkdown .milkdown-code-block　　引用：…ProseMirror blockquote
・深色／淺色：[data-tone="dark"]、[data-tone="light"]
・也可覆寫變數：:root { --accent: #2f6fed; --fg: #222; --bg: #fff; }

匯入主題
・Typora 主題（.css）：選擇器 #write、.md-fences 會自動轉成本程式的選擇器
・Obsidian 主題／CSS 片段（.css）：.markdown-preview-view、.theme-dark 等會自動轉換
・Notion 沒有可匯入的主題檔，但它的 CSS 片段可以直接貼在下面
・為了安全，@import 與網路圖片／字型網址會被移除；字型請用電腦已安裝的`

function CssSettings({ settings, update }: { settings: Settings; update(p: Partial<Settings>): void }) {
  const [msg, setMsg] = useState('')
  const imported = listImported(settings.customCss)
  const pick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.css,text/css'
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return
      if (f.size > MAX_THEME_CSS) return setMsg(`檔案超過 ${Math.round(MAX_THEME_CSS / 1000)}KB，已取消`)
      void f.text().then((raw) => {
        const name = f.name.replace(/\.css$/i, '')
        const base = removeImported(settings.customCss, name)
        const r = importThemeCss(raw, name)
        update({ customCss: `${base}\n\n${r.css}`.trim() })
        setMsg(`已匯入「${name}」，轉換了 ${r.rewritten} 處選擇器${r.removedExternal ? `，移除 ${r.removedExternal} 個外部載入` : ''}`)
      })
    }
    input.click()
  }
  return (
    <>
      <pre className="set-help">{CSS_HELP}</pre>
      <div className="css-actions">
        <button className="btn" onClick={pick}>{tr('匯入 Typora／Obsidian 主題（.css）')}</button>
        {imported.map((n) => (
          <button key={n} className="btn ghost" onClick={() => update({ customCss: removeImported(settings.customCss, n) })} title={tr('移除這個已匯入的主題')}>
            移除「{n}」
          </button>
        ))}
      </div>
      {msg && <div className="set-help">{msg}</div>}
      <textarea
        className="css-box"
        style={{ height: 240 }}
        spellCheck={false}
        placeholder={'/* 例如 */\n.editor-col .milkdown .ProseMirror h1 { color: #b5412c; }'}
        value={settings.customCss}
        onChange={(e) => update({ customCss: e.target.value })}
      />
    </>
  )
}
