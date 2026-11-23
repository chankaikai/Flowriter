import { useEffect, useMemo, useState } from 'react'
import { applyFixes, styleIssues, typographyIssues, type Issue } from '@/lib/lint'
import { checkImages, healthCheck, type HealthIssue } from '@/lib/health'
import { toAbsolutePath } from '@/lib/path'

type Tab = 'health' | 'typo' | 'style'

/** 診斷結果跳轉用的純文字：去掉 Markdown 標記，取前 40 字。 */
const plain = (s: string) => s.replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '').replace(/[*_`~[\]()#>|]/g, '').trim().slice(0, 40)
const lineText = (md: string, line: number) => plain(md.split(/\r?\n/)[line] ?? '')

const LEVEL: Record<string, string> = { error: '錯誤', warn: '注意', info: '建議' }

export function DiagnosticsPanel({
  md, docDir, onJump, onReplace
}: { md: string; docDir: string | null; onJump(text: string): void; onReplace(md: string): void }) {
  const [tab, setTab] = useState<Tab>('health')
  return (
    <>
      <div className="chips tm-tabs">
        {([['health', '文件健檢'], ['typo', '排版'], ['style', '文風']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'health' && <HealthTab md={md} docDir={docDir} onJump={onJump} />}
      {tab === 'typo' && <TypoTab md={md} onJump={onJump} onReplace={onReplace} />}
      {tab === 'style' && <StyleTab md={md} onJump={onJump} />}
    </>
  )
}

function Row({ level, text, onClick }: { level: string; text: string; onClick(): void }) {
  return (
    <button className={`diag-row lv-${level}`} onClick={onClick}>
      <b>{LEVEL[level]}</b>
      <span>{text}</span>
    </button>
  )
}

export function useHealth(md: string, docDir: string | null): HealthIssue[] | null {
  const [issues, setIssues] = useState<HealthIssue[] | null>(null)
  useEffect(() => {
    let live = true
    setIssues(null)
    const { issues: base, images } = healthCheck(md)
    void checkImages(images, (src) => toAbsolutePath(docDir, src), async (p) => (await window.api.statFile(p)) != null).then((missing) => {
      if (live) setIssues([...missing, ...base].sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.level] - { error: 0, warn: 1, info: 2 }[b.level]) || a.line - b.line))
    })
    return () => {
      live = false
    }
  }, [md, docDir])
  return issues
}

function HealthTab({ md, docDir, onJump }: { md: string; docDir: string | null; onJump(t: string): void }) {
  const issues = useHealth(md, docDir)
  if (!issues) return <p className="pop-empty">檢查中…</p>
  if (!issues.length) return <p className="pop-empty">沒有發現問題，可以放心匯出。</p>
  const n = (l: string) => issues.filter((i) => i.level === l).length
  return (
    <>
      <div className="hist-hint">{n('error')} 個錯誤、{n('warn')} 個注意、{n('info')} 個建議。點一項跳到該處。</div>
      <div className="tm-list">
        {issues.map((i, k) => (
          <Row key={k} level={i.level} text={`第 ${i.line + 1} 行 · ${i.message}`} onClick={() => onJump(plain(i.snippet) || lineText(md, i.line))} />
        ))}
      </div>
    </>
  )
}

function TypoTab({ md, onJump, onReplace }: { md: string; onJump(t: string): void; onReplace(md: string): void }) {
  const issues = useMemo(() => typographyIssues(md), [md])
  const fixable = issues.filter((i) => i.fix !== undefined).length
  if (!issues.length) return <p className="pop-empty">排版沒有問題。</p>
  return (
    <>
      <div className="hist-hint">中英文空格、全半形標點、重複標點、括號配對。程式碼、網址、front matter 不檢查。</div>
      <div className="pop-actions">
        <button className="btn" disabled={!fixable} onClick={() => onReplace(applyFixes(md, issues).md)}>一鍵修正 {fixable} 處</button>
      </div>
      <div className="tm-list">
        {issues.slice(0, 200).map((i: Issue, k) => (
          <Row key={k} level={i.level} text={`第 ${i.line + 1} 行 · ${i.message}${i.fix === undefined ? '（需手動改）' : ''}`} onClick={() => onJump(plain(i.snippet))} />
        ))}
      </div>
    </>
  )
}

function StyleTab({ md, onJump }: { md: string; onJump(t: string): void }) {
  const issues = useMemo(() => styleIssues(md), [md])
  if (!issues.length) return <p className="pop-empty">沒有明顯的文風問題。</p>
  return (
    <>
      <div className="hist-hint">只提示，不會改你的文字。長句、「的」過多、連續同開頭、弱化詞、重複用詞。</div>
      <div className="tm-list">
        {issues.slice(0, 100).map((i, k) => (
          <Row key={k} level={i.level} text={`第 ${i.line + 1} 行 · ${i.message}`} onClick={() => onJump(plain(i.snippet) || lineText(md, i.line))} />
        ))}
      </div>
    </>
  )
}

/* ------------------------------ 剪貼簿收集 ------------------------------ */

export function useClipStack() {
  const [on, setOn] = useState(false)
  const [items, setItems] = useState<string[]>([])
  useEffect(() => {
    if (!on) return
    return window.api.onClip((t) => setItems((l) => [t, ...l.filter((x) => x !== t)].slice(0, 30)))
  }, [on])
  const toggle = () => {
    const next = !on
    void window.api.clipWatch(next)
    setOn(next)
  }
  return {
    on, items, toggle,
    remove: (i: number) => setItems((l) => l.filter((_, k) => k !== i)),
    clear: () => setItems([])
  }
}

export function ClipPanel({ stack, onInsert }: { stack: ReturnType<typeof useClipStack>; onInsert(t: string): void }) {
  return (
    <>
      <div className="hist-hint">
        開啟後，你在任何程式裡複製的文字都會收進來（最多 30 則，只存在記憶體，關閉程式就清掉）。
        複製密碼或機密內容前請先關閉。
      </div>
      <div className="pop-actions">
        <button className={`btn${stack.on ? '' : ' ghost'}`} onClick={stack.toggle}>{stack.on ? '收集中，點擊停止' : '開始收集'}</button>
        <button className="btn ghost" disabled={!stack.items.length} onClick={stack.clear}>清空</button>
      </div>
      <div className="tm-list">
        {stack.items.map((t, i) => (
          <div key={i} className="tm-card">
            <div style={{ whiteSpace: 'pre-wrap', maxHeight: 90, overflow: 'hidden' }}>{t.length > 300 ? t.slice(0, 300) + '…' : t}</div>
            <div className="pop-actions">
              <button className="btn ghost" onClick={() => onInsert(t)}>插入游標處</button>
              <button className="btn ghost" onClick={() => stack.remove(i)}>移除</button>
            </div>
          </div>
        ))}
        {stack.on && !stack.items.length && <p className="pop-empty">等你複製…</p>}
      </div>
    </>
  )
}
