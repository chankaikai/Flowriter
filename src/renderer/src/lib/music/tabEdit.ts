import type { Edit } from './abcEdit'

/** 六線譜（alphaTex）工具列：只回傳文字編輯。 */
export type TabTool = 'tuning' | 'bar' | 'rest' | 'dur8' | 'chord' | 'tie'

const TUNING = '\\tuning E4 B3 G3 D3 A2 E2'

export function tabEdit(tool: TabTool, text: string, from: number, to: number): Edit {
  const sel = text.slice(from, to)
  switch (tool) {
    case 'tuning': {
      if (/^\s*\\tuning\b/m.test(text)) return { from: 0, to: 0, insert: '' }
      // alphaTex 的 metadata 要寫在最前面，並以單獨一個點結束
      const hasDot = /^\s*\.\s*$/m.test(text)
      return { from: 0, to: 0, insert: `${TUNING}\n${hasDot ? '' : '.\n'}` }
    }
    case 'bar': return { from: to, to, insert: ' | ' }
    case 'rest': return { from: to, to, insert: 'r.4 ' }
    case 'dur8': return { from: to, to, insert: ':8 ' }
    case 'chord': return sel ? { from, to, insert: `(${sel.trim()})` } : { from: to, to, insert: '(0.3 2.2) ' }
    case 'tie': return { from: to, to, insert: '-.3 ' }
  }
}

/**
 * 渲染前補預設調弦（只改給 alphaTab 的副本，不動文件）：
 * 沒有 \tuning／\instrument／\staff 時，fret.string 寫法無法算音高，補標準吉他調弦。
 */
export function withDefaultTuning(source: string): string {
  if (/^\s*\\(tuning|instrument|staff)\b/m.test(source)) return source
  const hasMeta = /^\s*\\\w+/m.test(source)
  const hasDot = /^\s*\.\s*$/m.test(source)
  return `${TUNING}\n${hasMeta || hasDot ? '' : '.\n'}${source}`
}
