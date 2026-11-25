import type { Resume } from '@/lib/bookmarks'
import { Icon } from './Icon'
import { tr } from '@/lib/i18n'

interface Props {
  saved: boolean
  /** 由新到舊 */
  items: Resume[]
  onJump(r: Resume): void
  onRemove(id: string): void
  onAdd(): void
}

const fmt = (ts: number) => new Date(ts).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** 接續列表：這份文件所有的接續提示，最新的排最上面（重新打開時就是回到那一筆）。 */
export function ResumePanel({ saved, items, onJump, onRemove, onAdd }: Props) {
  if (!saved) return <div className="side-empty"><p>{tr('先儲存檔案，才能使用接續提示。')}</p></div>
  return (
    <div className="resume-panel">
      <button className="btn" onClick={onAdd}>{tr('在目前位置添加接續提示')}</button>
      {items.length === 0 ? (
        <div className="side-empty"><p>{tr('這份文件還沒有接續提示')}</p></div>
      ) : (
        <ul className="resume-list">
          {items.map((r, i) => (
            <li key={r.id} className={i === 0 ? 'latest' : ''}>
              <button className="resume-main" onClick={() => onJump(r)} title={tr('跳到這個位置')}>
                <span className="resume-hint">{r.hint || '（未填寫提示）'}</span>
                <span className="resume-meta">{fmt(r.ts)}{i === 0 ? ' · 下次打開會回到這裡' : ''}</span>
              </button>
              <button className="resume-del" onClick={() => onRemove(r.id)} title={tr('刪除這筆接續提示')}><Icon name="close" size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
