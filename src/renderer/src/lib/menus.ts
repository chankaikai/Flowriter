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
      { sub: '匯出', items: [c('export.pdf'), c('export.docx'), c('export.html'), c('export.png'), c('export.md')] },
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
      c('fmt.callout'),
      c('fmt.bilingual'),
      c('fmt.frontmatter')
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
      c('nav.files'),
      c('nav.outline'),
      SEP,
      c('view.source', undefined, 'source'),
      c('view.focus', undefined, 'focus'),
      c('view.typewriter', undefined, 'typewriter'),
      c('view.reading', undefined, 'reading'),
      c('view.sticky', undefined, 'sticky'),
      c('view.weight', undefined, 'weight'),
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
      c('panel.runner'),
      SEP,
      c('panel.clips'),
      c('panel.vault'),
      SEP,
      c('panel.focus'),
      c('panel.dashboard'),
      SEP,
      c('doc.resumeHint'),
      SEP,
      c('app.settings')
    ]
  },
  {
    id: 'help',
    label: '說明',
    items: [c('nav.commands'), c('app.settings', '快捷鍵與偏好設定…')]
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
}
export interface RibbonGroup {
  label: string
  items: RibbonItem[]
}
export interface RibbonTab {
  id: string
  label: string
  groups: RibbonGroup[]
}
const r = (cmd: string, label: string, o: Partial<RibbonItem> = {}): RibbonItem => ({ cmd, label, ...o })

export const RIBBON: RibbonTab[] = [
  {
    id: 'home',
    label: '常用',
    groups: [
      {
        label: '檔案',
        items: [
          r('file.new', '新建', { icon: 'plus', lg: true }),
          r('file.open', '開啟', { icon: 'file', lg: true }),
          r('file.save', '儲存', { icon: 'check', lg: true }),
          r('file.openFolder', '資料夾', { icon: 'folderOpen' })
        ]
      },
      {
        label: '復原',
        items: [r('edit.undo', '復原', { glyph: '↶' }), r('edit.redo', '重做', { glyph: '↷' })]
      },
      {
        label: '字型',
        items: [
          r('fmt.strong', '粗體', { glyph: 'B' }),
          r('fmt.em', '斜體', { glyph: 'I' }),
          r('fmt.strike', '刪除線', { glyph: 'S' }),
          r('fmt.code', '行內代碼', { icon: 'code' })
        ]
      },
      {
        label: '段落',
        items: [
          r('fmt.p', '正文', { glyph: '¶' }),
          r('fmt.h1', '標題 1', { glyph: 'H1' }),
          r('fmt.h2', '標題 2', { glyph: 'H2' }),
          r('fmt.h3', '標題 3', { glyph: 'H3' }),
          r('fmt.quote', '引用', { glyph: '❝' }),
          r('fmt.ul', '無序清單', { glyph: '•≡' }),
          r('fmt.ol', '有序清單', { glyph: '1≡' }),
          r('fmt.task', '任務清單', { icon: 'tasks' })
        ]
      },
      {
        label: '尋找',
        items: [r('nav.find', '查找', { icon: 'search', lg: true }), r('nav.replace', '替換', { icon: 'search' })]
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
          r('fmt.table', '表格', { glyph: '▦', lg: true }),
          r('fmt.codeblock', '代碼塊', { icon: 'code', lg: true }),
          r('fmt.math', '公式', { glyph: '∑', lg: true }),
          r('fmt.callout', '提示框', { glyph: '💡', lg: true })
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
        items: [r('fmt.bilingual', '雙語對照', { glyph: '文A', lg: true }), r('fmt.frontmatter', '前置資料', { glyph: '---', lg: true })]
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
          r('view.fullscreen', '全螢幕', { icon: 'expand', check: 'fullscreen', lg: true })
        ]
      },
      {
        label: '縮放',
        items: [r('view.zoomIn', '放大字體', { glyph: 'A+' }), r('view.zoomOut', '縮小字體', { glyph: 'A−' })]
      },
      {
        label: '導覽',
        items: [r('nav.files', '文件樹', { icon: 'folder' }), r('nav.outline', '大綱', { icon: 'list' }), r('nav.folderSearch', '全域搜尋', { icon: 'search' })]
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
          r('panel.diag', '健檢排版', { icon: 'diag', lg: true }),
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
          r('doc.milestone', '里程碑', { icon: 'flag', lg: true })
        ]
      },
      {
        label: '收集與保護',
        items: [r('panel.clips', '剪貼簿', { icon: 'clip', lg: true }), r('panel.vault', '膠囊抽屜', { icon: 'lock', lg: true })]
      },
      {
        label: '專注',
        items: [
          r('panel.focus', '番茄鐘', { icon: 'timer', lg: true }),
          r('panel.dashboard', '儀表板', { icon: 'chart', lg: true }),
          r('doc.resumeHint', '接續提示', { icon: 'pin', lg: true })
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
