import type { Edit } from './abcEdit'

export type JianpuTool = 'octUp' | 'octDown' | 'dot' | 'eighth' | 'sixteenth' | 'dash' | 'slur' | 'tuplet' | 'func'

const TOKEN = /^([0-7])('*|,*)(\.?)([/_]{0,2})$/

/** 在游標處插入文字；前面緊貼著非空白字元時先補一個空白，免得和前一個音黏在一起。 */
function insertAt(text: string, pos: number, s: string): Edit {
  const prev = text[pos - 1]
  const pad = prev !== undefined && prev !== ' ' && prev !== '\n' && prev !== '\t' && prev !== '(' && prev !== '[' ? ' ' : ''
  return { from: pos, to: pos, insert: pad + s }
}

function rebuild(d: string, oct: string, dot: string, red: string): string {
  return d + oct + dot + red
}

/** 工具列對簡譜原始碼的編輯（純函式）。回傳 insert 為空且 from===to 代表「不需要改」。 */
export function jianpuEdit(tool: JianpuTool, text: string, from: number, to: number): Edit {
  const sel = text.slice(from, to)
  const tok = TOKEN.exec(sel)
  const noop: Edit = { from, to: from, insert: '' }
  switch (tool) {
    case 'octUp':
    case 'octDown': {
      if (tok && tok[1] !== '0') {
        const hi = tok[2].startsWith("'") ? tok[2].length : 0
        const lo = tok[2].startsWith(',') ? tok[2].length : 0
        const net = tool === 'octUp' ? hi - lo + 1 : hi - lo - 1
        const oct = net > 0 ? "'".repeat(net) : ','.repeat(-net)
        return { from, to, insert: rebuild(tok[1], oct, tok[3], tok[4]) }
      }
      return insertAt(text, to, tool === 'octUp' ? "1'" : '1,')
    }
    case 'dot':
      if (tok) return tok[3] ? noop : { from, to, insert: rebuild(tok[1], tok[2], '.', tok[4]) }
      return insertAt(text, to, '5.')
    case 'eighth':
      if (tok) return { from, to, insert: rebuild(tok[1], tok[2], tok[3], '/') }
      return insertAt(text, to, '1/')
    case 'sixteenth':
      if (tok) return { from, to, insert: rebuild(tok[1], tok[2], tok[3], '//') }
      return insertAt(text, to, '1//')
    case 'dash':
      return { from: to, to, insert: ' -' }
    case 'slur':
      return sel ? { from, to, insert: `(${sel})` } : insertAt(text, to, '(1 2 3)')
    case 'tuplet':
      return insertAt(text, to, '(3: 1 2 3)')
    case 'func': {
      if (/^\s*func:/m.test(text)) return noop
      const eol = text.indexOf('\n')
      const at = eol < 0 ? text.length : eol
      return { from: at, to: at, insert: '\nfunc: T' }
    }
  }
}
