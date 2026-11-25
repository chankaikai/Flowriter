import type { Edit } from './abcEdit'
import { GONGCHE_CHARS } from './gongche'

/** 工尺譜工具列：id 是 `ch:<譜字>`、`dot`、`octUp`、`bar`。只回傳文字編輯。 */
export type GongcheTool = string

const NOTE = new Set<string>(GONGCHE_CHARS)

/** 找游標之前最近的一個譜字，回傳它後面「八度記號結束」的位置與其八度記號 */
function prevNote(text: string, pos: number): { k: number; j: number; marks: string } | null {
  for (let k = pos - 1; k >= 0; k--) {
    if (text[k] === '\n') return null
    if (NOTE.has(text[k])) {
      let j = k + 1
      while (text[j] === "'" || text[j] === ',') j++
      return { k, j, marks: text.slice(k + 1, j) }
    }
  }
  return null
}

export function gongcheEdit(tool: GongcheTool, text: string, from: number, to: number): Edit {
  if (tool.startsWith('ch:')) return { from: to, to, insert: `${tool.slice(3)} ` }
  if (tool === 'bar') return { from: to, to, insert: ' | ' }
  const p = prevNote(text, from)
  if (!p) return { from: 0, to: 0, insert: '' }
  if (tool === 'dot') {
    if (text[p.j] === '.') return { from: 0, to: 0, insert: '' } // 已經有附點
    return { from: p.j, to: p.j, insert: '.' }
  }
  if (tool === 'octUp') {
    // 已有低八度記號就拿掉一個（淨效果是升高一個八度），避免同字混用 ' 和 ,
    if (p.marks.includes(',')) return { from: p.j - 1, to: p.j, insert: '' }
    return { from: p.j, to: p.j, insert: "'" }
  }
  return { from: 0, to: 0, insert: '' }
}
