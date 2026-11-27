import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MusicLibState, MusicPlaylist, MusicTrack } from '../../../shared/types'
import { MODES, music, type MusicSnap } from '@/lib/musicPlayer'
import { AmbientPanel } from './Panels'
import type { AmbientKind } from '@/lib/ambient'
import { tr, trf } from '@/lib/i18n'

export function useMusic(): MusicSnap {
  const [s, setS] = useState(music.snap)
  useEffect(() => music.subscribe(() => setS(music.snap())), [])
  return s
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const ICONS = ['♪', '🎧', '🌧️', '☕', '🌲', '🔥', '🌙', '📚', '🎹', '🎻', '⭐', '💤']
const SLEEP = [0, 15, 30, 45, 60, 90]
const newId = () => Math.random().toString(16).slice(2, 14)

function Cover({ p }: { p: MusicPlaylist }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setSrc(null)
    if (p.cover) void window.api.musicCoverData(p.cover).then((d) => live && setSrc(d))
    return () => { live = false }
  }, [p.cover])
  return <span className="mus-cover">{src ? <img src={src} alt="" /> : <span>{p.icon}</span>}</span>
}

/** 音樂庫：選資料夾、匯入、掃描、播放清單（圖示／封面）、播放模式、睡眠計時 */
export function MusicLibrary() {
  const s = useMusic()
  const [lib, setLib] = useState<MusicLibState | null>(null)
  const [sel, setSel] = useState<string>('all')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const libRef = useRef<MusicLibState | null>(null)
  libRef.current = lib

  useEffect(() => {
    void window.api.musicState().then(setLib)
  }, [])

  const run = useCallback(async (fn: () => Promise<MusicLibState | null>, msg?: (r: any) => string) => {
    setBusy(true)
    try {
      const r = await fn()
      if (r) {
        setLib(r)
        if (msg) setNote(msg(r))
      }
    } catch (e) {
      setNote(String((e as Error)?.message ?? e).slice(0, 120))
    } finally {
      setBusy(false)
    }
  }, [])

  const savePl = (pls: MusicPlaylist[]) => run(() => window.api.musicSavePlaylists(pls))

  const pl = lib?.playlists.find((p) => p.id === sel) ?? null
  const tracks: MusicTrack[] = useMemo(() => {
    if (!lib) return []
    if (!pl) return lib.tracks
    const m = new Map(lib.tracks.map((t) => [t.id, t]))
    return pl.trackIds.map((id) => m.get(id)).filter((t): t is MusicTrack => !!t)
  }, [lib, pl])

  if (!lib) return <div className="hist-hint">{tr('載入中…')}</div>

  return (
    <>
      <div className="hist-hint mus-dir" title={lib.dir}>
        {tr('音樂庫資料夾')}：{lib.dir}{lib.isDefault ? `（${tr('預設')}）` : ''}
      </div>
      <div className="pop-actions wrap">
        <button className="btn ghost" disabled={busy} onClick={() => run(() => window.api.musicSetDir())}>{tr('選擇資料夾')}</button>
        <button className="btn ghost" disabled={busy} onClick={() => run(() => window.api.musicImport())}>{tr('匯入音樂')}</button>
        <button className="btn ghost" disabled={busy} onClick={() => run(() => window.api.musicScan(), (r) => trf('掃描完成：新增 {0} 首、移除 {1} 筆失效紀錄', String(r.added), String(r.removed)))}>{tr('掃描資料夾')}</button>
      </div>
      <div className="hist-hint">{tr('音訊檔都保存在音樂庫資料夾，程式更新不會動它；「移除」只是從清單拿掉，不會刪你的檔案。')}</div>
      {note && <div className="hist-hint">{note}</div>}

      <div className="chips">
        <button className={`chip${sel === 'all' ? ' on' : ''}`} onClick={() => setSel('all')}>{tr('全部')} ({lib.tracks.length})</button>
        {lib.playlists.map((p) => (
          <button key={p.id} className={`chip mus-chip${sel === p.id ? ' on' : ''}`} onClick={() => setSel(p.id)}>
            <Cover p={p} />{p.name}
          </button>
        ))}
        <button className="chip" onClick={() => {
          const p: MusicPlaylist = { id: newId(), name: trf('播放清單 {0}', String(lib.playlists.length + 1)), icon: '♪', trackIds: [] }
          void savePl([...lib.playlists, p]).then(() => setSel(p.id))
        }}>＋ {tr('新增清單')}</button>
      </div>

      {pl && (
        <div className="mus-pl-edit">
          <input className="mus-name" value={pl.name} maxLength={60} onChange={(e) => setLib({ ...lib, playlists: lib.playlists.map((p) => (p.id === pl.id ? { ...p, name: e.target.value } : p)) })}
            onBlur={() => void savePl(libRef.current!.playlists)} />
          <div className="mus-icons">
            {ICONS.map((i) => (
              <button key={i} className={`chip${pl.icon === i && !pl.cover ? ' on' : ''}`} onClick={() => void savePl(lib.playlists.map((p) => (p.id === pl.id ? { ...p, icon: i, cover: undefined } : p)))}>{i}</button>
            ))}
            <button className="chip" onClick={async () => {
              const rel = await window.api.musicCover()
              if (rel) void savePl(lib.playlists.map((p) => (p.id === pl.id ? { ...p, cover: rel } : p)))
            }}>{tr('選封面圖片')}</button>
            <button className="chip" onClick={async () => {
              if (await window.api.confirm({ message: trf('刪除播放清單「{0}」？', pl.name), detail: tr('只刪清單，不會刪音訊檔。'), ok: tr('刪除') })) {
                setSel('all')
                void savePl(lib.playlists.filter((p) => p.id !== pl.id))
              }
            }}>{tr('刪除清單')}</button>
          </div>
        </div>
      )}

      <div className="pop-actions">
        <button className="btn" disabled={!tracks.some((t) => !t.missing)} onClick={() => void music.playList(tracks, 0)}>▶ {tr('播放這份清單')}</button>
      </div>

      <div className="mus-list">
        {tracks.length === 0 && <div className="hist-hint">{pl ? tr('這個清單還是空的：到「全部」把歌加進來。') : tr('還沒有音樂：按「匯入音樂」或把檔案放進資料夾後按「掃描資料夾」。')}</div>}
        {tracks.map((t, i) => {
          const on = s.track?.id === t.id
          return (
            <div key={t.id} className={`mus-row${on ? ' on' : ''}${t.missing ? ' missing' : ''}`}>
              <button className="mus-play" disabled={t.missing} title={t.missing ? tr('檔案不見了，按「掃描資料夾」清理') : tr('播放')} onClick={() => void music.playList(tracks, i)}>
                {on && s.playing ? '♫' : '▶'}
              </button>
              <span className="mus-title" title={t.file}>{t.title}{t.missing ? `（${tr('檔案遺失')}）` : ''}</span>
              {!pl && lib.playlists.length > 0 && (
                <select className="mus-add" value="" onChange={(e) => {
                  const id = e.target.value
                  if (!id) return
                  void savePl(lib.playlists.map((p) => (p.id === id && !p.trackIds.includes(t.id) ? { ...p, trackIds: [...p.trackIds, t.id] } : p)))
                }} title={tr('加入播放清單')}>
                  <option value="">＋</option>
                  {lib.playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              <button className="mus-x" title={pl ? tr('從清單移除') : tr('從音樂庫移除（不刪檔案）')} onClick={() => {
                if (pl) void savePl(lib.playlists.map((p) => (p.id === pl.id ? { ...p, trackIds: p.trackIds.filter((x) => x !== t.id) } : p)))
                else void run(() => window.api.musicRemoveTrack(t.id))
              }}>×</button>
            </div>
          )
        })}
      </div>

      <div className="mus-transport">
        <button className="btn ghost" onClick={() => void music.prev()} disabled={!s.queueLen}>⏮</button>
        <button className="btn" onClick={() => void music.toggle()} disabled={!s.queueLen}>{s.playing ? '⏸' : '▶'}</button>
        <button className="btn ghost" onClick={() => void music.next()} disabled={!s.queueLen}>⏭</button>
        <button className="btn ghost" onClick={() => music.stop()} disabled={!s.queueLen}>■</button>
        <select className="mus-mode" value={s.mode} onChange={(e) => music.setMode(e.target.value as MusicSnap['mode'])} title={tr('播放模式')}>
          {MODES.map((m) => <option key={m.k} value={m.k}>{m.glyph} {tr(m.label)}</option>)}
        </select>
      </div>
      <div className="mus-now">{s.loading ? tr('載入中…') : s.track ? `${s.playing ? '♫' : '⏸'} ${s.track.title}` : tr('尚未播放')}{s.queueLen ? `  ${fmt(s.pos)} / ${fmt(s.dur)}` : ''}</div>
      {s.error && <div className="hist-hint warn">{s.error}</div>}
      <input type="range" min={0} max={1000} value={s.dur ? Math.round((s.pos / s.dur) * 1000) : 0} onChange={(e) => music.seek(+e.target.value / 1000)} disabled={!s.dur} />
      <label className="mus-vol">{tr('音量')}
        <input type="range" min={0} max={1} step={0.01} value={s.volume} onChange={(e) => music.setVolume(+e.target.value)} />
      </label>
      <label className="mus-vol">{tr('睡眠計時')}
        <select value={SLEEP.includes(Math.round(s.sleepLeft / 60)) ? '' : ''} onChange={(e) => music.setSleep(+e.target.value)}>
          <option value="0">{s.sleepLeft ? trf('剩 {0}（選此取消）', fmt(s.sleepLeft)) : tr('不啟用')}</option>
          {SLEEP.filter(Boolean).map((m) => <option key={m} value={m}>{trf('{0} 分鐘後停止', String(m))}</option>)}
        </select>
      </label>
    </>
  )
}

/** 氛圍音 + 音樂庫（同一個側欄面板，上方分頁切換） */
export function SoundPanel({ ambient, setAmbientKind }: { ambient: AmbientKind; setAmbientKind(k: AmbientKind): void }) {
  const [tab, setTab] = useState<'ambient' | 'music'>('music')
  return (
    <>
      <div className="chips">
        <button className={`chip${tab === 'music' ? ' on' : ''}`} onClick={() => setTab('music')}>{tr('音樂庫')}</button>
        <button className={`chip${tab === 'ambient' ? ' on' : ''}`} onClick={() => setTab('ambient')}>{tr('環境音')}</button>
      </div>
      {tab === 'ambient' ? <AmbientPanel ambient={ambient} setAmbientKind={setAmbientKind} /> : <MusicLibrary />}
    </>
  )
}

/** 底欄頻譜：只在播放時才跑動畫，停止後不佔資源 */
export function SpectrumBar({ onClick }: { onClick(): void }) {
  const s = useMusic()
  const cv = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!s.playing) return
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const c = cv.current
      const g = c?.getContext('2d')
      const d = music.spectrum(20)
      if (!c || !g || !d) return
      g.clearRect(0, 0, c.width, c.height)
      g.fillStyle = getComputedStyle(c).color
      const w = c.width / d.length
      for (let i = 0; i < d.length; i++) {
        const h = Math.max(1, (d[i] / 255) * c.height)
        g.fillRect(i * w + 1, c.height - h, w - 2, h)
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [s.playing])
  if (!s.track) return null
  return (
    <button className={`sb-btn mus-sb${s.playing ? ' on' : ''}`} onClick={onClick} title={`${s.track.title}（${tr('點開音樂庫')}）`}>
      <canvas ref={cv} width={60} height={14} />
      <span className="mus-sb-title">{s.track.title}</span>
    </button>
  )
}
