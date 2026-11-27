import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtClock, PRESETS, usePomodoro } from '@/lib/pomodoro'
import { Ring } from './Panels'
import { Icon } from './Icon'
import { tr } from '@/lib/i18n'

const POS_KEY = 'inkwell.pomo.pos.v1'
const FLOAT_KEY = 'inkwell.pomo.float.v1'
interface Pos { x: number; y: number; pinned: boolean }

const loadPos = (): Pos => {
  try {
    const j = JSON.parse(localStorage.getItem(POS_KEY) || '{}')
    if (typeof j.x === 'number' && typeof j.y === 'number') return { x: j.x, y: j.y, pinned: !!j.pinned }
  } catch {
    /* ignore */
  }
  return { x: -1, y: -1, pinned: false }
}

/** 標題列按鈕：在 pointerdown 就執行，並擋掉冒泡，避免被拖曳處理或重繪吃掉 click */
const tap = (fn: () => void) => (e: React.PointerEvent) => {
  if (e.button !== 0) return
  e.stopPropagation()
  e.preventDefault()
  fn()
}

const NumField = ({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit?: string; onChange(n: number): void }) => (
  <label className="num-field">
    <span>{label}</span>
    <input type="number" min={min} max={max} value={value} onChange={(e) => e.target.value !== '' && onChange(+e.target.value)} />
    {unit && <em>{unit}</em>}
  </label>
)

/**
 * 番茄鐘（獨立模組）：收合時是角落的倒數小膠囊，展開是可拖曳的玻璃面板。
 * 計時狀態只在這個元件內更新，不會牽動編輯器或 App 其他部分。
 */
export function Pomodoro({ getWords, openSignal, slot, otherPanelOpen, onDockOpen }: { getWords(): number; openSignal: number; slot: HTMLElement | null; otherPanelOpen: boolean; onDockOpen(): void }) {
  const { st, toggle, reset, skip, enterRest, extend, setConfig } = usePomodoro(getWords)
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [pos, setPos] = useState<Pos>(loadPos)
  const [live, setLive] = useState(0)
  // 預設停靠在右側欄；按「浮動」變成可拖曳的小窗，再按一次回到側欄（記住選擇）
  const [floating, setFloating] = useState(() => {
    try {
      return localStorage.getItem(FLOAT_KEY) === '1'
    } catch {
      return false
    }
  })
  const setFloat = (f: boolean) => {
    setFloating(f)
    try {
      localStorage.setItem(FLOAT_KEY, f ? '1' : '0')
    } catch {
      /* ignore */
    }
    if (!f) onDockOpen() // 回到側欄時，把其他側欄面板讓出來
  }
  const docked = !floating && !!slot
  const box = useRef<HTMLDivElement>(null)

  // 命令／選單觸發：切換展開。用「上次看到的訊號值」比較，不依賴 first-run 旗標
  // （React 開發模式會把 effect 跑兩次，旗標寫法會讓番茄鐘一開啟程式就自己展開）
  const lastSignal = useRef(openSignal)
  useEffect(() => {
    if (openSignal === lastSignal.current) return
    lastSignal.current = openSignal
    setOpen((o) => !o)
  }, [openSignal])

  // 側欄模式：打開時收起其他面板；別的面板打開時自己讓位
  useEffect(() => {
    if (open && docked) onDockOpen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, docked])
  useEffect(() => {
    if (docked && otherPanelOpen) setOpen(false)
  }, [docked, otherPanelOpen])

  // 專注中即時更新「本輪新增字數」（2 秒一次，只讀 App 已算好的字數）
  useEffect(() => {
    if (!(open || st.running) || st.phase !== 'work') return
    const tick = () => setLive(getWords() - st.startWords)
    tick()
    const id = window.setInterval(tick, 2000)
    return () => window.clearInterval(id)
  }, [open, st.running, st.phase, st.startWords, getWords])

  const savePos = (p: Pos) => {
    setPos(p)
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(p))
    } catch {
      /* ignore */
    }
  }

  const onDrag = useCallback(
    (e: React.PointerEvent) => {
      if (pos.pinned || (e.target as HTMLElement).closest('button,input,label')) return
      const el = box.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = e.clientX - r.left
      const dy = e.clientY - r.top
      let last = { x: r.left, y: r.top }
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ignore */ }
      const move = (ev: PointerEvent) => {
        last = {
          x: Math.min(window.innerWidth - 60, Math.max(0, ev.clientX - dx)),
          y: Math.min(window.innerHeight - 40, Math.max(36, ev.clientY - dy))
        }
        setPos((p) => ({ ...p, ...last }))
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        window.removeEventListener('blur', up)
        savePos({ ...pos, ...last })
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
      window.addEventListener('blur', up)
    },
    [pos]
  )

  const phaseLabel = st.pending ? '專注完成' : st.phase === 'work' ? '專注' : st.long ? '長休息' : '休息'
  const idle = !open && !st.running && !st.pending && st.left === st.total && st.phase === 'work' && st.rounds === 0
  const style = pos.x >= 0 ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined
  const goal = st.goalWords
  const isPreset = PRESETS.some((p) => p.work === st.workMin && p.rest === st.restMin)

  // 收合：只在計時中或等待選擇時顯示倒數膠囊
  if (!open) {
    if (idle || (!st.running && !st.pending)) return null
    return (
      <button className={`pomo-chip${st.phase === 'rest' ? ' rest' : ''}${st.pending ? ' pending' : ''}`} style={style} onClick={() => setOpen(true)} title={tr('展開番茄鐘')}>
        <Icon name="timer" size={14} />
        <b>{st.pending ? '專注完成' : fmtClock(st.left)}</b>
        <span>{st.pending ? '點開選擇' : phaseLabel}</span>
      </button>
    )
  }

  const panel = (
    <div ref={box} className={docked ? 'pop in pomo-docked' : 'pomo-panel'} style={docked ? undefined : style}>
      <div className={`pomo-head${pos.pinned && !docked ? ' pinned' : ''}`} onPointerDown={docked ? undefined : onDrag}>
        <Icon name="timer" size={15} />
        <b>{tr('番茄鐘')}</b>
        <span className="grow" />
        <button className="icon-btn sm" title={st.muted ? '已靜音（點一下開啟提示音）' : '提示音開啟（點一下靜音）'} onPointerDown={tap(() => setConfig({ muted: !st.muted }))}>
          <span aria-hidden>{st.muted ? '🔕' : '🔔'}</span>
        </button>
        <button className="icon-btn sm" title={floating ? '回到右側欄' : '變成浮動小窗'} onPointerDown={tap(() => setFloat(!floating))}>
          <span aria-hidden>{floating ? '▣' : '⧉'}</span>
        </button>
        {!docked && <button className={`icon-btn sm${pos.pinned ? ' on' : ''}`} title={pos.pinned ? '已固定位置（點一下可拖曳）' : '固定位置'} onPointerDown={tap(() => savePos({ ...pos, x: pos.x >= 0 ? pos.x : box.current?.getBoundingClientRect().left ?? 0, y: pos.y >= 0 ? pos.y : box.current?.getBoundingClientRect().top ?? 0, pinned: !pos.pinned }))}>
          <Icon name="pin" size={13} />
        </button>}
        <button className="icon-btn sm" title={tr('關閉番茄鐘')} onPointerDown={tap(() => setOpen(false))}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="pomo">
        <Ring value={st.total ? 1 - st.left / st.total : 0} size={128}>
          <b className="clock">{fmtClock(st.left)}</b>
          <small>{phaseLabel} · 今日 {st.rounds} 輪</small>
        </Ring>

        {st.pending ? (
          <div className="pomo-done">
            <div className="hist-hint">
              {st.summary ? `這一輪${st.summary.delta >= 0 ? '新增' : '減少'} ${Math.abs(st.summary.delta).toLocaleString()} 字` : ''}
              {st.summary && st.summary.goal > 0 ? (st.summary.delta >= st.summary.goal ? ' · 達標 🎉' : ` · 離目標還差 ${st.summary.goal - st.summary.delta} 字`) : ''}
            </div>
            <div className="pomo-ctl">
              <button className="btn" onClick={enterRest}>{tr('進入休息')}</button>
              <button className="btn ghost" onClick={() => extend(5)}>{tr('延展 5 分鐘')}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="pomo-ctl">
              <button className="btn" onClick={toggle}>{st.running ? '暫停' : '開始'}</button>
              <button className="btn ghost" onClick={reset}>{tr('重設')}</button>
              <button className="btn ghost" onClick={skip}>{tr('跳過')}</button>
            </div>
            {st.phase === 'work' && (st.running || goal > 0) && (
              <div className="pomo-words">
                本輪 <b>{live >= 0 ? '+' : ''}{live.toLocaleString()}</b> 字{goal > 0 ? ` / 目標 ${goal.toLocaleString()}` : ''}
                {goal > 0 && <i style={{ width: `${Math.min(100, Math.max(0, (live / goal) * 100))}%` }} />}
              </div>
            )}
          </>
        )}

        <div className="chips center">
          {PRESETS.map((p) => (
            <button key={p.label} className={`chip${!custom && st.workMin === p.work && st.restMin === p.rest ? ' on' : ''}`} onClick={() => { setCustom(false); setConfig({ workMin: p.work, restMin: p.rest }) }}>
              {tr(p.label)}
            </button>
          ))}
          <button className={`chip${custom || !isPreset ? ' on' : ''}`} onClick={() => setCustom(!custom)}>{tr('自訂')}</button>
        </div>
        {(custom || !isPreset) && (
          <div className="pomo-cfg">
            <NumField label={tr('專注')} unit="分" value={st.workMin} min={1} max={180} onChange={(n) => setConfig({ workMin: n })} />
            <NumField label={tr('休息')} unit="分" value={st.restMin} min={1} max={60} onChange={(n) => setConfig({ restMin: n })} />
            <NumField label={tr('每')} unit="輪" value={st.longEvery} min={0} max={12} onChange={(n) => setConfig({ longEvery: n })} />
            <NumField label={tr('長休息')} unit="分" value={st.longMin} min={1} max={90} onChange={(n) => setConfig({ longMin: n })} />
          </div>
        )}
        <div className="pomo-cfg">
          <NumField label={tr('每輪目標')} unit="字" value={st.goalWords} min={0} max={100000} onChange={(n) => setConfig({ goalWords: n })} />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={st.auto} onChange={(e) => setConfig({ auto: e.target.checked })} />
          {tr('階段結束後自動開始下一階段')}
        </label>
      </div>
    </div>
  )
  return docked ? createPortal(panel, slot!) : panel
}
