import type { IconName } from '@/components/Icon'
import { THEMES } from './themes'

/** 選單項：以命令 id 為準，標題與快捷鍵都取自命令表，避免兩處不一致。 */
export type MenuItem =
  | { cmd: string; label?: string; check?: string }
  | { sep: true }
  | { sub: string; items: MenuItem[] }

export interface MenuDef {
  id: string
  label: string
  items: MenuItem[]
}

const SEP: MenuItem = { sep: true }
const c = (cmd: string, label?: string, check?: string): MenuItem => ({ cmd, label, check })

export const MENUS: MenuDef[] = [
  {
    id: 'file',
    label: '檔案',
    items: [
      c('file.new'),
      c('file.newWindow'),
      c('file.open'),
      c('file.openFolder'),
      c('nav.recent'),
      c('nav.quickOpen'),
      SEP,
      c('file.save'),
      c('file.saveAs'),
      c('doc.milestone'),
      SEP,
      c('inbox.capture'),
      c('inbox.open'),
      SEP,
      c('file.print'),
      c('image.uploadAll'),
      c('file.git'),
      { sub: '匯出', items: [c('export.pdf'), c('export.docx'), c('export.html'), c('export.png'), c('export.cards'), c('export.cards45'), c('export.cardsPng'), c('export.md')] },
      SEP,
      c('tab.close'),
      c('app.quit')
    ]
  },
  {
    id: 'edit',
    label: '編輯',
    items: [
      c('edit.undo'),
      c('edit.redo'),
      SEP,
      c('edit.cut'),
      c('edit.copy'),
      c('edit.paste'),
      c('edit.selectAll'),
      c('edit.lock'),
      SEP,
      c('nav.find'),
      c('nav.replace'),
      c('nav.folderSearch'),
      SEP,
      c('panel.ai'),
      c('doc.speak'),
      { sub: '表格', items: [c('table.sortAsc'), c('table.sortDesc')] }
    ]
  },
  {
    id: 'insert',
    label: '插入',
    items: [
      c('fmt.table'),
      c('fmt.codeblock'),
      c('fmt.math'),
      c('fmt.link'),
      c('fmt.hr'),
      SEP,
      c('fmt.toc'),
      c('fmt.footnote'),
      c('insert.voice'),
      { sub: '提示框', items: [c('fmt.callout.tip'), c('fmt.callout.warning'), c('fmt.callout.important'), c('fmt.callout.note'), c('fmt.callout.summary'), c('fmt.callout.quote')] },
      c('fmt.bilingual'),
      c('fmt.frontmatter'),
      c('fmt.frontmatter.remove')
    ]
  },
  {
    id: 'format',
    label: '格式',
    items: [
      c('fmt.strong'),
      c('fmt.em'),
      c('fmt.strike'),
      c('fmt.code'),
      SEP,
      {
        sub: '段落樣式',
        items: [c('fmt.p'), c('fmt.h1'), c('fmt.h2'), c('fmt.h3'), c('fmt.h4'), c('fmt.h5'), c('fmt.h6'), c('fmt.quote')]
      },
      { sub: '清單', items: [c('fmt.ul'), c('fmt.ol'), c('fmt.task')] }
    ]
  },
  {
    id: 'view',
    label: '檢視',
    items: [
      c('view.sidebar', undefined, 'sidebar'),
      { sub: '文件樹', items: [c('tree.open', '開啟'), c('tree.close', '關閉'), c('tree.change', '更換資料夾')] },
      c('nav.files'),
      c('nav.outline'),
      c('nav.graph'),
      SEP,
      c('view.source', undefined, 'source'),
      c('view.focus', undefined, 'focus'),
      c('view.typewriter', undefined, 'typewriter'),
      c('view.reading', undefined, 'reading'),
      c('view.sticky', undefined, 'sticky'),
      c('view.weight', undefined, 'weight'),
      c('view.lens', undefined, 'lens'),
      c('view.fullscreen', undefined, 'fullscreen'),
      SEP,
      c('view.zoomIn'),
      c('view.zoomOut'),
      SEP,
      c('tab.next'),
      c('tab.prev'),
      SEP,
      {
        sub: '主題',
        items: [
          c('view.theme'),
          SEP,
          ...THEMES.map((t) => c(`theme.${t.id}`, t.label, `theme:${t.id}`)),
          SEP,
          c('theme.system', '跟隨系統', 'theme:system')
        ]
      }
    ]
  },
  {
    id: 'tools',
    label: '工具',
    items: [
      c('panel.history'),
      c('panel.diag'),
      c('panel.links'),
      c('panel.radar'),
      c('panel.tasks'),
      c('panel.notes'),
      c('panel.refs'),
      c('panel.reverse'),
      c('panel.kb'),
      c('panel.runner'),
      SEP,
      c('panel.clips'),
      c('panel.vault'),
      SEP,
      c('panel.focus'),
      c('panel.ambient'),
      c('panel.dashboard'),
      SEP,
      c('doc.compare'),
      { sub: '接續提示', items: [c('doc.resumeHint', '添加接續提示'), c('panel.resumes', '接續列表')] },
      SEP,
      c('app.settings')
    ]
  },
  {
    id: 'help',
    label: '說明',
    items: [c('nav.commands'), c('app.settings', '快捷鍵與偏好設定…'), SEP, c('app.checkUpdate', '檢查更新…'), c('app.about', '關於 Flowiter／說明與回饋…')]
  }
]

/* ------------------------------ 功能區 ------------------------------ */

export interface RibbonItem {
  cmd: string
  label?: string
  icon?: IconName
  /** 沒有合適圖示時用文字符號 */
  glyph?: string
  check?: string
  /** lg = 大按鈕（圖示在上、文字在下） */
  lg?: boolean
  /** 點擊後展開的二級選單（命令 id 與標籤） */
  sub?: { cmd: string; label: string }[]
  /** 懸浮展開「行列選擇器」（像 Word 的插入表格） */
  grid?: boolean
  /** 精簡模式下的字形樣式（斜體／刪除線） */
  gcls?: 'i' | 's'
  /** 精簡模式下，在這一欄左邊多留一點空隙 */
  gapLeft?: boolean
}
export interface RibbonGroup {
  label: string
  /** 精簡分頁：每列幾欄（預設把按鈕平分成兩列） */
  cols?: number
  items: RibbonItem[]
}
export interface RibbonTab {
  id: string
  label: string
  /** 精簡：只有小圖示、沒有文字、固定兩列，盡量少佔編輯空間 */
  compact?: boolean
  groups: RibbonGroup[]
}
const r = (cmd: string, label: string, o: Partial<RibbonItem> = {}): RibbonItem => ({ cmd, label, ...o })

export const RIBBON: RibbonTab[] = [
  {
    id: 'home',
    label: '常用',
    compact: true,
    groups: [
      {
        label: '檔案',
        cols: 4,
        items: [
          r('file.new', '新建', { icon: 'newDoc' }),
          r('file.open', '開啟', { icon: 'openDoc' }),
          r('file.saveAs', '另存為', { icon: 'saveAs', gapLeft: true }),
          r('file.newWindow', '新視窗', { icon: 'newWindow' }),
          r('file.save', '儲存', { icon: 'save' }),
          r('file.openFolder', '資料夾', { icon: 'folderOpen' }),
          r('tab.close', '分頁', {
            icon: 'tabs',
            gapLeft: true,
            sub: [
              { cmd: 'tab.close', label: '關閉分頁' },
              { cmd: 'tab.next', label: '下一個分頁' },
              { cmd: 'tab.prev', label: '上一個分頁' }
            ]
          }),
          r('inbox.capture', '收件匣', {
            icon: 'inbox',
            sub: [
              { cmd: 'inbox.capture', label: '快速收集到收件匣…' },
              { cmd: 'inbox.open', label: '開啟收件匣檔案' }
            ]
          })
        ]
      },
      {
        label: '復原',
        cols: 1,
        items: [r('edit.undo', '復原', { icon: 'undo' }), r('edit.redo', '重做', { icon: 'redo' })]
      },
      {
        label: '剪貼',
        cols: 2,
        items: [r('edit.cut', '剪下', { icon: 'cut' }), r('edit.copy', '複製', { icon: 'copy' }), r('edit.paste', '貼上', { icon: 'clip' }), r('edit.selectAll', '全選', { icon: 'selectAll' })]
      },
      {
        label: '段落',
        cols: 5,
        items: [
          r('fmt.p', '正文', { glyph: '¶' }),
          r('fmt.h1', '標題 1', { glyph: 'H1' }),
          r('fmt.h2', '標題 2', { glyph: 'H2' }),
          r('fmt.h3', '標題 3', { glyph: 'H3' }),
          r('fmt.h4', '更多標題', { glyph: 'H▾', sub: [{ cmd: 'fmt.h4', label: '標題 4' }, { cmd: 'fmt.h5', label: '標題 5' }, { cmd: 'fmt.h6', label: '標題 6' }] }),
          r('fmt.strong', '粗體', { glyph: 'B' }),
          r('fmt.em', '斜體', { glyph: 'I', gcls: 'i' }),
          r('fmt.strike', '刪除線', { glyph: 'S', gcls: 's' }),
          r('fmt.code', '行內代碼', { icon: 'code' })
        ]
      },
      {
        label: '清單',
        cols: 2,
        items: [r('fmt.quote', '引用', { icon: 'quote' }), r('fmt.ul', '無序清單', { icon: 'ul' }), r('fmt.ol', '有序清單', { icon: 'ol' }), r('fmt.task', '任務清單', { icon: 'tasks' })]
      },
      {
        label: '尋找',
        cols: 1,
        items: [r('nav.find', '查找', { icon: 'search' }), r('nav.replace', '替換', { icon: 'replace' })]
      }
    ]
  },
  {
    id: 'insert',
    label: '插入',
    groups: [
      {
        label: '區塊',
        items: [
          r('fmt.table', '表格', { glyph: '▦', lg: true, grid: true }),
          r('fmt.codeblock', '代碼塊', { icon: 'code', lg: true }),
          r('fmt.math', '公式', { glyph: '∑', lg: true }),
          r('fmt.callout', '提示框', {
            glyph: '💡',
            lg: true,
            sub: [
              { cmd: 'fmt.callout.tip', label: '提醒' },
              { cmd: 'fmt.callout.warning', label: '警告' },
              { cmd: 'fmt.callout.important', label: '重點' },
              { cmd: 'fmt.callout.note', label: '備註' },
              { cmd: 'fmt.callout.summary', label: '總結' },
              { cmd: 'fmt.callout.quote', label: '引言' }
            ]
          })
        ]
      },
      {
        label: '連結與標記',
        items: [
          r('fmt.link', '連結', { icon: 'link', lg: true }),
          r('fmt.footnote', '腳註', { glyph: '①', lg: true }),
          r('fmt.toc', '目錄', { icon: 'list', lg: true }),
          r('fmt.hr', '分隔線', { glyph: '―', lg: true })
        ]
      },
      {
        label: '進階',
        items: [r('fmt.bilingual', '雙語對照', { glyph: '文A', lg: true }), r('fmt.frontmatter', '前置資料', { glyph: '---', lg: true }), r('fmt.frontmatter.remove', '移除前置資料', { glyph: '✕', lg: true }), r('insert.voice', '語音便籤', { glyph: '🎙', lg: true })]
      },
      {
        label: '表格工具',
        items: [r('table.sortAsc', '升序排序', { glyph: 'A↓' }), r('table.sortDesc', '降序排序', { glyph: 'Z↓' })]
      }
    ]
  },
  {
    id: 'view',
    label: '檢視',
    groups: [
      {
        label: '模式',
        items: [
          r('view.source', '源碼', { icon: 'code', check: 'source', lg: true }),
          r('view.focus', '聚焦', { icon: 'focus', check: 'focus', lg: true }),
          r('view.typewriter', '打字機', { icon: 'type', check: 'typewriter', lg: true }),
          r('view.reading', '閱讀', { icon: 'book', check: 'reading', lg: true }),
          r('view.sticky', '迷你便籤', { icon: 'pin', check: 'sticky', lg: true })
        ]
      },
      {
        label: '顯示',
        items: [
          r('view.sidebar', '側邊欄', { icon: 'sidebar', check: 'sidebar', lg: true }),
          r('view.weight', '段落權重', { icon: 'chart', check: 'weight', lg: true }),
          r('view.lens', '讀者視角', { icon: 'user', check: 'lens', lg: true }),
          r('view.fullscreen', '全螢幕', { icon: 'expand', check: 'fullscreen', lg: true })
        ]
      },
      {
        label: '縮放',
        items: [r('view.zoomIn', '放大字體', { glyph: 'A+' }), r('view.zoomOut', '縮小字體', { glyph: 'A−' })]
      },
      {
        label: '導覽',
        items: [
          r('nav.files', '文件樹', {
            icon: 'folder',
            sub: [
              { cmd: 'nav.files', label: '顯示' },
              { cmd: 'tree.open', label: '開啟' },
              { cmd: 'tree.close', label: '關閉' },
              { cmd: 'tree.change', label: '更換資料夾' }
            ]
          }),
          r('nav.outline', '大綱', { icon: 'list' }),
          r('nav.folderSearch', '全域搜尋', { icon: 'search' }),
          r('nav.quickOpen', '快速開啟', { icon: 'file' }),
          r('nav.recent', '最近開啟', { icon: 'history' }),
          r('nav.commands', '命令面板', { icon: 'prompt' })
        ]
      }
    ]
  },
  {
    id: 'look',
    label: '外觀',
    groups: [
      {
        label: '外觀與應用',
        items: [
          r('view.theme', '主題', {
            glyph: '◐',
            lg: true,
            sub: [
              { cmd: 'view.theme', label: '切換到下一個主題' },
              ...THEMES.map((t) => ({ cmd: `theme.${t.id}`, label: t.label })),
              { cmd: 'theme.system', label: '跟隨系統' }
            ]
          }),
          r('app.settings', '偏好設定', { icon: 'gear', lg: true }),
          r('app.about', '說明', {
            icon: 'book',
            lg: true,
            sub: [
              { cmd: 'app.about', label: '關於 Flowiter／說明與回饋' },
              { cmd: 'app.checkUpdate', label: '檢查更新' }
            ]
          }),
          r('app.quit', '結束', { icon: 'close', lg: true })
        ]
      }
    ]
  },
  {
    id: 'tools',
    label: '工具',
    groups: [
      {
        label: '寫作',
        items: [
          r('panel.ai', 'AI 改寫', { icon: 'sparkle', lg: true }),
          r('panel.diag', '排版檢驗', { icon: 'diag', lg: true }),
          r('panel.reverse', '逆向大綱', { icon: 'sparkle', lg: true }),
          r('panel.kb', '知識庫', { icon: 'book', lg: true }),
          r('doc.speak', '朗讀校對', { icon: 'speaker', lg: true }),
          r('panel.runner', '執行代碼塊', { glyph: '▶', lg: true })
        ]
      },
      {
        label: '歷史與整理',
        items: [
          r('panel.history', '時光機', { icon: 'history', lg: true }),
          r('panel.links', '連結', { icon: 'link', lg: true }),
          r('panel.radar', '知識雷達', { icon: 'search', lg: true }),
          r('panel.tasks', '任務', { icon: 'tasks', lg: true }),
          r('panel.notes', '頁邊便條', { icon: 'pen', lg: true }),
          r('panel.refs', '參考抽屜', { icon: 'book', lg: true }),
          r('doc.milestone', '里程碑', { icon: 'flag', lg: true }),
          r('doc.compare', '文件比對', { icon: 'diag', lg: true })
        ]
      },
      {
        label: '收集與保護',
        items: [r('edit.lock', '段落上鎖', { icon: 'lock', lg: true }), r('panel.clips', '剪貼簿', { icon: 'clip', lg: true }), r('panel.vault', '膠囊抽屜', { icon: 'lock', lg: true })]
      },
      {
        label: '專注',
        items: [
          r('panel.focus', '番茄鐘', { icon: 'timer', lg: true }),
          r('panel.ambient', '氛圍音', { glyph: '♪', lg: true }),
          r('panel.dashboard', '儀表板', { icon: 'chart', lg: true }),
          r('doc.resumeHint', '接續提示', {
            icon: 'pin',
            lg: true,
            sub: [
              { cmd: 'doc.resumeHint', label: '添加接續提示' },
              { cmd: 'panel.resumes', label: '接續列表' }
            ]
          })
        ]
      }
    ]
  },
  {
    id: 'export',
    label: '匯出',
    groups: [
      {
        label: '匯出為',
        items: [
          r('export.pdf', 'PDF', { glyph: 'PDF', lg: true }),
          r('export.docx', 'Word', { glyph: 'DOC', lg: true }),
          r('export.html', 'HTML', { glyph: '</>', lg: true }),
          r('export.png', '長圖', { icon: 'image', lg: true }),
          r('export.cards', '輪播圖', {
            icon: 'image',
            lg: true,
            sub: [
              { cmd: 'export.cards', label: '3:4（ZIP）' },
              { cmd: 'export.cards45', label: '4:5（ZIP）' },
              { cmd: 'export.cardsPng', label: '多張 PNG（資料夾）' }
            ]
          }),
          r('export.md', 'Markdown', { glyph: 'MD', lg: true })
        ]
      }
    ]
  }
]

export function collectMenuIds(): Set<string> {
  const ids = new Set<string>()
  const walk = (items: MenuItem[]) => {
    for (const it of items) {
      if ('cmd' in it) ids.add(it.cmd)
      else if ('sub' in it) walk(it.items)
    }
  }
  for (const m of MENUS) walk(m.items)
  for (const t of RIBBON) for (const g of t.groups) for (const i of g.items) ids.add(i.cmd)
  return ids
}
