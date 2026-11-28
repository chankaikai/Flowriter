import type { MaterialSupport } from '../../shared/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MarkdownEditor, type EditorHandle, type FormatName } from '@/editor/MarkdownEditor'
import { SourceEditor, type SourceHandle } from '@/editor/SourceEditor'
import { SourceSplit } from '@/components/SourceSplit'
import { Sidebar } from '@/components/Sidebar'
import { FindBar } from '@/components/FindBar'
import { Palette } from '@/components/Palette'
import { SettingsPanel } from '@/components/SettingsPanel'
import { Icon } from '@/components/Icon'
import { emptyLocks, parseLocks, serializeLocks, setLocked, type LocksFile } from '@/lib/locks'
import { RefsPanel } from '@/components/RefsPanel'
import { addRef, emptyRefs, parseRefs, removeRef, serializeRefs, type RefsFile } from '@/lib/refs'
import { NotesPanel } from '@/components/NotesPanel'
import { addNote, emptyNotes, parseNotes, removeNote, serializeNotes, updateNote, type NotesFile } from '@/lib/notes'
import { MenuBar } from '@/components/MenuBar'
import { Ribbon } from '@/components/Ribbon'
import logo from './assets/logo.png'
import { usePill } from '@/lib/pill'
import { AiPanel, AmbientPanel, LinksPanel, Popover, TasksPanel } from '@/components/Panels'
import { ClipPanel, DiagnosticsPanel, RadarPanel, useClipStack } from '@/components/FlowPanels'
import { checkImages, healthCheck } from '@/lib/health'
import { speak, splitSentences, ttsAvailable, warmVoices, type SpeakHandle } from '@/lib/tts'
import { TimeMachine } from '@/components/TimeMachine'
import { VaultPanel } from '@/components/VaultPanel'
import type { CaretInfo } from '@/lib/caretMap'
import { ReversePanel } from '@/components/ReversePanel'
import { KnowledgePanel } from '@/components/KnowledgePanel'
import { FootnotePanel } from '@/components/FootnotePanel'
import { Pomodoro } from '@/components/Pomodoro'
import { uploadToHost } from '@/lib/imageHost'
import { findLocalImages, replaceImageUrls } from '../../shared/imageHost'
import { GraphDialog } from '@/components/GraphDialog'
import { GitDialog } from '@/components/GitDialog'
import { ExportDialog } from '@/components/ExportDialog'
import { SoundPanel, SpectrumBar } from '@/components/MusicPanel'
import { VoiceRecorder, type VoiceResult } from '@/components/VoiceRecorder'
import { resolveAi } from '@/lib/ai'
import { addVoice, anchorOf, emptyVoice, parseVoice, patchVoice, removeVoice, serializeVoice, type VoiceFile } from '@/lib/voice'
import { type AmbientKind, setAmbient } from '@/lib/ambient'
import { addWords, loadWriting } from '@/lib/writing'
import { moveSection } from '@/lib/markdown'
import { SHARE_CSS, cardCss } from '@/export/exportStyles'
import { CARD_SIZE, splitCards, type Ratio } from '@/lib/carousel'
import { Ruler } from '@/components/Ruler'
import { SelectionBubble } from '@/components/SelectionBubble'
import { ResumeBubble } from '@/components/ResumeBubble'
import { TextPrompt, type PromptRequest } from '@/components/TextPrompt'
import { addResume, getBookmark, getResumes, removeResume, saveCaret, type Resume } from '@/lib/bookmarks'
import { ResumePanel } from '@/components/ResumePanel'
import { Dashboard } from '@/components/Dashboard'
import { CompareView, type CompareSource } from '@/components/CompareView'
import { cleanMarkdown, withTarget } from '@/lib/dashboard'
import { htmlToMarkdown, shouldConvertHtml } from '@/lib/htmlToMarkdown'
import { loadRecent, loadSession, pushRecent, saveSession } from '@/lib/session'
import { buildCommands, type Actions, type ExportKind, type PanelName } from '@/lib/commands'
import { formatKeys, matchKey } from '@/lib/keys'
import { LARGE_DOC, computeStats, parseOutline, type DocStats, type OutlineItem } from '@/lib/markdown'
import { basename, dirname, stripExt, toAbsolutePath, toDisplayUrl } from '@/lib/path'
import { THEMES, isDarkTheme } from '@/lib/themes'
import { useApplySettings, useSettings, type SidebarTab, type ThemeName } from '@/lib/settings'
import { confirmBox } from '@/lib/confirm'
import { Splash, welcomed } from '@/components/Splash'
import { changelogFor } from '@/lib/changelog'
import { AboutPanel, UpdateBanner } from '@/components/AboutPanel'
import type { UpdateStatus } from '../../shared/update'
import { WELCOME } from '@/lib/welcome'
import { INITIAL_DOC, lastSeenVersion, markWelcomeDocShown, setSeenVersion, suggestedName } from '@/lib/startup'
import { buildHtmlDocument, renderHtmlBody } from '@/export/exportHtml'
import { musicHiddenMode } from '@/editor/musicUi'
import { buildDocx } from '@/export/exportDocx'
import { tr, trf, trAuto } from '@/lib/i18n'

type Mode = 'wysiwyg' | 'source'
interface DocMeta {
  path: string | null
  name: string
}

interface Tab {
  id: number
  path: string | null
  name: string
  md: string
  saved: string
  scroll: number
  /** 磁碟上檔案的修改時間，用來偵測外部修改 */
  mtime: number
}
interface TabInfo {
  id: number
  name: string
  dirty: boolean
  active: boolean
}

const underPath = (path: string | null, p: string) =>
  !!path && (path === p || path.startsWith(p + '/') || path.startsWith(p + '\\'))

const THEME_ORDER: ThemeName[] = THEMES.map((t) => t.id)
const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i
const MD_EXT = /\.(md|markdown|mdown|txt)$/i

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

interface PoolEntry {
  key: number
  tabId: number
  /** 建立編輯器時使用的初始內容 */
  initial: string
  /** 離開分頁時記下的內容，用來判斷之後是否可直接沿用實例 */
  md: string
  used: number
}
const MAX_LIVE = 5

export default function App() {
  const [settings, update] = useSettings()
  const updateSettingsRef = useRef(update)
  updateSettingsRef.current = update
  const [matKind, setMatKind] = useState<MaterialSupport>('none')
  const resolvedTheme = useApplySettings(settings, matKind !== 'none')

  const [doc, setDoc] = useState<DocMeta>({ path: null, name: '未命名' })
  // 每個分頁各自保留一個編輯器實例（最近用過的 MAX_LIVE 個），切換分頁時撤銷歷史、選區都不會丟
  const [pool, setPool] = useState<PoolEntry[]>([{ key: 1, tabId: 1, initial: INITIAL_DOC, md: INITIAL_DOC, used: 1 }])
  const [activeTabId, setActiveTabId] = useState(1)
  const [srcKey, setSrcKey] = useState(0)
  const [srcRev, setSrcRev] = useState(0)
  const poolRef = useRef(pool)
  poolRef.current = pool
  const poolKey = useRef(1)
  const poolTick = useRef(1)
  const activeEntry = pool.find((p) => p.tabId === activeTabId)
  /** 目前分頁的編輯器身分：換分頁、重新建立編輯器都會改變 */
  const session = { key: activeEntry ? activeEntry.key : -srcKey }
  const [mode, setMode] = useState<Mode>('wysiwyg')
  const [dirty, setDirty] = useState(false)
  const [caretLocked, setCaretLocked] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' })
  const [updHidden, setUpdHidden] = useState(false)
  const [splashOn, setSplashOn] = useState(() => !welcomed())
  const [logOpen, setLogOpen] = useState(false)
  // 升級後第一次啟動：先看歡迎畫面，再顯示這個版本的更新日誌
  const [updatedFrom, setUpdatedFrom] = useState<string | null | undefined>(undefined)
  const [stats, setStats] = useState<DocStats>(() => computeStats(INITIAL_DOC))
  const [outline, setOutline] = useState<OutlineItem[]>(() => parseOutline(INITIAL_DOC))
  const [activeHeading, setActiveHeading] = useState(-1)
  const [folder, setFolder] = useState<string | null>(settings.lastFolder)
  const [palette, setPalette] = useState<null | 'files' | 'commands' | 'recent'>(null)
  const [find, setFind] = useState<null | 'find' | 'replace'>(null)
  const [findSignal, setFindSignal] = useState(0)
  const [searchSignal, setSearchSignal] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [recent, setRecent] = useState<string[]>(loadRecent)
  const [panel, setPanel] = useState<PanelName | null>(null)
  const [aiSel, setAiSel] = useState('')
  const [radarQ, setRadarQ] = useState('')
  const [aiBefore, setAiBefore] = useState('')
  const [writing, setWriting] = useState(loadWriting)
  const [ambient, setAmbientKind] = useState<AmbientKind>('off')
  const [reading, setReading] = useState(false)
  const lastSnap = useRef<Record<string, number>>({})
  const [sticky, setSticky] = useState(false)
  /** 由分頁拖出建立的視窗：不讀寫「上次分頁」的工作階段，避免蓋掉主視窗的 */
  const secondary = useRef(false)
  const sidebarBeforeSticky = useRef(true)
  const [promptReq, setPromptReq] = useState<PromptRequest | null>(null)
  const [resume, setResume] = useState<{ hint: string | null; rect: { left: number; top: number; bottom: number } } | null>(null)
  const resumeTab = useRef<number | null>(null)
  const prevWords = useRef<{ key: number; n: number } | null>(null)
  const sidebarBeforeReading = useRef(true)
  const [editorReady, setEditorReady] = useState<EditorHandle | null>(null)
  const [tabList, setTabList] = useState<TabInfo[]>([
    { id: 1, name: '未命名', dirty: false, active: true }
  ])

  const editorRef = useRef<EditorHandle>(null)
  const sourceRef = useRef<SourceHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<Tab[]>([{ id: 1, path: null, name: '未命名', md: INITIAL_DOC, saved: INITIAL_DOC, scroll: 0, mtime: 0 }])
  const activeIdRef = useRef(1)
  const nextTabId = useRef(2)
  /** 切換所見即所得／源碼時暫存的游標錨點，新編輯器就緒後還原 */
  const modeCaret = useRef<CaretInfo | null>(null)
  const restored = useRef(false)
  const tabsEl = useRef<HTMLDivElement>(null)
  const tabPill = useRef<HTMLSpanElement>(null)
  const mdRef = useRef(INITIAL_DOC)
  const lastLen = useRef(INITIAL_DOC.length)
  const savedRef = useRef(INITIAL_DOC)
  const docRef = useRef(doc)
  const dirtyRef = useRef(false)
  const modeRef = useRef(mode)
  const settingsRef = useRef(settings)
  const pendingFind = useRef<string | null>(null)
  /** 側邊欄搜尋點擊的那一處：開啟後跳到它並選取 */
  const pendingJump = useRef<{ ctx: string; q: string } | null>(null)
  const runPendingJump = useCallback(() => {
    const j = pendingJump.current
    if (!j) return
    pendingJump.current = null
    window.setTimeout(() => {
      const ed = editorRef.current
      if (ed && !ed.gotoText(j.ctx)) ed.gotoText(j.q)
    }, 400)
  }, [])
  const derivedTimer = useRef(0)
  const autosaveTimer = useRef(0)
  /** 依設定排程自動儲存：即時＝輸入後 0.3 秒；否則「最晚每隔 N 秒存一次」（不會因為持續輸入而一直往後延） */
  const scheduleAutosave = useCallback(() => {
    const sec = settingsRef.current.autosaveSec
    if (sec <= 0) {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = window.setTimeout(() => { autosaveTimer.current = 0; void saveRef.current(true) }, 300)
    } else if (!autosaveTimer.current) {
      autosaveTimer.current = window.setTimeout(() => { autosaveTimer.current = 0; void saveRef.current(true) }, sec * 1000)
    }
  }, [])
  const saveRef = useRef<(silent?: boolean) => Promise<void>>(async () => {})
  docRef.current = doc
  modeRef.current = mode
  settingsRef.current = settings

  /* ------------------------------ 小工具 ------------------------------ */

  const showToast = useCallback((msg: string) => {
    setToast({ id: Date.now(), msg: trAuto(msg) })
  }, [])
  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 1800)
    return () => window.clearTimeout(t)
  }, [toast])

  /** 把分頁狀態寫入 localStorage，供下次啟動還原。還原完成前不寫入，避免覆蓋舊資料。 */
  const persistSession = useCallback((cleanExit = false) => {
    if (!restored.current) return
    const act = activeIdRef.current
    const kept = tabsRef.current
      .map((t) => {
        const live = t.id === act
        const path = live ? docRef.current.path : t.path
        const md = live ? mdRef.current : t.md
        return {
          id: t.id,
          path,
          name: live ? docRef.current.name : t.name,
          md: path ? undefined : md.length < 300_000 ? md : '',
          // 崩潰恢復：有路徑且有未儲存更改的分頁，把內容也留一份。正常關閉（cleanExit）時使用者已決定存或棄，不再保留
          dirtyMd: path && !cleanExit && md !== (live ? savedRef.current : t.saved) && md.length < 300_000 ? md : undefined,
          base: path ? t.mtime : undefined,
          scroll: live ? (scrollRef.current?.scrollTop ?? t.scroll) : t.scroll
        }
      })
      .filter((t) => t.path || (t.md && t.md.trim() && t.md !== WELCOME))
    if (secondary.current) return
    saveSession({
      tabs: kept.map(({ id: _id, ...rest }) => rest),
      active: Math.max(0, kept.findIndex((t) => t.id === act))
    })
  }, [])

  /** 重建分頁列資料，並通知主進程「是否有任何未儲存的分頁」。 */
  const publishTabs = useCallback(() => {
    const act = activeIdRef.current
    const list = tabsRef.current.map((t) => ({
      id: t.id,
      name: stripExt(t.name),
      dirty: t.id === act ? dirtyRef.current : t.md !== t.saved,
      active: t.id === act
    }))
    setTabList(list)
    window.api.setDirty(list.some((t) => t.dirty))
    window.api.reportPaths(tabsRef.current.map((t) => (t.id === act ? docRef.current.path : t.path)).filter((x): x is string => !!x))
    persistSession()
  }, [persistSession])

  const markDirty = useCallback(
    (d: boolean) => {
      if (dirtyRef.current === d) return
      dirtyRef.current = d
      setDirty(d)
      publishTabs()
    },
    [publishTabs]
  )

  /** 把所見即所得編輯器的最新內容同步到 mdRef（避免防抖延遲造成遺漏）。 */
  const syncFromEditor = useCallback(() => {
    if (modeRef.current === 'wysiwyg' && editorRef.current) {
      const md = editorRef.current.getMarkdown()
      if (md || mdRef.current === '') mdRef.current = md
    } else if (modeRef.current === 'source' && sourceRef.current) {
      mdRef.current = sourceRef.current.getValue()
    }
  }, [])

  /**
   * 防抖後才序列化文件並更新字數 / 大綱；文件越大延遲越長（180ms ~ 1.5s），
   * 同時用精確比對決定是否真的「有未儲存的更改」（例如編輯後又復原）。
   */
  const refreshDerived = useCallback(() => {
    window.clearTimeout(derivedTimer.current)
    const delay = Math.min(1500, Math.max(180, lastLen.current / 400))
    derivedTimer.current = window.setTimeout(() => {
      syncFromEditor()
      const md = mdRef.current
      lastLen.current = md.length
      markDirty(md !== savedRef.current)
      setStats(computeStats(md))
      setOutline(parseOutline(md))
    }, delay)
  }, [syncFromEditor, markDirty])

  /* ------------------------------ 文件操作 ------------------------------ */

  const save = useCallback(
    async (silent = false) => {
      syncFromEditor()
      const d = docRef.current
      if (!d.path) {
        await saveAs()
        return
      }
      const md = mdRef.current
      const ok = await window.api.saveFile(d.path, md)
      if (ok) {
        savedRef.current = md
        markDirty(mdRef.current !== md)
        const tab = tabsRef.current.find((x) => x.id === activeIdRef.current)
        if (tab) tab.mtime = (await window.api.statFile(d.path)) ?? tab.mtime
        if (!silent) showToast(tr('已儲存'))
        // 版本快照（時光機）：手動儲存一定留；自動儲存與設定的間隔同步——間隔 ≥ 90 秒就每次都留，即時儲存則至少相隔 90 秒
        const now = Date.now()
        const gap = Math.max(90, settingsRef.current.autosaveSec) * 1000
        if (!silent || now - (lastSnap.current[d.path] || 0) >= (settingsRef.current.autosaveSec >= 90 ? 1000 : gap)) {
          lastSnap.current[d.path] = now
          void window.api.historySave(d.path, md)
        }
      } else showToast(tr('儲存失敗'))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  saveRef.current = save

  /** 關閉視窗時選「儲存」：先存目前分頁，再存其他有路徑的已修改分頁；任一步失敗或取消就不關閉 */
  async function saveAllAndQuit(): Promise<void> {
    try {
      syncFromEditor()
      const d = docRef.current
      if (dirtyRef.current) {
        await save(true)
        if (!docRef.current.path || mdRef.current !== savedRef.current) return // 另存新檔被取消或儲存失敗
      }
      for (const t of tabsRef.current) {
        if (t.id === activeIdRef.current || t.md === t.saved) continue
        if (!t.path) return showToast(trf('「{0}」尚未命名，請先另存新檔', stripExt(t.name)))
        if (!(await window.api.saveFile(t.path, t.md))) return showToast(tr('儲存失敗，已取消關閉'))
      }
      void d
      window.api.forceClose()
    } catch {
      showToast(tr('儲存失敗，已取消關閉'))
    }
  }

  const saveAs = useCallback(async () => {
    syncFromEditor()
    const md = mdRef.current
    const suggested = docRef.current.path ? basename(docRef.current.path) : `${suggestedName(md)}.md`
    const p = await window.api.saveFileAs(suggested, md)
    if (!p) return
    savedRef.current = md
    setDoc({ path: p, name: basename(p) })
    const tab = tabsRef.current.find((x) => x.id === activeIdRef.current)
    if (tab) tab.mtime = (await window.api.statFile(p)) ?? 0
    setRecent(pushRecent(p))
    markDirty(false)
    showToast(tr('已儲存'))
  }, [syncFromEditor, markDirty, showToast])

  /* ------------------------------ 多分頁 ------------------------------ */

  /** 記下目前檔案的落筆位置（冷啟動書籤）。 */
  const saveCaretNow = useCallback(() => {
    const p = docRef.current.path
    if (!p || modeRef.current !== 'wysiwyg' || !editorRef.current) return
    const pos = editorRef.current.getCaret()
    if (pos > 1) saveCaret(p, pos)
  }, [])

  /** 把目前分頁的即時狀態寫回 tabsRef（切換、關閉前呼叫）。 */
  const snapshotActive = useCallback(() => {
    syncFromEditor()
    const t = tabsRef.current.find((x) => x.id === activeIdRef.current)
    if (!t) return
    t.path = docRef.current.path
    t.name = docRef.current.name
    t.md = mdRef.current
    t.saved = savedRef.current
    t.scroll = scrollRef.current?.scrollTop ?? 0
    saveCaretNow()
    // 記下這個實例目前持有的內容；之後分頁內容若被外部改掉（還原版本等），才知道要重建
    const e = poolRef.current.find((p) => p.tabId === t.id)
    if (e) e.md = t.md
  }, [syncFromEditor, saveCaretNow])

  /**
   * 讓某分頁有可用的編輯器。已有實例且內容沒被外部改過就直接沿用（回傳 false），
   * 否則建立新實例（回傳 true）。超過上限時淘汰最久沒用的背景實例。
   */
  const mountEditor = useCallback((tabId: number, md: string, force = false): boolean => {
    if (modeRef.current !== 'wysiwyg') return false
    const ex = poolRef.current.find((p) => p.tabId === tabId)
    if (ex && !force && ex.md === md) {
      ex.used = ++poolTick.current
      return false
    }
    const entry: PoolEntry = { key: ++poolKey.current, tabId, initial: md, md, used: ++poolTick.current }
    setPool((prev) => {
      const alive = new Set(tabsRef.current.map((t) => t.id))
      const next = [...prev.filter((p) => p.tabId !== tabId && alive.has(p.tabId)), entry]
      while (next.length > MAX_LIVE) {
        let oldest = -1
        next.forEach((p, i) => {
          if (p.tabId !== tabId && (oldest < 0 || p.used < next[oldest].used)) oldest = i
        })
        if (oldest < 0) break
        next.splice(oldest, 1)
      }
      return next
    })
    return true
  }, [])

  const activate = useCallback(
    (t: Tab) => {
      window.clearTimeout(autosaveTimer.current)
      autosaveTimer.current = 0
      activeIdRef.current = t.id
      mdRef.current = t.md
      lastLen.current = t.md.length
      const fresh = mountEditor(t.id, t.md)
      resumeTab.current = fresh && t.path ? t.id : null
      setResume(null)
      setLoading(fresh && t.md.length > LARGE_DOC)
      savedRef.current = t.saved
      dirtyRef.current = t.md !== t.saved
      setDirty(dirtyRef.current)
      setDoc({ path: t.path, name: t.name })
      setActiveTabId(t.id)
      setSrcKey((k) => k + 1)
      setStats(computeStats(t.md))
      setOutline(parseOutline(t.md))
      setActiveHeading(-1)
      publishTabs()
      const top = t.scroll
      requestAnimationFrame(() => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top })))
    },
    [publishTabs, mountEditor]
  )

  /** 離開目前分頁前：已有路徑且開啟自動儲存就先寫入磁碟。 */
  const flushActive = useCallback(async () => {
    syncFromEditor()
    if (mdRef.current !== savedRef.current && docRef.current.path && settingsRef.current.autosave) {
      await save(true)
    }
  }, [save, syncFromEditor])

  const switchTab = useCallback(
    async (id: number) => {
      if (id === activeIdRef.current) return
      await flushActive()
      snapshotActive()
      const t = tabsRef.current.find((x) => x.id === id)
      if (t) activate(t)
    },
    [activate, flushActive, snapshotActive]
  )

  /** 開啟內容：已開啟的路徑直接切過去；目前是未改動的空白頁就原地替換；否則新增分頁。 */
  const openInTab = useCallback(
    async (path: string | null, content: string) => {
      await flushActive()
      snapshotActive()
      const mtime = path ? ((await window.api.statFile(path)) ?? 0) : 0
      if (path) setRecent(pushRecent(path))
      if (path) {
        const ex = tabsRef.current.find((t) => t.path === path)
        if (ex) {
          if (ex.id !== activeIdRef.current) activate(ex)
          return
        }
        if (await window.api.focusIfOpen(path)) {
          showToast(tr('這個檔案已在另一個視窗開啟，已切換過去'))
          return
        }
      }
      const name = path ? basename(path) : '未命名'
      const cur = tabsRef.current.find((t) => t.id === activeIdRef.current)
      const pristine = !!cur && !cur.path && cur.md === cur.saved && (cur.md.trim() === '' || cur.md === WELCOME)
      if (cur && pristine) {
        Object.assign(cur, { path, name, md: content, saved: content, scroll: 0, mtime })
        activate(cur)
        return
      }
      const t: Tab = { id: nextTabId.current++, path, name, md: content, saved: content, scroll: 0, mtime }
      tabsRef.current = [...tabsRef.current, t]
      activate(t)
    },
    [activate, flushActive, snapshotActive, showToast]
  )

  const closeTab = useCallback(
    async (id: number) => {
      const isActive = id === activeIdRef.current
      if (isActive) syncFromEditor()
      const t = tabsRef.current.find((x) => x.id === id)
      if (!t) return
      const md = isActive ? mdRef.current : t.md
      const saved = isActive ? savedRef.current : t.saved
      if (md !== saved) {
        if (t.path && settingsRef.current.autosave) {
          if (isActive) await save(true)
          else await window.api.saveFile(t.path, t.md)
        } else if (!(await confirmBox(trf('「{0}」有尚未儲存的更改，確定要關閉嗎？', stripExt(isActive ? docRef.current.name : t.name)), tr('關閉不儲存')))) {
          return
        }
      }
      const idx = tabsRef.current.findIndex((x) => x.id === id)
      const rest = tabsRef.current.filter((x) => x.id !== id)
      if (rest.length === 0) {
        const nt: Tab = { id: nextTabId.current++, path: null, name: '未命名', md: '', saved: '', scroll: 0, mtime: 0 }
        tabsRef.current = [nt]
        setPool([])
        activate(nt)
        return
      }
      tabsRef.current = rest
      setPool((prev) => prev.filter((p) => p.tabId !== id))
      if (isActive) activate(rest[Math.min(idx, rest.length - 1)])
      else publishTabs()
    },
    [activate, publishTabs, save, syncFromEditor]
  )

  /**
   * 分頁拖放（像 WPS）：拖到別的視窗的分頁列上就併進去，拖到空白處就變成新視窗。
   * 只剩一個分頁時也能拖去併到別的視窗（併完這個視窗會自動關閉）。
   */
  const dropTab = useCallback(
    async (id: number, at: { x: number; y: number }) => {
      const only = tabsRef.current.length < 2
      const isActive = id === activeIdRef.current
      if (isActive) syncFromEditor()
      const t = tabsRef.current.find((x) => x.id === id)
      if (!t) return
      const md = isActive ? mdRef.current : t.md
      const saved = isActive ? savedRef.current : t.saved
      const name = isActive ? docRef.current.name : t.name
      const path = isActive ? docRef.current.path : t.path
      if (path && md === saved) saveCaretNow()
      const r = await window.api.dropTab({ path, name, md, saved }, at, only)
      if (r === 'none') return
      if (only) return // 主程序會關閉這個視窗
      const idx = tabsRef.current.findIndex((x) => x.id === id)
      const rest = tabsRef.current.filter((x) => x.id !== id)
      tabsRef.current = rest
      setPool((prev) => prev.filter((p) => p.tabId !== id))
      if (isActive) activate(rest[Math.min(idx, rest.length - 1)])
      else publishTabs()
    },
    [activate, publishTabs, saveCaretNow, syncFromEditor]
  )

  /** 別的視窗把分頁拖到這個視窗的分頁列：收下它（連同未儲存的更改） */
  const adoptTab = useCallback(
    async (d: { path: string | null; name: string; md: string; saved: string }) => {
      await flushActive()
      snapshotActive()
      if (d.path) {
        const ex = tabsRef.current.find((x) => x.path === d.path)
        if (ex) {
          if (d.md !== d.saved) Object.assign(ex, { md: d.md, saved: d.saved })
          activate(ex)
          return
        }
      }
      const mt = d.path ? ((await window.api.statFile(d.path)) ?? 0) : 0
      const cur = tabsRef.current.find((x) => x.id === activeIdRef.current)
      const pristine = !!cur && !cur.path && cur.md === cur.saved && cur.md.trim() === '' && tabsRef.current.length === 1
      if (cur && pristine) {
        Object.assign(cur, { path: d.path, name: d.name, md: d.md, saved: d.saved, scroll: 0, mtime: mt })
        activate(cur)
        return
      }
      const t: Tab = { id: nextTabId.current++, path: d.path, name: d.name, md: d.md, saved: d.saved, scroll: 0, mtime: mt }
      tabsRef.current = [...tabsRef.current, t]
      activate(t)
    },
    [activate, flushActive, snapshotActive]
  )
  useEffect(() => window.api.onTabAdopt((d) => void adoptTab(d)), [adoptTab])

  /** 拖曳分頁：拖到分頁列外面（下方或視窗外）放開，併到別的視窗或變成新視窗。 */
  const startTabDrag = useCallback(
    (e: React.MouseEvent, id: number) => {
      const sx = e.clientX
      const sy = e.clientY
      let dragging = false
      const bar = (e.currentTarget as HTMLElement).closest('.tabsbar') as HTMLElement | null
      const outside = (x: number, y: number) => {
        const r = bar?.getBoundingClientRect()
        if (!r) return false
        return y > r.bottom + 36 || y < r.top - 36 || x < -4 || x > window.innerWidth + 4
      }
      const move = (ev: MouseEvent) => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) {
          dragging = true
          document.body.classList.add('tab-dragging')
        }
        if (dragging) document.body.classList.toggle('tab-out', outside(ev.clientX, ev.clientY))
      }
      const up = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
        document.body.classList.remove('tab-dragging', 'tab-out')
        if (dragging && outside(ev.clientX, ev.clientY)) void dropTab(id, { x: ev.screenX, y: ev.screenY })
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    },
    [dropTab]
  )

  const openPath = useCallback(
    async (p: string, findText?: string, context?: string) => {
      pendingJump.current = findText && context ? { ctx: context, q: findText } : null
      if (docRef.current.path === p) {
        if (findText) {
          setFind('find')
          pendingFind.current = findText
          setFindSignal((n) => n + 1)
          runPendingJump()
        }
        return
      }
      const existing = tabsRef.current.find((t) => t.path === p)
      let content = existing?.md ?? ''
      if (!existing) {
        const r = await window.api.readFile(p)
        if (!r) return showToast(tr('無法開啟檔案'))
        content = r.content
      }
      pendingFind.current = findText ?? null
      await openInTab(p, content)
    },
    [openInTab, showToast, runPendingJump]
  )

  const newDoc = useCallback(async () => {
    await openInTab(null, '')
  }, [openInTab])

  const openFile = useCallback(async () => {
    const r = await window.api.openFile()
    if (r) await openInTab(r.path, r.content)
  }, [openInTab])

  /** 啟動時還原上次的分頁（有路徑的從磁碟重新讀取，未命名的用保存的內容）。 */
  const restoreSession = useCallback(async () => {
    if (settingsRef.current.startupDoc === 'blank') return
    const sess = loadSession()
    if (!sess || sess.tabs.length === 0) return
    const tabs: Tab[] = []
    let activeTab: Tab | undefined
    let recovered = 0
    let conflicts = 0
    for (let i = 0; i < sess.tabs.length; i++) {
      const st = sess.tabs[i]
      let t: Tab | null = null
      if (st.path) {
        const r = await window.api.readFile(st.path)
        if (r) {
          const mt = (await window.api.statFile(st.path)) ?? 0
          const useDirty = typeof st.dirtyMd === 'string' && st.dirtyMd !== r.content
          if (useDirty) {
            recovered++
            if (st.base && mt > st.base) conflicts++
          }
          t = {
            id: nextTabId.current++, path: st.path, name: basename(st.path),
            md: useDirty ? (st.dirtyMd as string) : r.content, saved: r.content,
            scroll: st.scroll, mtime: mt
          }
        }
      } else if (st.md) {
        t = { id: nextTabId.current++, path: null, name: st.name || '未命名', md: st.md, saved: '', scroll: st.scroll, mtime: 0 }
      }
      if (t) {
        tabs.push(t)
        if (i === sess.active) activeTab = t
      }
    }
    if (tabs.length === 0) return
    tabsRef.current = tabs
    activate(activeTab ?? tabs[0])
    if (recovered) {
      showToast(
        trf('已恢復 {0} 個分頁上次未儲存的更改', recovered) +
          (conflicts ? `，其中 ${conflicts} 個檔案之後被其他程式修改過，儲存前請留意` : '')
      )
    }
  }, [activate, showToast])

  /** 視窗取得焦點時檢查已開啟的檔案是否被其他程式修改。 */
  const checkExternal = useCallback(async () => {
    for (const t of [...tabsRef.current]) {
      if (!t.path) continue
      const m = await window.api.statFile(t.path)
      if (m == null) continue
      if (!t.mtime) {
        t.mtime = m
        continue
      }
      if (m <= t.mtime) continue
      t.mtime = m // 先記下新時間，避免同一次修改重複提示
      const isActive = t.id === activeIdRef.current
      if (isActive) syncFromEditor()
      const dirtyNow = isActive ? mdRef.current !== savedRef.current : t.md !== t.saved
      if (
        dirtyNow &&
        !(await confirmBox(trf('「{0}」已被其他程式修改。要重新載入並放棄目前未儲存的更改嗎？', stripExt(t.name)), tr('重新載入')))
      ) {
        continue
      }
      const r = await window.api.readFile(t.path)
      if (!r || r.content === (isActive ? mdRef.current : t.md)) continue
      if (isActive) t.scroll = scrollRef.current?.scrollTop ?? 0
      t.md = r.content
      t.saved = r.content
      if (isActive) activate(t)
      else publishTabs()
      showToast(trf('已重新載入「{0}」', stripExt(t.name)))
    }
  }, [activate, publishTabs, showToast, syncFromEditor])

  /** Electron 沒有 window.prompt，用玻璃對話框取得一行文字；取消回傳 null。 */
  const askText = useCallback(
    (title: string, opts: Partial<Omit<PromptRequest, 'title' | 'resolve'>> = {}) =>
      new Promise<string | null>((resolve) => {
        setPromptReq({
          title,
          ...opts,
          resolve: (v) => {
            setPromptReq(null)
            resolve(v)
          }
        })
      }),
    []
  )

  const openFolder = useCallback(async () => {
    const p = await window.api.openFolder()
    if (!p) return
    setFolder(p)
    update({ lastFolder: p, sidebarOpen: true, sidebarTab: 'files' })
  }, [update])

  /** 開啟文件樹：已有資料夾就直接顯示，否則請使用者選一個 */
  const showTree = useCallback(() => {
    if (folder) update({ sidebarOpen: true, sidebarTab: 'files' })
    else void openFolder()
  }, [folder, update, openFolder])

  /** 關閉文件樹：只是不再顯示資料夾，已開啟的文件與分頁都不受影響 */
  const closeFolder = useCallback(() => {
    setFolder(null)
    update({ lastFolder: null })
    showToast(tr('已關閉文件樹'))
  }, [update, showToast])

  /* ------------------------------ 圖片 ------------------------------ */

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const hosted = await uploadToHost(file.name || `image-${Date.now()}.png`, await file.arrayBuffer())
    if (hosted && 'url' in hosted) return hosted.url
    if (hosted) showToast(`${tr('圖床上傳失敗，已改存本機')}：${hosted.error}`)
    const p = docRef.current.path
    if (p) {
      const rel = await window.api.saveImage(p, file.name || `image-${Date.now()}.png`, await file.arrayBuffer())
      if (rel) return encodeURI(rel)
    }
    return readAsDataUrl(file) // 尚未儲存的文件：以內嵌 base64 保存
  }, [showToast])

  const resolveImageUrl = useCallback(
    (src: string) => toDisplayUrl(docRef.current.path ? dirname(docRef.current.path) : null, src),
    []
  )

  const handleFiles = useCallback(
    async (files: File[]): Promise<boolean> => {
      let handled = false
      for (const f of files) {
        if (MD_EXT.test(f.name)) {
          const p = window.api.pathForFile(f)
          if (p) {
            handled = true
            await openPath(p)
          }
        } else if (f.type.startsWith('image/') || IMG_EXT.test(f.name)) {
          if (modeRef.current !== 'wysiwyg') continue
          handled = true
          const name = f.name && f.name !== 'image.png' ? f.name : `image-${Date.now()}.png`
          const url = await uploadImage(new File([f], name, { type: f.type }))
          const alt = stripExt(name).replace(/\.[^.]+$/, '')
          editorRef.current?.insert(`![${alt}](${url})`)
        }
      }
      return handled
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openPath, uploadImage]
  )

  /* ------------------------------ 模式與匯出 ------------------------------ */

  const toggleSource = useCallback(() => {
    modeCaret.current = (modeRef.current === 'wysiwyg' ? editorRef.current?.caretInfo() : sourceRef.current?.caretInfo()) ?? null
    syncFromEditor()
    if (modeRef.current === 'wysiwyg') {
      snapshotActive()
      setPool([])
      setMode('source')
    } else {
      modeRef.current = 'wysiwyg'
      mountEditor(activeIdRef.current, mdRef.current, true)
      setLoading(mdRef.current.length > LARGE_DOC)
      setMode('wysiwyg')
    }
    setFind(null)
  }, [syncFromEditor, snapshotActive, mountEditor])

  const exportCards = useCallback(
    async (ratio: Ratio, mode: 'zip' | 'png') => {
      syncFromEditor()
      const cards = splitCards(mdRef.current)
      if (!cards.length) return showToast(tr('沒有可切成卡片的內容'))
      const base = stripExt(docRef.current.name)
      const dir = docRef.current.path ? dirname(docRef.current.path) : null
      const { width, height } = CARD_SIZE[ratio]
      try {
        showToast(trf('正在繪製 {0} 張卡片…', cards.length))
        const pages: { html: string }[] = []
        for (const c of cards) {
          const body = await renderHtmlBody(c.md, dir, musicHiddenMode)
          const html = buildHtmlDocument(c.title || base, `<div class="card${c.cover ? ' cover' : ''}"><div class="card-glass"><div class="card-body">${body}</div></div><span class="card-no">${c.index + 1}/${c.total}</span></div>`)
            .replace('</style>', `${cardCss(width, height)}</style>`)
          pages.push({ html })
        }
        const out = await window.api.exportCards({ name: base, cards: pages, width, height, mode })
        if (!out) return setToast(null)
        showToast(out.overflow.length ? trf('已匯出 {0} 張；第 {1} 張內容太長被截掉，建議多分一張', out.count, out.overflow.join('、')) : trf('已匯出 {0} 張輪播圖', out.count))
        window.api.reveal(out.path)
      } catch (err) {
        console.error(err)
        showToast(tr('匯出失敗'))
      }
    },
    [showToast, syncFromEditor]
  )

  const exportAs = useCallback(
    async (kind: ExportKind) => {
      syncFromEditor()
      const md = mdRef.current
      const base = stripExt(docRef.current.name)
      const dir = docRef.current.path ? dirname(docRef.current.path) : null
      if (kind !== 'md') {
        // 匯出前健檢：有「錯誤」等級的問題先問一聲
        const h = healthCheck(md)
        const miss = await checkImages(h.images, (src) => toAbsolutePath(dir, src), async (p) => (await window.api.statFile(p)) != null)
        const errs = [...miss, ...h.issues].filter((i) => i.level === 'error')
        if (errs.length && !(await confirmBox(trf('文件健檢發現 {0} 個錯誤，例如：\n{1}\n\n仍要匯出嗎？（取消會打開健檢面板）', errs.length, errs[0].message), tr('仍要匯出')))) {
          setPanel('diag')
          return
        }
      }
      if (kind === 'html' || kind === 'pdf' || kind === 'print') {
        // 這三種有設定與預覽：開對話框，實際輸出在對話框裡進行
        setExportDlg(kind)
        return
      }
      try {
        let out: string | null = null
        if (kind === 'md') {
          out = await window.api.exportFile({ name: base, ext: 'md', filterName: 'Markdown', data: md })
        } else if (kind === 'png') {
          showToast(tr('正在繪製長圖…'))
          const body = await renderHtmlBody(md, dir, musicHiddenMode)
          const html = buildHtmlDocument(base, `<main class="share-card">${body}</main><p class="share-foot">FLOWITER</p>`)
            .replace('</style>', `${SHARE_CSS}</style>`)
          out = await window.api.exportImage({ name: base, html, width: 760 })
        } else if (kind === 'docx') {
          out = await window.api.exportFile({ name: base, ext: 'docx', filterName: 'Word', data: await buildDocx(md, musicHiddenMode) })
        } else {
          showToast(tr('正在處理…'))
          const html = buildHtmlDocument(base, await renderHtmlBody(md, dir, musicHiddenMode))
          out =
            kind === 'html'
              ? await window.api.exportFile({ name: base, ext: 'html', filterName: 'HTML', data: html })
              : await window.api.exportPdf({ name: base, html })
        }
        if (out) {
          showToast(tr('已匯出'))
          window.api.reveal(out)
        } else setToast(null)
      } catch (err) {
        console.error(err)
        showToast(tr('匯出失敗'))
      }
    },
    [syncFromEditor, showToast]
  )

  /* ------------------------------ 命令 ------------------------------ */

  /** 以新內容取代目前分頁（還原版本、調整章節）。先留一份快照，所以可以從時光機找回。 */
  const replaceContent = useCallback(
    (md: string) => {
      syncFromEditor()
      snapshotActive()
      const t = tabsRef.current.find((x) => x.id === activeIdRef.current)
      if (!t || md === t.md) return
      if (t.path) void window.api.historySave(t.path, t.md)
      t.md = md
      activate(t)
      if (settingsRef.current.autosave && t.path) {
        scheduleAutosave()
      }
    },
    [activate, scheduleAutosave, snapshotActive, syncFromEditor]
  )

  /** 把本文裡指向本機檔案的圖片全部傳到圖床，並把連結換成網址（可從時光機還原） */
  const uploadLocalImages = useCallback(async () => {
    syncFromEditor()
    const base = docRef.current.path ? dirname(docRef.current.path) : null
    const imgs = findLocalImages(mdRef.current)
    if (!imgs.length) return showToast(tr('本文沒有本地圖片'))
    if (!base) return showToast(tr('請先儲存文件，才能找到圖片檔'))
    const map = new Map<string, string>()
    let fail = ''
    for (const [i, im] of imgs.entries()) {
      showToast(`${tr('上傳中')} ${i + 1}/${imgs.length}…`)
      try {
        const abs = toAbsolutePath(base, im.url)
        const du = abs ? await window.api.readDataUrl(abs) : null
        if (!du) {
          fail = `${im.url}：${tr('找不到檔案')}`
          continue
        }
        const blob = await (await fetch(du)).blob()
        const r = await uploadToHost(basename(abs ?? '') || 'image.png', await blob.arrayBuffer())
        if (!r) return showToast(tr('請先到設定啟用圖床'))
        if ('url' in r) map.set(im.url, r.url)
        else fail = `${im.url}：${r.error}`
      } catch (e) {
        fail = `${im.url}：${String((e as Error)?.message ?? e).slice(0, 80)}`
      }
    }
    if (map.size) replaceContent(replaceImageUrls(mdRef.current, map))
    showToast(`${trf('已上傳 {0}／{1} 張', String(map.size), String(imgs.length))}${fail ? `；${fail}` : ''}`)
  }, [replaceContent, showToast, syncFromEditor])

  const onMoveSection = useCallback(
    (from: number, to: number) => {
      syncFromEditor()
      const r = moveSection(mdRef.current, from, to)
      if (r == null || r === mdRef.current) return
      replaceContent(r)
      showToast(tr('已調整章節順序'))
    },
    [replaceContent, showToast, syncFromEditor]
  )

  const openWikiLink = useCallback(
    async (name: string) => {
      const root = folder ?? (docRef.current.path ? dirname(docRef.current.path) : null)
      if (!root) {
        showToast(tr('先儲存檔案或開啟資料夾，才能使用連結'))
        return
      }
      const list = await window.api.listAll(root)
      const hit = list.find((f) => stripExt(f.name).toLowerCase() === name.toLowerCase())
      if (hit) {
        await openPath(hit.path)
        return
      }
      if (!(await confirmBox(trf('「{0}」還不存在，要在目前資料夾建立嗎？', name), tr('建立')))) return
      const p = await window.api.createFile(root, /\.md$/i.test(name) ? name : `${name}.md`)
      if (p) await openPath(p)
      else showToast(tr('建立失敗'))
    },
    [folder, openPath, showToast]
  )

  /** 寬度大幅改變後讓長文件重新量高度，避免文末出現一大片空白（看起來像內容不見了） */
  const reflowBigDoc = useCallback(() => {
    const sc = document.querySelector<HTMLElement>('.editor-col.big-doc') ?? document.querySelector<HTMLElement>('.editor-col:not([hidden])')
    const fromBottom = sc ? sc.scrollHeight - sc.scrollTop - sc.clientHeight : 0
    const top = sc?.scrollTop ?? 0
    const b = document.body.classList
    b.add('cv-reset')
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        b.remove('cv-reset')
        if (!sc) return
        const max = Math.max(0, sc.scrollHeight - sc.clientHeight)
        sc.scrollTop = fromBottom < 60 ? max : Math.min(top, max)
      })
    )
  }, [])

  const toggleSticky = useCallback(() => {
    const next = !sticky
    if (next) {
      sidebarBeforeSticky.current = settingsRef.current.sidebarOpen
      update({ sidebarOpen: false })
      setPanel(null)
    } else update({ sidebarOpen: sidebarBeforeSticky.current })
    setSticky(next)
    document.body.classList.toggle('mode-sticky', next)
    void window.api.setSticky(next)
    // 視窗還原需要一點時間（動畫），等尺寸穩定後重新量版
    window.setTimeout(reflowBigDoc, 120)
    window.setTimeout(reflowBigDoc, 700)
  }, [sticky, update, reflowBigDoc])

  // 拉動視窗大小也一樣：停手後重新量一次
  useEffect(() => {
    let t = 0
    const onResize = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => document.querySelector('.editor-col.big-doc') && reflowBigDoc(), 400)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(t)
    }
  }, [reflowBigDoc])

  const [resumeTick, setResumeTick] = useState(0)
  const setResumeHintCmd = useCallback(async () => {
    const p = docRef.current.path
    if (!p) return showToast(tr('先儲存檔案，才能添加接續提示'))
    const pos = editorRef.current?.getCaret() ?? getBookmark(p)?.pos ?? 0
    const v = await askText(tr('接續提示：寫給下次打開時的自己'), { placeholder: tr('例如：先把第三章的數據補上（可留空，只記位置）'), okLabel: tr('添加') })
    if (v == null) return
    saveCaretNow()
    addResume(p, pos, v)
    setResumeTick((n) => n + 1)
    showToast(tr('已添加接續提示'))
  }, [askText, saveCaretNow, showToast])

  const clipStack = useClipStack()
  const speakRef = useRef<SpeakHandle | null>(null)
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => { warmVoices(); return () => speakRef.current?.stop() }, [])

  const toggleSpeak = useCallback(() => {
    if (speakRef.current) {
      speakRef.current.stop()
      return
    }
    const ed = editorRef.current
    if (!ed) return showToast(tr('朗讀只能在所見即所得模式使用'))
    if (!ttsAvailable()) return showToast(tr('這台電腦沒有可用的語音合成'))
    const sentences = splitSentences(ed.selectionText() || ed.textFromCaret())
    if (!sentences.length) return showToast(tr('沒有可朗讀的文字'))
    setSpeaking(true)
    speakRef.current = speak(sentences, {
      rate: 1,
      onSentence: (t) => editorRef.current?.gotoText(t),
      onEnd: (why) => {
        speakRef.current = null
        setSpeaking(false)
        if (why === 'error') showToast(tr('朗讀失敗：可能沒有安裝中文語音'))
      }
    })
  }, [showToast])

  const [lensOn, setLensOn] = useState(false)
  const toggleLens = useCallback(() => {
    const on = document.body.classList.toggle('show-lens')
    setLensOn(on)
    editorRef.current?.refreshLens()
    showToast(on ? tr('讀者視角已開啟：黃色虛線是未解釋的縮寫與跳躍的轉折') : tr('讀者視角已關閉'))
  }, [showToast])
  const [weightOn, setWeightOn] = useState(false)
  const toggleWeight = useCallback(() => {
    const on = document.body.classList.toggle('show-weight')
    setWeightOn(on)
    showToast(on ? '已顯示段落權重（左側色條越深，段落越長）' : '已隱藏段落權重')
  }, [showToast])

  const milestoneCmd = useCallback(async () => {
    const path = docRef.current.path
    if (!path) return showToast(tr('先儲存檔案，才能標記里程碑'))
    syncFromEditor()
    const v = await askText(tr('里程碑名稱'), { placeholder: tr('例如：初稿完成、交給導師前'), okLabel: tr('標記') })
    if (!v?.trim()) return
    const ok = await window.api.historyMilestone(path, mdRef.current, v)
    showToast(ok ? `已標記里程碑「${v.trim()}」，不會被自動清除` : '標記失敗')
  }, [askText, showToast, syncFromEditor])

  const openPanel = useCallback(
    (p: PanelName) => {
      if (p === 'focus') {
        setPomoSignal((n) => n + 1) // 番茄鐘是獨立的浮動模組，自己管理展開／收合
        return
      }
      syncFromEditor()
      if (p === 'ai' || p === 'vault' || p === 'notes' || p === 'refs') {
        setAiSel(editorRef.current?.selectionText() ?? '')
      }
      if (p === 'ai') setAiBefore(editorRef.current?.textBeforeCaret(1500) ?? '')
      if (p === 'radar') {
        const sel = editorRef.current?.selectionText() ?? ''
        setRadarQ((sel || editorRef.current?.textFromCaret() || mdRef.current).slice(0, 600))
      }
      setPanel((cur) => (cur === p ? null : p))
    },
    [syncFromEditor]
  )

  const toggleReading = useCallback(() => {
    if (!reading && modeRef.current !== 'wysiwyg') {
      showToast(tr('請先切回所見即所得模式'))
      return
    }
    if (!reading) {
      sidebarBeforeReading.current = settingsRef.current.sidebarOpen
      update({ sidebarOpen: false })
      setPanel(null)
    } else update({ sidebarOpen: sidebarBeforeReading.current })
    setReading(!reading)
  }, [reading, showToast, update])

  const actionsRef = useRef<Actions>(null as unknown as Actions)
  actionsRef.current = {
    newDoc,
    openFile,
    openFolder,
    compareDocs: () => {
      syncFromEditor()
      const act = activeIdRef.current
      setCmp({
        current: { label: docRef.current.name, md: mdRef.current },
        others: tabsRef.current.filter((t) => t.id !== act).map((t) => ({ label: t.name, md: t.md }))
      })
    },
    newWindow: () => window.api.newWindow(),
    closeFolder,
    showTree,
    save: () => void save(),
    saveAs: () => void saveAs(),
    exportAs: (k) => void exportAs(k),
    exportCards: (r, m) => void exportCards(r, m),
    toggleSidebar: () => update({ sidebarOpen: !settings.sidebarOpen }),
    showSidebarTab: (tab: SidebarTab) => {
      update({ sidebarOpen: true, sidebarTab: tab })
      if (tab === 'search') setSearchSignal((n) => n + 1)
    },
    toggleSource,
    toggleFocus: () => update({ focusMode: !settings.focusMode }),
    toggleTypewriter: () => update({ typewriter: !settings.typewriter }),
    cycleTheme: () => {
      const cur = resolvedTheme
      update({ theme: THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length] })
    },
    setTheme: (t) => update({ theme: t }),
    editRole: (r) => window.api.editRole(r),
    quit: () => window.api.closeWindow(),
    toggleLock: () => toggleLockCmd(),
    runCode: () => {
      if (!editorRef.current?.runAtCaret()) showToast(tr('把游標放在可執行語言（JS、Python、C、C++、Rust、Java、Go…）的代碼塊裡，或直接點代碼塊右上角的「▶ 執行」'))
    },
    inboxCapture: () => void window.api.inboxShow(),
    inboxOpen: () => void window.api.inboxPath().then((p) => openPath(p)),
    openPalette: (m) => setPalette(m),
    openFind: (replace) => {
      if (modeRef.current === 'source') {
        sourceRef.current?.openSearch()
        return
      }
      setFind(replace ? 'replace' : 'find')
      setFindSignal((n) => n + 1)
    },
    openSettings: () => setSettingsOpen(true),
    checkUpdate: () => {
      setUpdHidden(false)
      setPanel('about')
      void window.api.updateCheck()
    },
    format: (name: FormatName) => editorRef.current?.format(name),
    zoom: (d) => update({ fontSize: Math.max(13, Math.min(26, settings.fontSize + d)) }),
    fullscreen: () => window.api.toggleFullscreen(),
    closeTab: () => void closeTab(activeIdRef.current),
    toggleReading: () => toggleReading(),
    toggleSticky: () => toggleSticky(),
    setResumeHint: () => void setResumeHintCmd(),
    milestone: () => void milestoneCmd(),
    toggleWeight: () => toggleWeight(),
    toggleLens: () => toggleLens(),
    recordVoice: () => recordVoice(),
    toggleSpeak: () => toggleSpeak(),
    uploadLocalImages: () => void uploadLocalImages(),
    openGraph: () => {
      if (folder) setGraphOpen(true)
      else showToast(tr('請先開啟資料夾，才能畫出關係圖'))
    },
    openGit: () => {
      const d = folder ?? (docRef.current.path ? dirname(docRef.current.path) : null)
      if (d) setGitDir(d)
      else showToast(tr('請先開啟資料夾，或先儲存文件'))
    },
    openPanel: (p) => openPanel(p),
    cycleTab: (d) => {
      const l = tabsRef.current
      const i = l.findIndex((t) => t.id === activeIdRef.current)
      if (l.length > 1) void switchTab(l[(i + d + l.length) % l.length].id)
    }
  }

  const commands = useMemo(
    () =>
      buildCommands(
        new Proxy({} as Actions, {
          get: (_t, prop: string) => (...args: unknown[]) =>
            (actionsRef.current as unknown as Record<string, (...a: unknown[]) => void>)[prop](...args)
        })
      ),
    []
  )

  // 全域快捷鍵（捕獲階段，優先於編輯器自身的按鍵處理）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.repeat && !/^(Equal|Minus)$/.test(e.code)) return
      const target = e.target as HTMLElement
      for (const c of commands) {
        if (!c.keys) continue
        for (const spec of c.keys) {
          if (!matchKey(e, spec)) continue
          if (c.editorOnly) {
            if (modeRef.current !== 'wysiwyg') continue
            if (target.closest('input, textarea, .cm-editor')) continue
          }
          e.preventDefault()
          e.stopPropagation()
          c.run()
          return
        }
      }
      if (e.key === 'Escape') {
        if (find) setFind(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [commands, find])

  // macOS 原生選單
  useEffect(
    () =>
      window.api.onMenu((id) => {
        if (id === 'app.saveAllAndQuit') {
          void saveAllAndQuit()
          return
        }
        commands.find((c) => c.id === id)?.run()
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commands]
  )

  /* ------------------------------ 生命週期 ------------------------------ */

  useEffect(() => {
    window.api.getMaterialSupport().then(setMatKind)
  }, [])

  useEffect(() => {
    void (async () => {
      const init = await window.api.getInitialDoc()
      if (init) {
        secondary.current = true
        const mt = init.path ? ((await window.api.statFile(init.path)) ?? 0) : 0
        const t: Tab = { id: nextTabId.current++, path: init.path, name: init.name, md: init.md, saved: init.saved, scroll: 0, mtime: mt }
        tabsRef.current = [t]
        activate(t)
        restored.current = true
        return
      }
      const launch = await window.api.getLaunchFile()
      markWelcomeDocShown()
      if (!launch) await restoreSession()
      restored.current = true
      if (launch) await openPath(launch)
      else persistSession()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 程式已經開著時，在檔案總管雙擊 .md：由主程序轉來，在這個視窗開成分頁
  useEffect(() => {
    const run = async (p: string) => {
      for (let i = 0; i < 50 && !restored.current; i++) await new Promise((r) => setTimeout(r, 100)) // 等啟動時的分頁還原完成
      await openPath(p)
    }
    const off = window.api.onExternalOpen((p) => void run(p))
    void window.api.takeExternalOpen().then((l) => l.forEach((p) => void run(p)))
    return off
  }, [openPath])

  // 關閉前保存工作狀態；回到視窗時檢查外部修改
  useEffect(() => {
    const onUnload = () => {
      saveCaretNow()
      syncFromEditor()
      persistSession(true)
    }
    // 崩潰 / 斷電保護：有未儲存內容時，每 5 秒把狀態寫一次
    const tick = window.setInterval(() => {
      if (dirtyRef.current || tabsRef.current.some((t) => t.md !== t.saved)) persistSession()
    }, 5000)
    const onFocus = () => void checkExternal()
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('focus', onFocus)
      window.clearInterval(tick)
    }
  }, [checkExternal, persistSession, syncFromEditor])

  // 拖放：避免瀏覽器導航，並支援開啟 .md
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length) void handleFiles(files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [handleFiles])

  // 另存新檔 / 重命名後，把名稱與路徑同步到目前分頁
  useEffect(() => {
    const t = tabsRef.current.find((x) => x.id === activeIdRef.current)
    if (t && (t.path !== doc.path || t.name !== doc.name)) {
      t.path = doc.path
      t.name = doc.name
    }
    publishTabs()
  }, [doc, publishTabs])

  // 標題欄文字 = 視窗標題
  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${stripExt(doc.name)} — Flowiter`
  }, [doc.name, dirty])

  // 大綱捲動追蹤
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc || mode !== 'wysiwyg') return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const hs = sc.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror h4, .ProseMirror h5, .ProseMirror h6')
        const line = sc.getBoundingClientRect().top + 90
        // 標題在文檔中依序排列，二分搜尋找出最後一個已越過視窗頂線的標題
        let idx = -1
        let lo = 0
        let hi = hs.length - 1
        while (lo <= hi) {
          const mid = (lo + hi) >> 1
          if (hs[mid].getBoundingClientRect().top <= line) {
            idx = mid
            lo = mid + 1
          } else hi = mid - 1
        }
        setActiveHeading(idx)
      })
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      sc.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [mode, session.key, outline.length])

  /* ------------------------------ 編輯器回呼 ------------------------------ */

  const onEdit = useCallback(() => {
    if (modeRef.current === 'source') setSrcRev((n) => n + 1) // 源碼＋預覽：預覽自行防抖後重新渲染
    markDirty(true) // 先樂觀標記；精確比對在防抖後的 refreshDerived 中
    refreshDerived()
    if (settingsRef.current.autosave && docRef.current.path) {
      scheduleAutosave()
    }
  }, [markDirty, refreshDerived, scheduleAutosave])

  // 切到源碼模式：源碼編輯器掛好後把游標放回剛才的位置
  useEffect(() => {
    if (mode !== 'source' || !modeCaret.current) return
    const info = modeCaret.current
    modeCaret.current = null
    let n = 0
    const go = () => {
      if (sourceRef.current) sourceRef.current.restoreCaretInfo(info)
      else if (n++ < 20) window.requestAnimationFrame(go)
    }
    window.requestAnimationFrame(go)
  }, [mode])

  // 切到已存在的實例時不會再觸發 onReady，這裡補上
  useEffect(() => {
    setEditorReady(editorRef.current)
  }, [session.key])

  const onEditorReady = useCallback(() => {
    setLoading(false)
    setEditorReady(editorRef.current)
    if (modeCaret.current && editorRef.current) {
      // 從源碼切回來：游標與畫面回到剛才的位置（不走「回到上次落筆處」）
      const info = modeCaret.current
      modeCaret.current = null
      editorRef.current.restoreCaretInfo(info)
      return
    }
    if (pendingFind.current) {
      setFind('find')
      setFindSignal((n) => n + 1)
      runPendingJump()
      return
    }
    // 冷啟動書籤：游標回到上次落筆處，並顯示接續提示
    const path = docRef.current.path
    if (path && resumeTab.current === activeIdRef.current && editorRef.current) {
      resumeTab.current = null
      // 有接續提示就回到「最新」的那一筆；否則回到自動記住的落筆處
      const latest = getResumes(path)[0]
      const bm = getBookmark(path)
      const pos = latest ? latest.pos : bm && bm.pos > 20 ? bm.pos : 0
      if (pos > 0 && editorRef.current.setCaret(pos)) {
        window.setTimeout(() => {
          const rect = editorRef.current?.caretRect()
          if (rect) setResume({ hint: latest?.hint || null, rect })
        }, 800)
      }
    }
  }, [])

  const jumpToHeading = (index: number, line: number) => {
    if (mode === 'wysiwyg') editorRef.current?.scrollToHeading(index)
    else sourceRef.current?.scrollToLine(line)
  }

  // 打字時淡出停靠欄，滑鼠一動即回來（避免遮擋書寫）
  useEffect(() => {
    const root = () => appRef.current
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (!(e.target as HTMLElement).closest('.editor-scroll')) return
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') root()?.classList.add('typing')
    }
    let lx = 0
    let ly = 0
    const onMove = (e: MouseEvent) => {
      if (Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) > 6) root()?.classList.remove('typing')
      lx = e.clientX
      ly = e.clientY
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  /* ------------------------------ 渲染 ------------------------------ */

  const hint = (id: string) => {
    const k = commands.find((c) => c.id === id)?.keys?.[0]
    return k ? formatKeys(k).join(' ') : undefined
  }
  const navRun = (tab: SidebarTab) => () => {
    if (settings.sidebarOpen && settings.sidebarTab === tab) update({ sidebarOpen: false })
    else actionsRef.current.showSidebarTab(tab)
  }
  const [pomoSignal, setPomoSignal] = useState(0)
  const [graphOpen, setGraphOpen] = useState(false)
  const [gitDir, setGitDir] = useState<string | null>(null)
  const [exportDlg, setExportDlg] = useState<null | 'html' | 'pdf' | 'print'>(null)
  const [popSlot, setPopSlot] = useState<HTMLElement | null>(null)
  const [cmp, setCmp] = useState<{ current: CompareSource; others: CompareSource[] } | null>(null)
  const wordsRef = useRef(0)
  useEffect(() => () => setAmbient('off', 0), [])

  // 游標所在段落是否已上鎖（功能區的按鈕會變成「段落解鎖」）；選取變動時節流檢查
  useEffect(() => {
    let t = 0
    const check = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => setCaretLocked(editorRef.current?.lockedAtCaret() ?? false), 150)
    }
    document.addEventListener('selectionchange', check)
    window.addEventListener('inkwell-lock-changed', check)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('selectionchange', check)
      window.removeEventListener('inkwell-lock-changed', check)
    }
  }, [])

  // 版本號與自動更新狀態
  useEffect(() => {
    void window.api.appVersion().then((v) => {
      setAppVersion(v)
      const prev = lastSeenVersion()
      if (prev !== v) {
        setSeenVersion(v)
        if (prev) { setUpdatedFrom(prev); setSplashOn(true) }
      }
    })
    void window.api.updateStatus().then(setUpd)
    return window.api.onUpdate((s) => {
      setUpd(s)
      if (s.state === 'available') setUpdHidden(false)
    })
  }, [])

  // 全域快捷鍵（開啟時才註冊；被其他程式占用會提示）
  useEffect(() => {
    let alive = true
    void window.api.inboxSetup(settings.inboxShortcut).then((r) => {
      if (!alive || !settings.inboxShortcut) return
      if (!r.ok) {
        // 所有組合都被占用：把開關還原成關閉，讓畫面如實反映，不留下「開著但沒作用」
        updateSettingsRef.current({ inboxShortcut: false })
        showToast(tr('Ctrl/⌘+Alt+Space 等組合都已被其他程式占用，收件匣快捷鍵無法啟用'))
      } else if (r.accel && r.accel !== 'CommandOrControl+Alt+Space') {
        showToast(trf('Ctrl/⌘+Alt+Space 被占用，已改用 {0}', r.accel.replace('CommandOrControl', 'Ctrl/⌘').replace(/\+/g, '+')))
      }
    })
    return () => {
      alive = false
    }
  }, [settings.inboxShortcut, showToast])

  // 頁邊便條：載入／儲存 .inkwell/notes.json（依文件所在資料夾）
  const [notesFile, setNotesFile] = useState<NotesFile>(emptyNotes)
  const notesLoaded = useRef<string | null>(null)
  useEffect(() => {
    const path = doc.path
    notesLoaded.current = null
    if (!path) {
      setNotesFile(emptyNotes())
      return
    }
    let dead = false
    void window.api.notesRead(path).then((raw) => {
      if (dead) return
      setNotesFile(parseNotes(raw))
      notesLoaded.current = path
    })
    return () => {
      dead = true
    }
  }, [doc.path])
  const commitNotes = (next: NotesFile) => {
    setNotesFile(next)
    if (doc.path && notesLoaded.current === doc.path) void window.api.notesWrite(doc.path, serializeNotes(next))
  }
  // 參考資料抽屜
  const [refsFile, setRefsFile] = useState<RefsFile>(emptyRefs)
  const refsLoaded = useRef<string | null>(null)
  useEffect(() => {
    const path = doc.path
    refsLoaded.current = null
    if (!path) {
      setRefsFile(emptyRefs())
      return
    }
    let dead = false
    void window.api.refsRead(path).then((raw) => {
      if (dead) return
      setRefsFile(parseRefs(raw))
      refsLoaded.current = path
    })
    return () => {
      dead = true
    }
  }, [doc.path])
  const commitRefs = (next: RefsFile) => {
    setRefsFile(next)
    if (doc.path && refsLoaded.current === doc.path) void window.api.refsWrite(doc.path, serializeRefs(next))
  }
  // 段落上鎖：.inkwell/locks.json
  const [locksFile, setLocksFile] = useState<LocksFile>(emptyLocks)
  const locksLoaded = useRef<string | null>(null)
  useEffect(() => {
    const path = doc.path
    locksLoaded.current = null
    if (!path) {
      setLocksFile(emptyLocks())
      return
    }
    let dead = false
    void window.api.locksRead(path).then((raw) => {
      if (dead) return
      setLocksFile(parseLocks(raw))
      locksLoaded.current = path
    })
    return () => {
      dead = true
    }
  }, [doc.path])
  // 編輯器就緒或鎖定清單變動時，同步到目前的編輯器
  const lockList = doc.path ? locksFile.files[basename(doc.path)] : undefined
  useEffect(() => {
    editorReady?.setLocks(lockList ?? [])
  }, [editorReady, lockList])
  useEffect(() => {
    const h = () => showToast(tr('這一段已上鎖，先解鎖（Ctrl/⌘+Alt+Q）才能修改'))
    window.addEventListener('inkwell-locked', h)
    return () => window.removeEventListener('inkwell-locked', h)
  }, [showToast])
  function toggleLockCmd() {
    const path = docRef.current.path
    if (!path) return showToast(tr('先儲存檔案，上鎖資訊才有地方存放（.inkwell/locks.json）'))
    const r = editorRef.current?.toggleLock()
    if (!r) return showToast(tr('游標要放在有文字的段落裡才能上鎖'))
    const key = basename(path)
    setLocksFile((cur) => {
      const next = setLocked(cur, key, r.text, r.locked)
      if (locksLoaded.current === path) void window.api.locksWrite(path, serializeLocks(next))
      return next
    })
    showToast(r.locked ? '已上鎖：這一段無法被修改' : '已解鎖')
    window.dispatchEvent(new Event('inkwell-lock-changed'))
  }
  // 語音便籤：.inkwell/voice.json + .inkwell/media/<id>.webm
  const [voiceFile, setVoiceFile] = useState<VoiceFile>(emptyVoice)
  const voiceLoaded = useRef<string | null>(null)
  const [recAnchor, setRecAnchor] = useState<string | null>(null)
  useEffect(() => {
    const path = doc.path
    voiceLoaded.current = null
    setRecAnchor(null)
    if (!path) {
      setVoiceFile(emptyVoice())
      return
    }
    let dead = false
    void window.api.voiceRead(path).then((raw) => {
      if (dead) return
      setVoiceFile(parseVoice(raw))
      voiceLoaded.current = path
    })
    return () => {
      dead = true
    }
  }, [doc.path])
  const commitVoice = (next: VoiceFile) => {
    setVoiceFile(next)
    if (doc.path && voiceLoaded.current === doc.path) void window.api.voiceWrite(doc.path, serializeVoice(next))
  }
  const voiceKey = doc.path ? basename(doc.path) : ''
  const voiceList = voiceFile.files[voiceKey]
  const voiceDelete = (id: string) => {
    const path = docRef.current.path
    if (!path) return
    if (!window.confirm(tr('刪除這則語音便籤？音檔也會一併刪除。'))) return
    commitVoice(removeVoice(voiceFile, voiceKey, id))
    void window.api.voiceDelete(path, id)
  }
  const voiceDeleteRef = useRef(voiceDelete)
  voiceDeleteRef.current = voiceDelete
  const mutateVoice = (fn: (f: VoiceFile) => VoiceFile) =>
    setVoiceFile((cur) => {
      const next = fn(cur)
      const p = docRef.current.path
      if (p && voiceLoaded.current === p) void window.api.voiceWrite(p, serializeVoice(next))
      return next
    })
  const voiceTranscribe = async (id: string): Promise<string | null> => {
    const path = docRef.current.path
    if (!path) return tr('先儲存檔案')
    const cfg = resolveAi(settings)
    if (cfg.missing) return tr('請先在 AI 設定填好服務網址與金鑰（要支援語音轉文字，例如 OpenAI Whisper、矽基流動 SenseVoice）')
    if (cfg.kind === 'anthropic') return tr('目前的 AI 服務不是 OpenAI 相容格式，無法轉文字')
    const r = await window.api.voiceTranscribe(path, id, { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: settings.sttModel || 'whisper-1' })
    if ('error' in r) return r.error
    const key = basename(path)
    mutateVoice((f) => patchVoice(f, key, id, { text: r.text, hidden: false }))
    return null
  }
  const voiceHandlersRef = useRef({ voiceTranscribe, mutateVoice })
  voiceHandlersRef.current = { voiceTranscribe, mutateVoice }
  useEffect(() => {
    editorReady?.setVoice(voiceList ?? [], doc.path ?? '', {
      onDelete: (id) => voiceDeleteRef.current(id),
      onPatch: (id, patch) => {
        const p = docRef.current.path
        if (p) voiceHandlersRef.current.mutateVoice((f) => patchVoice(f, basename(p), id, patch))
      },
      onTranscribe: (id) => voiceHandlersRef.current.voiceTranscribe(id)
    })
  }, [editorReady, voiceList, doc.path])
  const noteListKey = doc.path ? basename(doc.path) : ''
  const noteList = notesFile.files[noteListKey]
  useEffect(() => {
    editorReady?.setNoteMarks(noteList ?? [], () => setPanel('notes'))
  }, [editorReady, noteList])
  function recordVoice() {
    if (!docRef.current.path) return showToast(tr('先儲存檔案，語音才有地方存放（.inkwell/media/，不會寫進 .md）'))
    if (recAnchor !== null) return
    const a = editorRef.current?.voiceAnchor()
    if (!a) return showToast(tr('游標要放在有文字的段落裡，語音才有地方釘'))
    editorRef.current?.stopVoice()
    setRecAnchor(a)
  }
  async function finishVoice(r: VoiceResult) {
    const path = docRef.current.path
    const quote = recAnchor
    setRecAnchor(null)
    if (!path || quote === null) return
    const ok = await window.api.voiceSave(path, r.note.id, r.data)
    if (!ok) return showToast(tr('語音存檔失敗，沒有加入'))
    if (docRef.current.path !== path) return
    setVoiceFile((cur) => {
      const next = addVoice(cur, basename(path), { ...r.note, quote: anchorOf(quote) })
      if (voiceLoaded.current === path) void window.api.voiceWrite(path, serializeVoice(next))
      return next
    })
    showToast(tr('已加入語音便籤'))
  }
  const notesKey = doc.path ? basename(doc.path) : ''

  const [isFull, setIsFull] = useState(false)
  useEffect(() => window.api.onFullscreenState(setIsFull), [])
  const hasFront = /^---[ \t]*\r?\n/.test(mdRef.current)
  const checks: Record<string, boolean> = {
    sidebar: settings.sidebarOpen,
    source: mode === 'source',
    focus: settings.focusMode,
    typewriter: settings.typewriter,
    reading,
    sticky,
    weight: weightOn,
    lens: lensOn,
    fullscreen: isFull,
    [`theme:${settings.theme}`]: true
  }
  const [ribbonFold, setRibbonFold] = useState(() => localStorage.getItem('flowiter.ribbonFold') === '1')
  const foldRibbon = (v: boolean) => {
    setRibbonFold(v)
    try {
      localStorage.setItem('flowiter.ribbonFold', v ? '1' : '0')
    } catch {
      /* 忽略 */
    }
  }

  // 閱讀模式：唯讀、隱藏介面、顯示進度；Esc 退出
  useEffect(() => {
    document.body.classList.toggle('reading', reading)
    editorRef.current?.setReadonly(reading)
    if (!reading) return
    const sc = scrollRef.current
    const bar = document.querySelector<HTMLElement>('.reading-prog')
    const onScroll = () => {
      if (sc && bar) bar.style.width = `${(sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight)) * 100}%`
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && toggleReading()
    sc?.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('keydown', onKey)
    onScroll()
    return () => {
      sc?.removeEventListener('scroll', onScroll)
      window.removeEventListener('keydown', onKey)
    }
  }, [reading, editorReady, session.key, toggleReading])

  // 只統計「新增字數」：忽略減少，也忽略一次暴增（貼上）
  useEffect(() => {
    const p = prevWords.current
    if (p && p.key === session.key) {
      const d = stats.words - p.n
      if (d > 0 && d <= 200) setWriting(addWords(d))
    }
    prevWords.current = { key: session.key, n: stats.words }
  }, [stats.words, session.key])

  // 墨水漣漪：輸入時游標處暈開一點淡淡的墨
  useEffect(() => {
    if (!settings.inkRipple || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let last = 0
    let lastKey = 0
    let cps = 0
    const root = document.documentElement
    const onInput = (e: Event) => {
      const t = e.target as HTMLElement
      if (!t.closest?.('.milkdown .ProseMirror')) return
      const now = performance.now()
      // 打字速度（每秒字元數）：用指數平滑，停頓超過 1.5 秒就歸零
      const dt = now - lastKey
      lastKey = now
      cps = dt > 1500 ? 1 : cps * 0.7 + Math.min(14, 1000 / Math.max(dt, 60)) * 0.3
      root.style.setProperty('--caret-glow-radius', `${Math.round(Math.min(56, 18 + cps * 4.2))}px`)
      root.style.setProperty('--accent-pulse-brightness', `${Math.min(0.85, 0.3 + cps * 0.05).toFixed(2)}`)
      root.style.setProperty('--glow-color', cps > 7 ? '#00f2fe' : 'var(--accent)')
      if (now - last < 90) return
      last = now
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0).cloneRange()
      range.collapse(false)
      let r: DOMRect | undefined = range.getClientRects()[0]
      if (!r || (r.width === 0 && r.height === 0 && r.left === 0)) {
        const el = (sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement) ?? null
        r = el?.getBoundingClientRect()
      }
      if (!r) return
      const d = document.createElement('i')
      d.className = 'ink-drop'
      d.style.left = `${r.left}px`
      d.style.top = `${r.top + r.height / 2}px`
      d.addEventListener('animationend', () => d.remove(), { once: true })
      document.body.appendChild(d)
    }
    document.addEventListener('input', onInput, true)
    return () => document.removeEventListener('input', onInput, true)
  }, [settings.inkRipple])


  const activeTabKey = String(tabList.find((t) => t.active)?.id ?? '')
  usePill(tabsEl, tabPill, activeTabKey, tabList.map((t) => `${t.id}:${t.name}`).join('|'))
  useEffect(() => {
    tabsEl.current?.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [activeTabKey])

  const cmdRun = (id: string) => commands.find((c) => c.id === id)?.run()
  wordsRef.current = stats.words
  const minutes = stats.minutes < 1 ? tr('不到 1 分鐘') : trf('約 {0} 分鐘', Math.round(stats.minutes))

  return (
    <div
      ref={appRef}
      className={`app platform-${window.api.platform}`}
      style={{ ['--sw' as string]: `${settings.sidebarWidth}px` }}
      data-sidebar={settings.sidebarOpen ? 'open' : 'closed'}
      data-mode={mode}
    >
      {!updHidden && panel !== 'about' && <UpdateBanner status={upd} onDismiss={() => setUpdHidden(true)} onAbout={() => setPanel('about')} />}
      {splashOn && <Splash onDone={() => { setSplashOn(false); if (updatedFrom) setLogOpen(true) }} />}
      {logOpen && changelogFor(appVersion) && (
        <div className="prompt-scrim" onMouseDown={() => setLogOpen(false)}>
          <div className="cmp-box about-logbox" onMouseDown={(e) => e.stopPropagation()}>
            <h3>{tr('已更新到')} {appVersion}</h3>
            <ul>{changelogFor(appVersion)!.items.map((t, i) => <li key={i}>{tr(t)}</li>)}</ul>
            <button className="btn" onClick={() => setLogOpen(false)}>{tr('知道了')}</button>
          </div>
        </div>
      )}
      <header className="topbar">
        <img className="tb-logo" src={logo} alt="" />
        <MenuBar commands={commands} checks={checks} editorEnabled={mode === 'wysiwyg'} />
        <div className="tb-title" title={doc.path ?? ''}>
          {(doc.name || tr('未命名')) + (dirty ? ' ●' : '')} — Flowiter
        </div>
      </header>
      <Ribbon
        commands={commands}
        checks={checks}
        editorEnabled={mode === 'wysiwyg'}
        collapsed={ribbonFold}
        onCollapse={foldRibbon}
        onInsertTable={(r, c) => editorRef.current?.insertTable(r, c)}
        spacing={{ settings, update }}
        overrides={{ ...(caretLocked ? { 'edit.lock': { label: '段落解鎖', icon: 'unlock' } } : {}), ...(speaking ? { 'doc.speak': { label: '停止朗讀' } } : {}), ...(isFull ? { 'view.fullscreen': { label: '退出全螢幕', icon: 'compress' as const } } : {}), ...(hasFront ? { 'fmt.frontmatter': { label: '移除前置資料', glyph: '✕' } } : {}) }}
      />
      <div className="shell">
      <Sidebar
        open={settings.sidebarOpen}
        tab={settings.sidebarTab}
        onTab={(t) => update({ sidebarTab: t })}
        folder={folder}
        onOpenFolder={openFolder}
        activePath={doc.path}
        onOpenFile={openPath}
        onCreated={(p) => void openPath(p)}
        onRenamed={(from, to) => {
          const cur = docRef.current.path
          if (underPath(cur, from)) {
            const np = to + cur!.slice(from.length)
            setDoc({ path: np, name: basename(np) })
          }
          tabsRef.current.forEach((t) => {
            if (t.id !== activeIdRef.current && underPath(t.path, from)) {
              t.path = to + t.path!.slice(from.length)
              t.name = basename(t.path)
            }
          })
          publishTabs()
        }}
        onTrashed={(p) => {
          tabsRef.current.forEach((t) => {
            // 檔案已不在磁碟：保留內容並標為未儲存
            if (t.id !== activeIdRef.current && underPath(t.path, p)) {
              t.path = null
              t.saved = '\u0000'
            }
          })
          publishTabs()
          if (underPath(docRef.current.path, p)) {
            // 文件已被移除：保留內容，標記為未儲存，讓用戶決定另存位置
            setDoc((d) => ({ ...d, path: null }))
            markDirty(true)
            showToast(tr('檔案已移到回收桶，內容仍保留，可另存'))
          }
        }}
        outline={outline}
        activeHeading={activeHeading}
        onJump={jumpToHeading}
        onMoveSection={onMoveSection}
        searchFocusSignal={searchSignal}
      />

      <div
        className="side-resizer"
        role="separator"
        aria-orientation="vertical"
        title={tr('拖曳調整側邊欄寬度（雙擊還原）')}
        onDoubleClick={() => update({ sidebarWidth: 264 })}
        onPointerDown={(e) => {
          if (e.button !== 0 || !appRef.current) return
          e.preventDefault()
          const app = appRef.current
          const startX = e.clientX
          const startW = settings.sidebarWidth
          const clamp = (w: number) => Math.max(180, Math.min(560, Math.min(w, window.innerWidth - 320)))
          let w = startW
          app.classList.add('resizing')
          const move = (ev: PointerEvent) => {
            w = clamp(startW + ev.clientX - startX)
            app.style.setProperty('--sw', `${w}px`)
          }
          const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
            app.classList.remove('resizing')
            update({ sidebarWidth: Math.round(w) })
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
      />

      <div className="workspace">
        <header className="tabsbar">
          <button
            className="icon-btn"
            onClick={() => update({ sidebarOpen: !settings.sidebarOpen })}
            title={`切換側邊欄 (${formatKeys('Mod+Backslash').join('+')})`}
          >
            <Icon name="sidebar" />
          </button>
          <div className="tabs" ref={tabsEl} role="tablist">
            <span className="glass-pill tab-pill" ref={tabPill} />
            {tabList.map((t) => (
              <div
                key={t.id}
                data-key={String(t.id)}
                role="tab"
                aria-selected={t.active}
                className={`tab${t.active ? ' on' : ''}`}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    void closeTab(t.id)
                  } else if (e.button === 0) {
                    void switchTab(t.id)
                    startTabDrag(e, t.id)
                  }
                }}
              >
                <span className="tab-name">{t.name}</span>
                <button
                  className={`tab-x${t.dirty ? ' dirty' : ''}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeTab(t.id)
                  }}
                  title={tr('關閉分頁')}
                >
                  <i className="tab-dot" />
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
            <button className="icon-btn sm tab-add" onClick={() => void newDoc()} title={tr('新建 (Ctrl/⌘+N)')}>
              <Icon name="plus" size={15} />
            </button>
          </div>
        </header>

        <div className={`stage${panel ? ' has-pop' : ''}${panel === 'history' || panel === 'diag' ? ' pop-wide' : ''}`}>
          {mode === 'wysiwyg' && <Ruler scrollRef={scrollRef} rev={`${session.key}-${outline.length}-${stats.chars >> 9}`} />}
          <div className="editor-scroll" ref={scrollRef}>
            {mode === 'wysiwyg' ? (
              pool.map((entry) => {
                const isActive = entry.tabId === activeTabId
                return (
              <div
                className={`editor-col doc-in${isActive && stats.chars > 100_000 ? ' big-doc' : ''}`}
                style={isActive ? undefined : { display: 'none' }}
                key={entry.key}
                onClick={(e) => {
                  const w = (e.target as HTMLElement).closest('.wikilink') as HTMLElement | null
                  if (w && (reading || e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    void openWikiLink(w.dataset.wiki || '')
                  }
                }}
                onPasteCapture={(e) => {
                  const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
                  if (files.length) {
                    e.preventDefault()
                    e.stopPropagation()
                    void handleFiles(files)
                    return
                  }
                  // 從網頁 / Word / Google 文件貼上：HTML 轉成乾淨的 Markdown
                  if ((e.target as HTMLElement).closest('.cm-editor')) return
                  const html = e.clipboardData.getData('text/html')
                  if (html && shouldConvertHtml(html, Array.from(e.clipboardData.types))) {
                    const md = htmlToMarkdown(html)
                    if (md) {
                      e.preventDefault()
                      e.stopPropagation()
                      editorRef.current?.insert(md)
                    }
                  }
                }}
                onDropCapture={(e) => {
                  const files = Array.from(e.dataTransfer.files)
                  if (!files.length) return
                  e.preventDefault()
                  e.stopPropagation()
                  void handleFiles(files)
                }}
              >
                <MarkdownEditor
                  ref={isActive ? editorRef : undefined}
                  initialValue={entry.initial}
                  autofocus={isActive}
                  isDark={isDarkTheme(resolvedTheme)}
                  onEdit={onEdit}
                  onReady={onEditorReady}
                  uploadImage={uploadImage}
                  resolveImageUrl={resolveImageUrl}
                />
              </div>
                )
              })
            ) : (
              <SourceSplit
                key={`src-${srcKey}`}
                layout={settings.srcLayout}
                swap={settings.srcSwap}
                ratio={settings.srcRatio}
                onLayout={(l) => update({ srcLayout: l })}
                onSwap={() => update({ srcSwap: !settings.srcSwap })}
                onRatio={(r) => update({ srcRatio: r })}
                getMd={() => sourceRef.current?.getValue() ?? mdRef.current}
                rev={srcRev}
                title={stripExt(docRef.current.name)}
                docDir={docRef.current.path ? docRef.current.path.replace(/[\\/][^\\/]*$/, '') : null}
                source={
                  <div className="source-col doc-in">
                    <SourceEditor ref={sourceRef} value={mdRef.current} onEdit={onEdit} />
                  </div>
                }
              />
            )}
          </div>
          <FindBar
            mode={find}
            editor={mode === 'wysiwyg' ? editorReady : null}
            focusSignal={findSignal}
            onClose={() => setFind(null)}
          />
          <div className={`loading-veil${loading ? ' on' : ''}`}>
            <i />
            <span>{tr('正在載入大型文件…')}</span>
          </div>
          <SelectionBubble
            actions={(
              [
                ['panel.focus', tr('計時'), 'timer'],
                ['panel.ai', 'AI', 'sparkle'],
                ['panel.notes', tr('便條'), 'pen'],
                ['edit.lock', tr('上鎖'), 'lock'],
                ['panel.refs', tr('參考'), 'book'],
                ['panel.vault', tr('膠囊'), 'clip'],
                ['panel.radar', tr('雷達'), 'search']
              ] as const
            ).map(([id, label, icon]) => ({ id, label, icon, run: () => cmdRun(id) }))}
          />
          <TextPrompt req={promptReq} />
          {cmp && (
            <CompareView
              current={cmp.current}
              others={cmp.others}
              onPickFile={async () => {
                const r = await window.api.openFile()
                return r ? { label: basename(r.path), md: r.content } : null
              }}
              onApply={(m) => { replaceContent(m); setCmp(null); showToast(tr('已套用，原本的內容留在時光機裡')) }}
              onClose={() => setCmp(null)}
            />
          )}
          <ResumeBubble hint={resume?.hint ?? null} rect={resume?.rect ?? null} onDone={() => setResume(null)} />
          {sticky && (
            <div className="sticky-bar">
              <button className="sticky-exit" onClick={toggleSticky} title={tr('退出迷你模式，還原視窗（不會關閉程式）')}>
                {tr('↩ 退出迷你模式')}
              </button>
              <span className="sticky-title">{doc.path ? basename(doc.path) : tr('未命名')}</span>
            </div>
          )}
          {reading && <div className="reading-prog" />}
          {reading && (
            <div className="reading-chip">
              <span>{tr('閱讀')} {minutes}</span>
              <button className="icon-btn sm" onClick={toggleReading} title={tr('退出閱讀模式 (Esc)')}>
                <Icon name="close" size={14} />
              </button>
            </div>
          )}
          <Popover open={panel === 'history'} icon="history" title={tr('版本時光機')} onClose={() => setPanel(null)} wide>
            {panel === 'history' && (
              <TimeMachine
                path={doc.path}
                current={() => mdRef.current}
                onMilestone={milestoneCmd}
                onJump={(t) => { if (!editorRef.current?.gotoText(t)) showToast(tr('找不到對應位置（可能內含格式符號）')) }}
                onInsert={(t) => {
                  editorRef.current?.insert(t)
                  showToast(tr('已插回游標處'))
                }}
                onRestore={(c) => {
                  replaceContent(c)
                  setPanel(null)
                  showToast(tr('已還原，原本的內容也留在時光機裡'))
                }}
              />
            )}
          </Popover>
          <Popover open={panel === 'diag'} icon="diag" title={tr('排版檢驗、文風與 AI 檢查')} onClose={() => setPanel(null)} wide>
            {panel === 'diag' && (
              <DiagnosticsPanel
                md={mdRef.current}
                docDir={doc.path ? dirname(doc.path) : null}
                onJump={(t) => { if (!editorRef.current?.gotoText(t)) showToast(tr('找不到對應位置（可能內含格式符號）')) }}
                onReplace={(m) => {
                  replaceContent(m)
                  showToast(tr('已修正，原本的內容留在時光機裡'))
                }}
                prefs={settings}
                update={update}
                getBlocks={() => editorRef.current?.blockTexts() ?? []}
                onJumpBlock={(i, len) => { if (!editorRef.current?.gotoBlock(i, 0, len)) showToast(tr('找不到對應段落，文件可能已經改動，請重新分析')) }}
              />
            )}
          </Popover>
          <Popover open={panel === 'clips'} icon="clip" title={tr('剪貼簿收集')} onClose={() => setPanel(null)}>
            <ClipPanel stack={clipStack} prefs={settings} onInsert={(t) => editorRef.current?.insert(t)} />
          </Popover>
          <Popover open={panel === 'vault'} icon="lock" title={tr('時間膠囊與加密抽屜')} onClose={() => setPanel(null)}>
            {panel === 'vault' && (
              <VaultPanel
                selection={aiSel}
                onInsert={(t) => {
                  editorRef.current?.insert(t)
                  setPanel(null)
                }}
              />
            )}
          </Popover>
          <Popover open={panel === 'radar'} icon="search" title={tr('本地知識雷達')} onClose={() => setPanel(null)}>
            {panel === 'radar' && (
              <RadarPanel folder={folder} docPath={doc.path} query={radarQ} onOpen={(p) => void openPath(p)} />
            )}
          </Popover>
          <Popover open={panel === 'fn'} icon="book" title={tr('腳註')} onClose={() => setPanel(null)}>
            {panel === 'fn' && <FootnotePanel editor={editorReady} settings={settings} update={update} onClose={() => setPanel(null)} />}
          </Popover>
          <Popover open={panel === 'kb'} icon="book" title={tr('知識庫')} onClose={() => setPanel(null)}>
            {panel === 'kb' && (
              <KnowledgePanel
                folder={folder}
                docPath={doc.path}
                prefs={settings}
                update={update}
                getBlocks={() => editorRef.current?.blockTexts() ?? []}
                onJump={(i, len) => { if (!editorRef.current?.gotoBlock(i, 0, len)) showToast(tr('找不到對應段落，文件可能已經改動，請重新分析')) }}
                onOpen={(p) => void openPath(p)}
                onInsert={(md) => { editorRef.current?.insert(md); setPanel(null) }}
              />
            )}
          </Popover>
          <Popover open={panel === 'reverse'} icon="sparkle" title={tr('逆向大綱與重複段落')} onClose={() => setPanel(null)}>
            {panel === 'reverse' && (
              <ReversePanel
                docKey={doc.path ?? `untitled-${activeIdRef.current}`}
                prefs={settings}
                update={update}
                getBlocks={() => editorRef.current?.blockTexts() ?? []}
                onJump={(i, len) => { if (!editorRef.current?.gotoBlock(i, 0, len)) showToast(tr('找不到對應段落，文件可能已經改動，請重新分析')) }}
                onCopy={(md) => { void navigator.clipboard.writeText(md); showToast(tr('已複製大綱')) }}
              />
            )}
          </Popover>
          <Popover open={panel === 'refs'} icon="book" title={tr('參考資料抽屜')} onClose={() => setPanel(null)}>
            {panel === 'refs' && (
              <RefsPanel
                saved={!!doc.path}
                refs={refsFile.files[notesKey] ?? []}
                selection={aiSel}
                onAdd={(r) => commitRefs(addRef(refsFile, notesKey, r))}
                onRemove={(id) => commitRefs(removeRef(refsFile, notesKey, id))}
                onInsert={(md) => {
                  editorRef.current?.insert(md)
                  setPanel(null)
                }}
              />
            )}
          </Popover>
          <Popover open={panel === 'about'} icon="sparkle" title={tr('關於 Flowiter')} onClose={() => setPanel(null)}>
            {panel === 'about' && <AboutPanel version={appVersion} status={upd} />}
          </Popover>
          <Popover open={panel === 'resumes'} icon="pin" title={tr('接續列表')} onClose={() => setPanel(null)}>
            {panel === 'resumes' && (
              <ResumePanel
                key={resumeTick}
                saved={!!doc.path}
                items={doc.path ? getResumes(doc.path) : []}
                onAdd={() => void setResumeHintCmd()}
                onJump={(r: Resume) => { if (!editorRef.current?.setCaret(r.pos)) showToast(tr('只能在所見即所得模式跳轉')) }}
                onRemove={(id) => { if (doc.path) { removeResume(doc.path, id); setResumeTick((n) => n + 1) } }}
              />
            )}
          </Popover>
          <Popover open={panel === 'notes'} icon="pen" title={tr('頁邊便條')} onClose={() => setPanel(null)}>
            {panel === 'notes' && (
              <NotesPanel
                saved={!!doc.path}
                notes={notesFile.files[notesKey] ?? []}
                md={mdRef.current}
                selection={aiSel}
                onAdd={(q, t) => commitNotes(addNote(notesFile, notesKey, q, t))}
                onToggle={(id, done) => commitNotes(updateNote(notesFile, notesKey, id, { done }))}
                onRemove={(id) => commitNotes(removeNote(notesFile, notesKey, id))}
                onJump={(q) => { if (!editorRef.current?.gotoText(q)) showToast(tr('找不到對應位置（可能內含格式符號）')) }}
              />
            )}
          </Popover>
          <Popover open={panel === 'tasks'} icon="tasks" title={tr('任務收集')} onClose={() => setPanel(null)}>
            {panel === 'tasks' && (
              <TasksPanel
                md={mdRef.current}
                onJump={(t) => {
                  setPanel(null)
                  editorRef.current?.gotoTask(t)
                }}
              />
            )}
          </Popover>
          <Popover open={panel === 'links'} icon="link" title={tr('連結與反向連結')} onClose={() => setPanel(null)}>
            {panel === 'links' && (
              <LinksPanel
                folder={folder}
                docPath={doc.path}
                md={mdRef.current}
                onOpenLink={(n) => void openWikiLink(n)}
                onOpenHit={(p) => void openPath(p)}
                onGraph={() => (folder ? setGraphOpen(true) : showToast(tr('請先開啟資料夾，才能畫出關係圖')))}
              />
            )}
          </Popover>
          <Popover open={panel === 'ai'} icon="sparkle" title={tr('AI 改寫')} onClose={() => setPanel(null)}>
            {panel === 'ai' && (
              <AiPanel
                selection={aiSel}
                before={aiBefore}
                prefs={settings}
                update={update}
                onApply={(md) => {
                  editorRef.current?.insert(md)
                  setPanel(null)
                }}
                onAppend={(md) => {
                  editorRef.current?.collapseToEnd()
                  editorRef.current?.insert('\n\n' + md.trim() + '\n')
                  setPanel(null)
                }}
              />
            )}
          </Popover>
          <Popover open={panel === 'dashboard'} icon="chart" title={tr('寫作儀表板')} onClose={() => setPanel(null)}>
            {panel === 'dashboard' && (
              <Dashboard
                path={doc.path}
                docDir={doc.path ? dirname(doc.path) : null}
                getMd={() => { syncFromEditor(); return mdRef.current }}
                data={writing}
                goal={settings.dailyGoal}
                onGoal={(n) => update({ dailyGoal: n })}
                onTarget={(n) => { replaceContent(withTarget(mdRef.current, n)); showToast(n ? '已寫入目標字數' : '已移除目標字數') }}
                onToggleTask={(i, c) => { if (!editorRef.current?.setTask(i, c)) showToast(tr('請在所見即所得模式勾選任務')) }}
                onJumpText={(t) => { if (!editorRef.current?.gotoText(t)) showToast(tr('找不到對應位置（可能在源碼模式，或內含格式符號）')) }}
                onJumpPos={(pos) => { if (!editorRef.current?.setCaret(pos)) showToast(tr('只能在所見即所得模式跳轉')) }}
                onRestore={(c) => { replaceContent(c); showToast(tr('已還原，原本的內容也留在時光機裡')) }}
                onExportImage={() => void exportAs('png')}
                onCopyClean={() => { syncFromEditor(); void navigator.clipboard.writeText(cleanMarkdown(mdRef.current)).then(() => showToast(tr('已複製乾淨的 Markdown')), () => showToast(tr('複製失敗'))) }}
                onStyleCheck={() => setPanel('diag')}
              />
            )}
          </Popover>
          <Popover open={panel === 'ambient'} icon="timer" title={tr('氛圍音')} onClose={() => setPanel(null)}>
            <SoundPanel ambient={ambient} setAmbientKind={setAmbientKind} />
          </Popover>
          <div ref={setPopSlot} style={{ display: 'contents' }} />
        </div>

      </div>
      </div>
      {recAnchor !== null && <VoiceRecorder onDone={(r) => void finishVoice(r)} onCancel={() => setRecAnchor(null)} onError={showToast} />}
      {graphOpen && folder && (
        <GraphDialog
          folder={folder}
          current={doc.path}
          onOpen={(p) => void openPath(p)}
          onOpenGhost={(n) => void openWikiLink(n)}
          onClose={() => setGraphOpen(false)}
        />
      )}
      {gitDir && <GitDialog dir={gitDir} onClose={() => setGitDir(null)} onDone={showToast} />}
      {exportDlg && (
        <ExportDialog
          kind={exportDlg}
          md={mdRef.current}
          base={stripExt(docRef.current.name)}
          dir={docRef.current.path ? dirname(docRef.current.path) : null}
          onClose={() => setExportDlg(null)}
          onDone={showToast}
        />
      )}
      <Pomodoro getWords={() => wordsRef.current} openSignal={pomoSignal} slot={popSlot} otherPanelOpen={panel !== null} onDockOpen={() => setPanel(null)} />
      <footer className="statusbar">
        <button className="sb-btn gear" onClick={() => setSettingsOpen(true)} title={`偏好設定 (${hint('app.settings') ?? ''})`}>
          <Icon name="gear" size={15} />
          <span>{tr('設定')}</span>
        </button>
        <button className={`sb-btn${settings.sidebarOpen ? ' on' : ''}`} onClick={() => update({ sidebarOpen: !settings.sidebarOpen })} title={tr('側邊欄')}>
          <Icon name="sidebar" size={14} />
        </button>
        <span className="sb-text">{stats.words.toLocaleString()} {tr('字')}</span>
        <span className="sb-text">{tr('閱讀')} {minutes}</span>
        <span className="grow" />
        <SpectrumBar onClick={() => setPanel('ambient')} />
        <span className={`save-state${dirty ? ' unsaved' : ''}`}>
          {doc.path ? (dirty ? (settings.autosave ? tr('自動儲存中…') : tr('未儲存')) : tr('已儲存')) : dirty ? tr('未儲存') : ''}
        </span>
        <button className={`sb-btn${mode === 'source' ? ' on' : ''}`} onClick={toggleSource} title={tr('源碼模式')}>
          <Icon name="code" size={14} />
          <span>{mode === 'source' ? tr('源碼') : tr('所見即所得')}</span>
        </button>
        <button className={`sb-btn${settings.focusMode ? ' on' : ''}`} onClick={() => update({ focusMode: !settings.focusMode })} title={tr('聚焦模式')}>
          <Icon name="focus" size={14} />
        </button>
        <button className={`sb-btn${settings.typewriter ? ' on' : ''}`} onClick={() => update({ typewriter: !settings.typewriter })} title={tr('打字機模式')}>
          <Icon name="type" size={14} />
        </button>
        <button className={`sb-btn${reading ? ' on' : ''}`} onClick={toggleReading} title={tr('閱讀模式')}>
          <Icon name="book" size={14} />
        </button>
        <button className={`sb-btn${sticky ? ' on' : ''}`} onClick={toggleSticky} title={tr('迷你置頂便籤')}>
          <Icon name="pin" size={14} />
        </button>
        <button className="sb-btn" onClick={() => cmdRun('view.zoomOut')} title={tr('縮小字體')}>
          <span>A−</span>
        </button>
        <span className="sb-text">{settings.fontSize}px</span>
        <button className="sb-btn" onClick={() => cmdRun('view.zoomIn')} title={tr('放大字體')}>
          <span>A+</span>
        </button>
        <select
          className="sb-select"
          value={settings.theme}
          onChange={(e) => update({ theme: e.target.value })}
          title={tr('主題')}
        >
          <optgroup label={tr('淺色')}>
            {THEMES.filter((t) => !t.dark).map((t) => (
              <option key={t.id} value={t.id}>{tr(t.label)}</option>
            ))}
          </optgroup>
          <optgroup label={tr('深色')}>
            {THEMES.filter((t) => t.dark).map((t) => (
              <option key={t.id} value={t.id}>{tr(t.label)}</option>
            ))}
          </optgroup>
          <option value="system">{tr('跟隨系統')}</option>
        </select>
      </footer>

      <Palette
        mode={palette}
        commands={commands}
        recent={recent}
        folder={folder}
        onClose={() => setPalette(null)}
        onOpenFile={(p) => void openPath(p)}
        onOpenFolder={openFolder}
      />
      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        update={update}
        commands={commands}
        version={appVersion}
        updateStatus={upd}
        materialKind={matKind}
        onClose={() => setSettingsOpen(false)}
      />
      <div className={`toast${toast ? ' show' : ''}`}>{toast?.msg}</div>
    </div>
  )
}
