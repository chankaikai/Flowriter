import type { FormatName } from '@/editor/MarkdownEditor'
import type { SidebarTab, ThemeName } from './settings'
import { THEMES } from './themes'

export type ExportKind = 'html' | 'pdf' | 'docx' | 'md' | 'png'
export type PanelName = 'history' | 'dashboard' | 'focus' | 'ai' | 'links' | 'tasks' | 'vault' | 'diag' | 'clips' | 'notes' | 'radar' | 'refs' | 'about' | 'resumes' | 'ambient'

export interface Actions {
  newDoc(): void
  openFile(): void
  openFolder(): void
  compareDocs(): void
  newWindow(): void
  closeFolder(): void
  showTree(): void
  save(): void
  saveAs(): void
  exportAs(kind: ExportKind): void
  toggleSidebar(): void
  showSidebarTab(tab: SidebarTab): void
  toggleSource(): void
  toggleFocus(): void
  toggleTypewriter(): void
  cycleTheme(): void
  setTheme(t: ThemeName): void
  openPalette(mode: 'files' | 'commands' | 'recent'): void
  openFind(replace: boolean): void
  openSettings(): void
  checkUpdate(): void
  format(name: FormatName): void
  zoom(delta: number): void
  fullscreen(): void
  closeTab(): void
  cycleTab(dir: 1 | -1): void
  toggleReading(): void
  toggleSticky(): void
  setResumeHint(): void
  milestone(): void
  toggleWeight(): void
  toggleLens(): void
  toggleSpeak(): void
  editRole(r: 'cut' | 'copy' | 'paste' | 'selectAll'): void
  quit(): void
  toggleLock(): void
  runCode(): void
  inboxCapture(): void
  inboxOpen(): void
  openPanel(p: PanelName): void
}

export interface Cmd {
  id: string
  title: string
  group: string
  keys?: string[]
  /** 只在所見即所得模式、且焦點不在輸入框 / 代碼塊時觸發 */
  editorOnly?: boolean
  run(): void
}

export function buildCommands(a: Actions): Cmd[] {
  const fmt = (name: FormatName) => () => a.format(name)
  const F = '格式'
  return [
    // 檔案
    { id: 'file.new', title: '新建文件', group: '檔案', keys: ['Mod+N'], run: a.newDoc },
    { id: 'file.open', title: '開啟檔案…', group: '檔案', keys: ['Mod+O'], run: a.openFile },
    { id: 'doc.compare', title: '文件比對…', group: '文件', run: a.compareDocs },
    { id: 'file.newWindow', title: '新視窗', group: '檔案', keys: ['Mod+Shift+N'], run: a.newWindow },
    { id: 'tree.open', title: '開啟文件樹', group: '檢視', run: a.showTree },
    { id: 'tree.close', title: '關閉文件樹（不關閉已開啟的文件）', group: '檢視', run: a.closeFolder },
    { id: 'tree.change', title: '更換文件樹資料夾…', group: '檢視', run: a.openFolder },
    { id: 'file.openFolder', title: '開啟資料夾…', group: '檔案', keys: ['Mod+Shift+O'], run: a.openFolder },
    { id: 'tab.close', title: '關閉分頁', group: '檔案', keys: ['Mod+W'], run: a.closeTab },
    { id: 'tab.next', title: '下一個分頁', group: '導航', keys: ['Mod+Alt+ArrowRight'], run: () => a.cycleTab(1) },
    { id: 'tab.prev', title: '上一個分頁', group: '導航', keys: ['Mod+Alt+ArrowLeft'], run: () => a.cycleTab(-1) },
    { id: 'file.save', title: '儲存', group: '檔案', keys: ['Mod+S'], run: a.save },
    { id: 'file.saveAs', title: '另存為…', group: '檔案', keys: ['Mod+Shift+S'], run: a.saveAs },
    { id: 'export.html', title: '匯出為 HTML…', group: '匯出', run: () => a.exportAs('html') },
    { id: 'export.pdf', title: '匯出為 PDF…', group: '匯出', run: () => a.exportAs('pdf') },
    { id: 'export.docx', title: '匯出為 Word…', group: '匯出', run: () => a.exportAs('docx') },
    { id: 'export.png', title: '匯出為分享長圖…', group: '匯出', run: () => a.exportAs('png') },
    { id: 'export.md', title: '匯出為 Markdown…', group: '匯出', run: () => a.exportAs('md') },

    // 導航與面板
    { id: 'nav.quickOpen', title: '快速開啟檔案', group: '導航', keys: ['Mod+P'], run: () => a.openPalette('files') },
    { id: 'nav.recent', title: '最近開啟…', group: '導航', keys: ['Mod+Alt+O'], run: () => a.openPalette('recent') },
    { id: 'nav.commands', title: '命令面板', group: '導航', keys: ['Mod+Shift+P'], run: () => a.openPalette('commands') },
    { id: 'nav.find', title: '查找', group: '導航', keys: ['Mod+F'], run: () => a.openFind(false) },
    { id: 'nav.replace', title: '替換', group: '導航', keys: ['Mod+H'], run: () => a.openFind(true) },
    { id: 'nav.folderSearch', title: '在資料夾中搜尋', group: '導航', keys: ['Mod+Shift+F'], run: () => a.showSidebarTab('search') },
    { id: 'nav.outline', title: '顯示大綱', group: '導航', keys: ['Mod+Shift+L'], run: () => a.showSidebarTab('outline') },
    { id: 'nav.files', title: '顯示文件樹', group: '導航', run: () => a.showSidebarTab('files') },
    { id: 'view.sidebar', title: '切換側邊欄', group: '檢視', keys: ['Mod+Backslash'], run: a.toggleSidebar },
    { id: 'view.source', title: '切換源碼模式', group: '檢視', keys: ['Mod+Slash'], run: a.toggleSource },
    { id: 'view.focus', title: '聚焦模式', group: '檢視', keys: ['F8'], run: a.toggleFocus },
    { id: 'view.typewriter', title: '打字機模式', group: '檢視', keys: ['F9'], run: a.toggleTypewriter },
    { id: 'view.fullscreen', title: '全螢幕', group: '檢視', keys: ['F11'], run: a.fullscreen },
    { id: 'view.zoomIn', title: '放大字體', group: '檢視', keys: ['Mod+Equal', 'Mod+Shift+Equal'], run: () => a.zoom(1) },
    { id: 'view.zoomOut', title: '縮小字體', group: '檢視', keys: ['Mod+Minus'], run: () => a.zoom(-1) },
    { id: 'view.theme', title: '切換主題', group: '檢視', keys: ['Mod+Alt+T'], run: a.cycleTheme },
    ...THEMES.map((t): Cmd => ({ id: `theme.${t.id}`, title: `主題：${t.label}`, group: '主題', run: () => a.setTheme(t.id) })),
    { id: 'theme.system', title: '主題：跟隨系統', group: '主題', run: () => a.setTheme('system') },
    { id: 'view.reading', title: '閱讀模式', group: '檢視', keys: ['Mod+Alt+R'], run: a.toggleReading },
    { id: 'view.sticky', title: '迷你置頂便籤模式', group: '檢視', keys: ['Mod+Alt+M'], run: a.toggleSticky },
    { id: 'doc.resumeHint', title: '添加接續提示（記住目前位置，下次打開時回到這裡）', group: '文件', run: a.setResumeHint },
    { id: 'panel.history', title: '版本時光機', group: '面板', keys: ['Mod+Alt+H'], run: () => a.openPanel('history') },
    { id: 'panel.ai', title: 'AI 改寫選取文字', group: '面板', keys: ['Mod+Alt+I'], run: () => a.openPanel('ai') },
    { id: 'panel.focus', title: '番茄鐘', group: '面板', keys: ['Mod+Alt+P'], run: () => a.openPanel('focus') },
    { id: 'panel.ambient', title: '氛圍音', group: '面板', run: () => a.openPanel('ambient') },
    { id: 'panel.dashboard', title: '寫作儀表板', group: '面板', keys: ['Mod+Alt+D'], run: () => a.openPanel('dashboard') },
    { id: 'panel.radar', title: '本地知識雷達', group: '面板', keys: ['Mod+Alt+G'], run: () => a.openPanel('radar') },
    { id: 'panel.refs', title: '參考資料抽屜', group: '面板', keys: ['Mod+Alt+U'], run: () => a.openPanel('refs') },
    { id: 'panel.runner', title: '執行游標所在的代碼塊（JavaScript／Python）', group: '面板', keys: ['Mod+Alt+E'], editorOnly: true, run: a.runCode },
    { id: 'panel.resumes', title: '接續列表', group: '面板', run: () => a.openPanel('resumes') },
    { id: 'panel.notes', title: '頁邊便條', group: '面板', keys: ['Mod+Alt+N'], run: () => a.openPanel('notes') },
    { id: 'panel.tasks', title: '任務收集', group: '面板', keys: ['Mod+Alt+J'], run: () => a.openPanel('tasks') },
    { id: 'panel.vault', title: '時間膠囊與加密抽屜', group: '面板', keys: ['Mod+Alt+V'], run: () => a.openPanel('vault') },
    { id: 'doc.milestone', title: '標記目前版本為里程碑…', group: '檔案', run: a.milestone },
    { id: 'panel.diag', title: '文件健檢、排版與文風', group: '面板', keys: ['Mod+Alt+K'], run: () => a.openPanel('diag') },
    { id: 'panel.clips', title: '剪貼簿收集', group: '面板', keys: ['Mod+Alt+B'], run: () => a.openPanel('clips') },
    { id: 'view.lens', title: '讀者視角（標出未解釋的縮寫與跳躍的轉折）', group: '檢視', keys: ['Mod+Alt+X'], run: a.toggleLens },
    { id: 'view.weight', title: '顯示／隱藏段落權重', group: '檢視', keys: ['Mod+Alt+W'], run: a.toggleWeight },
    { id: 'doc.speak', title: '朗讀校對（選取處或從游標開始）', group: '檔案', keys: ['Mod+Alt+Y'], run: a.toggleSpeak },
    { id: 'panel.links', title: '連結與反向連結', group: '面板', keys: ['Mod+Alt+L'], run: () => a.openPanel('links') },
    { id: 'app.about', title: '關於 Flowiter／說明與回饋', group: '檢視', run: () => a.openPanel('about') },
    { id: 'app.checkUpdate', title: '檢查更新', group: '檢視', run: a.checkUpdate },
    { id: 'app.settings', title: '偏好設定', group: '檢視', keys: ['Mod+Comma'], run: a.openSettings },

    // 編輯
    { id: 'edit.cut', title: '剪下', group: '編輯', run: () => a.editRole('cut') },
    { id: 'edit.copy', title: '複製', group: '編輯', run: () => a.editRole('copy') },
    { id: 'edit.paste', title: '貼上', group: '編輯', run: () => a.editRole('paste') },
    { id: 'edit.selectAll', title: '全選', group: '編輯', run: () => a.editRole('selectAll') },
    { id: 'edit.lock', title: '鎖定／解鎖游標所在段落', group: '編輯', keys: ['Mod+Alt+Q'], editorOnly: true, run: a.toggleLock },
    { id: 'inbox.capture', title: '快速收集到收件匣…', group: '檔案', run: a.inboxCapture },
    { id: 'inbox.open', title: '開啟收件匣檔案', group: '檔案', run: a.inboxOpen },
    { id: 'app.quit', title: '結束', group: '檔案', run: a.quit },
    { id: 'edit.undo', title: '復原', group: '編輯', editorOnly: true, run: fmt('undo') },
    { id: 'edit.redo', title: '重做', group: '編輯', editorOnly: true, run: fmt('redo') },

    // 格式（Typora 慣用鍵位）
    { id: 'fmt.strong', title: '粗體', group: F, keys: ['Mod+B'], editorOnly: true, run: fmt('strong') },
    { id: 'fmt.em', title: '斜體', group: F, keys: ['Mod+I'], editorOnly: true, run: fmt('em') },
    { id: 'fmt.strike', title: '刪除線', group: F, keys: ['Alt+Shift+5'], editorOnly: true, run: fmt('strike') },
    { id: 'fmt.code', title: '行內代碼', group: F, keys: ['Mod+Shift+Backquote'], editorOnly: true, run: fmt('code') },
    { id: 'fmt.link', title: '插入連結', group: F, keys: ['Mod+K'], editorOnly: true, run: fmt('link') },
    { id: 'fmt.h1', title: '標題 1', group: F, keys: ['Mod+1'], editorOnly: true, run: fmt('h1') },
    { id: 'fmt.h2', title: '標題 2', group: F, keys: ['Mod+2'], editorOnly: true, run: fmt('h2') },
    { id: 'fmt.h3', title: '標題 3', group: F, keys: ['Mod+3'], editorOnly: true, run: fmt('h3') },
    { id: 'fmt.h4', title: '標題 4', group: F, keys: ['Mod+4'], editorOnly: true, run: fmt('h4') },
    { id: 'fmt.h5', title: '標題 5', group: F, keys: ['Mod+5'], editorOnly: true, run: fmt('h5') },
    { id: 'fmt.h6', title: '標題 6', group: F, keys: ['Mod+6'], editorOnly: true, run: fmt('h6') },
    { id: 'fmt.p', title: '正文段落', group: F, keys: ['Mod+0'], editorOnly: true, run: fmt('p') },
    { id: 'fmt.quote', title: '引用', group: F, keys: ['Mod+Shift+Q'], editorOnly: true, run: fmt('quote') },
    { id: 'fmt.ul', title: '無序列表', group: F, keys: ['Mod+Shift+BracketLeft'], editorOnly: true, run: fmt('ul') },
    { id: 'fmt.ol', title: '有序列表', group: F, keys: ['Mod+Shift+BracketRight'], editorOnly: true, run: fmt('ol') },
    { id: 'fmt.task', title: '任務列表', group: F, editorOnly: true, run: fmt('task') },
    { id: 'fmt.codeblock', title: '代碼塊', group: F, keys: ['Mod+Shift+K'], editorOnly: true, run: fmt('codeblock') },
    { id: 'fmt.math', title: '數學公式塊', group: F, keys: ['Mod+Shift+M'], editorOnly: true, run: fmt('math') },
    { id: 'fmt.table', title: '插入表格', group: F, keys: ['Mod+T'], editorOnly: true, run: fmt('table') },
    { id: 'fmt.toc', title: '插入目錄 [TOC]', group: F, editorOnly: true, run: fmt('toc') },
    { id: 'fmt.footnote', title: '插入腳註', group: F, keys: ['Mod+Alt+F'], editorOnly: true, run: fmt('footnote') },
    { id: 'table.sortAsc', title: '表格依目前欄位升序排序', group: F, editorOnly: true, run: fmt('sortasc') },
    { id: 'table.sortDesc', title: '表格依目前欄位降序排序', group: F, editorOnly: true, run: fmt('sortdesc') },
    { id: 'fmt.bilingual', title: '插入雙語對照', group: F, editorOnly: true, run: fmt('bilingual') },
    { id: 'fmt.callout', title: '插入提示框', group: F, editorOnly: true, run: fmt('callout') },
    { id: 'fmt.callout.tip', title: '提示框：提醒', group: F, editorOnly: true, run: fmt('callout:tip') },
    { id: 'fmt.callout.warning', title: '提示框：警告', group: F, editorOnly: true, run: fmt('callout:warning') },
    { id: 'fmt.callout.important', title: '提示框：重點', group: F, editorOnly: true, run: fmt('callout:important') },
    { id: 'fmt.callout.note', title: '提示框：備註', group: F, editorOnly: true, run: fmt('callout:note') },
    { id: 'fmt.callout.summary', title: '提示框：總結', group: F, editorOnly: true, run: fmt('callout:summary') },
    { id: 'fmt.frontmatter.remove', title: '移除前置資料', group: F, editorOnly: true, run: fmt('frontmatter:remove') },
    { id: 'fmt.frontmatter', title: '插入 YAML 前置資料', group: F, editorOnly: true, run: fmt('frontmatter') },
    { id: 'fmt.hr', title: '分隔線', group: F, editorOnly: true, run: fmt('hr') }
  ]
}
