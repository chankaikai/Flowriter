import type { Settings } from '@/lib/settings'
import { GAP_MAX, LH_MAX, LH_MIN, SPACING_DEFAULT, gapMin, safeSpacing } from '@/lib/spacing'
import { tr } from '@/lib/i18n'

/** 帶「預設值刻度」的滑桿：細豎線標出預設位置，點一下刻度旁的「預設」可還原 */
function Slider({ label, value, min, max, step, def, on, unit }: { label: string; value: number; min: number; max: number; step: number; def: number; on(v: number): void; unit: string }) {
  const p = ((def - min) / (max - min)) * 100
  return (
    <div className="sp-row">
      <div className="sp-head">
        <span>{label}</span>
        <span className="sp-val">{value.toFixed(2)}{unit}</span>
        <button className="sp-reset" disabled={Math.abs(value - def) < 0.001} onClick={() => on(def)}>{tr('預設')}</button>
      </div>
      <div className="sp-track">
        <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => on(+e.target.value)} />
        <i className="sp-def" style={{ left: `calc(${p}% + ${(0.5 - p / 100) * 14}px)` }} title={tr('預設值')} />
      </div>
    </div>
  )
}

/** 段落內／段落間／清單三種行高，常用選項卡與設定共用（同一份設定，改一邊另一邊跟著變） */
export function SpacingControl({ settings, update }: { settings: Pick<Settings, 'lineHeight' | 'paraGap' | 'listLineHeight'>; update(p: Partial<Settings>): void }) {
  const s = safeSpacing(settings)
  return (
    <div className="sp-box" onMouseDown={(e) => e.stopPropagation()}>
      <Slider label={tr('段落內行高')} value={s.lineHeight} min={LH_MIN} max={LH_MAX} step={0.05} def={SPACING_DEFAULT.lineHeight} unit="" on={(v) => update({ lineHeight: safeSpacing({ ...s, lineHeight: v }).lineHeight, paraGap: safeSpacing({ ...s, lineHeight: v }).paraGap })} />
      <Slider label={tr('段落間行高')} value={s.paraGap} min={gapMin(s.lineHeight)} max={GAP_MAX} step={0.05} def={SPACING_DEFAULT.paraGap} unit="em" on={(v) => update({ paraGap: v })} />
      <Slider label={tr('列表行高')} value={s.listLineHeight} min={LH_MIN} max={LH_MAX} step={0.05} def={SPACING_DEFAULT.listLineHeight} unit="" on={(v) => update({ listLineHeight: v })} />
      <div className="sp-note">{tr('三項各自獨立；行高太小時，段落間距會自動保持最低值，避免文字擠在一起。')}</div>
    </div>
  )
}
