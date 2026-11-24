import { $prose } from '@milkdown/kit/utils'
import { Plugin } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import type { Node as PMNode, ResolvedPos } from '@milkdown/kit/prose/model'
import {
  CellSelection,
  TableMap,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  deleteTable
} from '@milkdown/kit/prose/tables'

/**
 * 表格工具列：游標在表格裡時，浮在表格上方；在表格上按右鍵會在滑鼠位置展開同一組按鈕。
 * 功能：上／下插入行、左／右插入列、刪除行／列／整個表格、選取本行／本列、本列對齊（左／中／右）。
 * 全部透過 ProseMirror Transaction 修改文件，可以復原；不會碰到表格以外的內容。
 * 名詞：行＝橫向（row），列＝縱向（column）。
 */

interface Ctx {
  table: PMNode
  tablePos: number // 表格節點起點
  cellPos: number // 目前儲存格節點起點
  rowIndex: number
  colIndex: number
}

function tableCtx($from: ResolvedPos): Ctx | null {
  let cellDepth = -1
  let tableDepth = -1
  for (let d = $from.depth; d >= 0; d--) {
    const role = $from.node(d).type.spec.tableRole as string | undefined
    if (cellDepth < 0 && (role === 'cell' || role === 'header_cell')) cellDepth = d
    if (role === 'table') {
      tableDepth = d
      break
    }
  }
  if (cellDepth < 0 || tableDepth < 0) return null
  const table = $from.node(tableDepth)
  const tablePos = $from.before(tableDepth)
  const cellPos = $from.before(cellDepth)
  const map = TableMap.get(table)
  const rel = cellPos - (tablePos + 1)
  const idx = map.map.indexOf(rel)
  if (idx < 0) return null
  return { table, tablePos, cellPos, rowIndex: Math.floor(idx / map.width), colIndex: idx % map.width }
}

type Action = { label: string; title: string; run: (v: EditorView, c: Ctx) => void }

function setColumnAlign(v: EditorView, c: Ctx, alignment: 'left' | 'center' | 'right'): void {
  const map = TableMap.get(c.table)
  const start = c.tablePos + 1
  let tr = v.state.tr
  for (let r = 0; r < map.height; r++) {
    const off = map.map[r * map.width + c.colIndex]
    const node = c.table.nodeAt(off)
    if (node) tr = tr.setNodeMarkup(start + off, undefined, { ...node.attrs, alignment })
  }
  v.dispatch(tr)
}

const run1 = (fn: (s: EditorView['state'], d?: EditorView['dispatch']) => boolean) => (v: EditorView) => {
  fn(v.state, v.dispatch)
}

const ACTIONS: (Action | 'sep')[] = [
  { label: '↑＋行', title: '在上方插入一行', run: run1(addRowBefore) },
  { label: '↓＋行', title: '在下方插入一行', run: run1(addRowAfter) },
  { label: '←＋列', title: '在左側插入一列', run: run1(addColumnBefore) },
  { label: '→＋列', title: '在右側插入一列', run: run1(addColumnAfter) },
  'sep',
  { label: '選本行', title: '選取目前這一行（可接著按刪除）', run: (v, c) => v.dispatch(v.state.tr.setSelection(CellSelection.rowSelection(v.state.doc.resolve(c.cellPos)))) },
  { label: '選本列', title: '選取目前這一列（可接著按刪除）', run: (v, c) => v.dispatch(v.state.tr.setSelection(CellSelection.colSelection(v.state.doc.resolve(c.cellPos)))) },
  { label: '刪行', title: '刪除目前選取的行（沒有選取就刪游標所在的行）', run: run1(deleteRow) },
  { label: '刪列', title: '刪除目前選取的列（沒有選取就刪游標所在的列）', run: run1(deleteColumn) },
  { label: '刪表格', title: '刪除整個表格（可按 Ctrl+Z 復原）', run: run1(deleteTable) },
  'sep',
  { label: '靠左', title: '本列內容靠左', run: (v, c) => setColumnAlign(v, c, 'left') },
  { label: '置中', title: '本列內容置中', run: (v, c) => setColumnAlign(v, c, 'center') },
  { label: '靠右', title: '本列內容靠右', run: (v, c) => setColumnAlign(v, c, 'right') }
]

export const tableUiPlugin = $prose(
  () =>
    new Plugin({
      view(v) {
        const bar = document.createElement('div')
        bar.className = 'tb-bar'
        bar.style.display = 'none'
        document.body.appendChild(bar)
        let raf = 0
        let pinned: { x: number; y: number } | null = null // 右鍵時固定在滑鼠位置

        for (const a of ACTIONS) {
          if (a === 'sep') {
            const s = document.createElement('i')
            s.className = 'tb-sep'
            bar.appendChild(s)
            continue
          }
          const b = document.createElement('button')
          b.textContent = a.label
          b.title = a.title
          b.addEventListener('mousedown', (e) => e.preventDefault()) // 不搶走編輯器焦點與選取
          b.addEventListener('click', () => {
            if (v.isDestroyed) return
            const c = tableCtx(v.state.selection.$from)
            if (!c) return
            try {
              a.run(v, c)
            } catch {
              /* 表格結構不允許這個操作（例如只剩最後一行）時忽略 */
            }
            pinned = null
            v.focus()
            schedule()
          })
          bar.appendChild(b)
        }

        const render = () => {
          raf = 0
          if (v.isDestroyed || !v.hasFocus()) {
            // 點到工具列時編輯器短暫失焦，不要立刻收起
            if (!bar.matches(':hover')) bar.style.display = 'none'
            return
          }
          const c = tableCtx(v.state.selection.$from)
          if (!c) {
            bar.style.display = 'none'
            return
          }
          const el = v.nodeDOM(c.tablePos) as HTMLElement | null
          const rect = el?.getBoundingClientRect()
          if (!rect || rect.width === 0) {
            bar.style.display = 'none'
            return
          }
          const scroller = v.dom.closest('.editor-scroll')?.getBoundingClientRect()
          bar.style.display = 'flex'
          const bw = bar.offsetWidth
          let left = pinned ? pinned.x : rect.left
          let top = pinned ? pinned.y : rect.top - bar.offsetHeight - 6
          if (!pinned && scroller && top < scroller.top + 2) top = Math.min(rect.top + 4, scroller.bottom - bar.offsetHeight - 4)
          left = Math.max(8, Math.min(left, window.innerWidth - bw - 8))
          top = Math.max(8, Math.min(top, window.innerHeight - bar.offsetHeight - 8))
          bar.style.left = `${left}px`
          bar.style.top = `${top}px`
        }
        const schedule = () => {
          if (!raf) raf = requestAnimationFrame(render)
        }
        const onCtx = (e: MouseEvent) => {
          const t = e.target as HTMLElement | null
          if (!t || !v.dom.contains(t) || !t.closest('table')) return
          pinned = { x: e.clientX, y: e.clientY }
          schedule()
        }
        const onDown = (e: MouseEvent) => {
          if (e.button === 0 && !bar.contains(e.target as Node)) pinned = null
        }
        v.dom.addEventListener('contextmenu', onCtx)
        window.addEventListener('mousedown', onDown, true)
        window.addEventListener('scroll', schedule, true)
        window.addEventListener('resize', schedule)
        schedule()
        return {
          update: schedule,
          destroy() {
            v.dom.removeEventListener('contextmenu', onCtx)
            window.removeEventListener('mousedown', onDown, true)
            window.removeEventListener('scroll', schedule, true)
            window.removeEventListener('resize', schedule)
            cancelAnimationFrame(raf)
            bar.remove()
          }
        }
      }
    })
)
