import { useCallback, useEffect, useState } from 'react'
import { decryptJson, encryptJson } from '@/lib/vaultCrypto'
import type { CapsuleMeta } from '../../../shared/types'
import { tr } from '@/lib/i18n'

type Tab = 'capsule' | 'drawer'

export function VaultPanel({ selection, onInsert }: { selection: string; onInsert(md: string): void }) {
  const [tab, setTab] = useState<Tab>('capsule')
  return (
    <>
      <div className="chips tm-tabs">
        <button className={`chip${tab === 'capsule' ? ' on' : ''}`} onClick={() => setTab('capsule')}>{tr('時間膠囊')}</button>
        <button className={`chip${tab === 'drawer' ? ' on' : ''}`} onClick={() => setTab('drawer')}>{tr('加密抽屜')}</button>
      </div>
      {tab === 'capsule' ? <Capsules selection={selection} onInsert={onInsert} /> : <Drawer />}
    </>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Capsules({ selection, onInsert }: { selection: string; onInsert(md: string): void }) {
  const [list, setList] = useState<CapsuleMeta[] | null>(null)
  const [title, setTitle] = useState('')
  const [text, setText] = useState(selection)
  const [when, setWhen] = useState(toLocalInput(Date.now() + 30 * 86_400_000))
  const [opened, setOpened] = useState<{ title: string; text: string } | null>(null)
  const [msg, setMsg] = useState('')
  const reload = useCallback(() => window.api.capsuleList().then(setList), [])
  useEffect(() => void reload(), [reload])

  const create = async () => {
    const at = new Date(when).getTime()
    if (!text.trim() || !Number.isFinite(at) || at <= Date.now()) return setMsg('請輸入內容，並選一個未來的時間。')
    const id = await window.api.capsuleCreate(title.trim() || '給未來的自己', text, at)
    setMsg(id ? '已封存，到期之前看不到內容。' : '封存失敗。')
    if (id) {
      setText('')
      setTitle('')
      void reload()
    }
  }
  return (
    <>
      <div className="hist-hint">{tr('封存一段文字，到你選的時間之前無法開啟。這是依本機時鐘判斷的「軟鎖」，不是加密；需要真正保密請用加密抽屜。')}</div>
      <input className="vault-input" placeholder={tr('標題（選填）')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="vault-text" placeholder={tr('要封存的內容（已帶入目前選取的文字）')} value={text} onChange={(e) => setText(e.target.value)} />
      <input className="vault-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <div className="pop-actions"><button className="btn" onClick={() => void create()}>{tr('封存')}</button></div>
      {msg && <div className="hist-hint">{msg}</div>}
      <div className="tm-list">
        {(list ?? []).map((c) => {
          const locked = Date.now() < c.unlockAt
          return (
            <div key={c.id} className="tm-card">
              <b>{c.title}</b>
              <small className="tm-when">{locked ? `🔒 ${new Date(c.unlockAt).toLocaleString()} 開啟` : '已到期，可以開啟'}</small>
              <div className="pop-actions">
                <button className="btn ghost" disabled={locked} onClick={() => void window.api.capsuleOpen(c.id).then((r) => r.ok && setOpened({ title: r.title, text: r.text }))}>{tr('開啟')}</button>
                <button className="btn ghost" onClick={() => void window.api.capsuleDelete(c.id).then(reload)}>{tr('刪除')}</button>
              </div>
            </div>
          )
        })}
      </div>
      {opened && (
        <div className="tm-card">
          <b>{opened.title}</b>
          <div style={{ whiteSpace: 'pre-wrap' }}>{opened.text}</div>
          <div className="pop-actions">
            <button className="btn ghost" onClick={() => onInsert(opened.text)}>{tr('插入文件')}</button>
            <button className="btn ghost" onClick={() => setOpened(null)}>{tr('關閉')}</button>
          </div>
        </div>
      )}
    </>
  )
}

interface Entry { id: string; title: string; text: string }

function Drawer() {
  const [blob, setBlob] = useState<string | null | undefined>(undefined)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    void window.api.drawerRead().then(setBlob)
    return () => setPw('') // 離開面板就忘掉密碼
  }, [])

  const save = async (list: Entry[], password = pw) => {
    setBusy(true)
    const ok = await window.api.drawerWrite(await encryptJson(password, list))
    setBusy(false)
    setMsg(ok ? '已加密儲存。' : '儲存失敗。')
    if (ok) {
      setDirty(false)
      setBlob(await window.api.drawerRead())
    }
  }
  const unlock = async () => {
    if (!blob) return
    setBusy(true)
    const r = await decryptJson<Entry[]>(pw, blob)
    setBusy(false)
    if (!r) return setMsg('密碼不對，或檔案已損壞。')
    setEntries(r)
    setMsg('')
  }
  const lock = () => {
    setEntries(null)
    setPw('')
    setDirty(false)
  }

  if (blob === undefined) return <p className="pop-empty">{tr('讀取中…')}</p>

  if (entries) {
    return (
      <>
        <div className="tm-list">
          {entries.map((en, i) => (
            <div key={en.id} className="tm-card">
              <input className="vault-input" value={en.title} onChange={(e) => { setDirty(true); setEntries(entries.map((x, k) => (k === i ? { ...x, title: e.target.value } : x))) }} />
              <textarea className="vault-text" value={en.text} onChange={(e) => { setDirty(true); setEntries(entries.map((x, k) => (k === i ? { ...x, text: e.target.value } : x))) }} />
              <button className="btn ghost" onClick={() => { setDirty(true); setEntries(entries.filter((_, k) => k !== i)) }}>{tr('刪除這則')}</button>
            </div>
          ))}
        </div>
        <div className="pop-actions">
          <button className="btn ghost" onClick={() => { setDirty(true); setEntries([...entries, { id: String(Date.now()), title: '新的一則', text: '' }]) }}>{tr('新增一則')}</button>
          <button className="btn" disabled={busy || !dirty} onClick={() => void save(entries)}>{tr('加密儲存')}</button>
          <button className="btn ghost" onClick={lock}>{tr('鎖上')}</button>
        </div>
        {msg && <div className="hist-hint">{msg}</div>}
      </>
    )
  }

  if (blob) {
    return (
      <>
        <div className="hist-hint">{tr('輸入密碼解鎖。內容以 AES-256-GCM 加密，只存在這台電腦上。')}</div>
        <input className="vault-input" type="password" placeholder={tr('密碼')} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void unlock()} />
        <div className="pop-actions"><button className="btn" disabled={busy || !pw} onClick={() => void unlock()}>{tr('解鎖')}</button></div>
        {msg && <div className="hist-hint">{msg}</div>}
      </>
    )
  }

  return (
    <>
      <div className="hist-hint">{tr('建立加密抽屜，放不想被別人看到的草稿或筆記。密碼不會被儲存，忘記就無法找回。')}</div>
      <input className="vault-input" type="password" placeholder={tr('設定密碼（至少 8 個字元）')} value={pw} onChange={(e) => setPw(e.target.value)} />
      <input className="vault-input" type="password" placeholder={tr('再輸入一次')} value={pw2} onChange={(e) => setPw2(e.target.value)} />
      <div className="pop-actions">
        <button
          className="btn"
          disabled={busy}
          onClick={() => {
            if (pw.length < 8) return setMsg('密碼至少 8 個字元。')
            if (pw !== pw2) return setMsg('兩次輸入不一致。')
            const first: Entry[] = [{ id: String(Date.now()), title: '第一則', text: '' }]
            void save(first).then(() => setEntries(first))
          }}
        >{tr('建立並開啟')}</button>
      </div>
      {msg && <div className="hist-hint">{msg}</div>}
    </>
  )
}
