/**
 * ABC 工具列的純文字編輯：只回傳「要把 [from, to) 換成什麼」，不碰編輯器。
 * 位置都是代碼塊內文的字元偏移。
 */
export type AbcTool = 'treble' | 'bass' | 'alto' | 'key' | 'meter' | 'slur' | 'tie' | 'triplet' | 'ped' | 'pedUp'

export interface Edit {
  from: number
  to: number
  insert: string
  /** 編輯後選取範圍（偏移，以新文字為準）；不給就把游標放在插入內容之後 */
  select?: [number, number]
}

export const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab', 'F#', 'C#', 'Am', 'Em', 'Bm', 'Dm']
export const METERS = ['2/4', '3/4', '4/4', '6/8', '9/8', '12/8']

const lineBounds = (text: string, pos: number): [number, number] => {
  const s = text.lastIndexOf('\n', pos - 1) + 1
  const e = text.indexOf('\n', pos)
  return [s, e < 0 ? text.length : e]
}

/** 在游標所在行「下面」新增一行；游標行是空行就直接寫在這一行。 */
function insertLine(text: string, pos: number, line: string): Edit {
  const [s, e] = lineBounds(text, pos)
  if (text.slice(s, e).trim() === '') return { from: s, to: e, insert: line }
  return { from: e, to: e, insert: '\n' + line }
}

function cycle(list: string[], cur: string): string {
  const i = list.indexOf(cur)
  return list[(i + 1) % list.length]
}

const NOTE_RE = /[\^_=]*[A-Ga-g][,']*\d*(?:\/\d*)?/g

export function abcEdit(tool: AbcTool, text: string, from: number, to: number): Edit {
  const sel = text.slice(from, to)
  const [ls, le] = lineBounds(text, from)
  const line = text.slice(ls, le)
  switch (tool) {
    case 'treble': return insertLine(text, to, 'V:1 clef=treble name=""')
    case 'bass': return insertLine(text, to, 'V:2 clef=bass name=""')
    case 'alto': return insertLine(text, to, 'V:3 clef=alto name=""')
    case 'key': {
      const m = /^(K:\s*)([A-G][#b]?m?)/.exec(line)
      if (m) {
        const a = ls + m[1].length
        return { from: a, to: a + m[2].length, insert: cycle(KEYS, m[2]) }
      }
      return insertLine(text, to, 'K:C')
    }
    case 'meter': {
      const m = /^(M:\s*)(\S+)/.exec(line)
      if (m) {
        const a = ls + m[1].length
        return { from: a, to: a + m[2].length, insert: cycle(METERS, m[2]) }
      }
      return insertLine(text, to, 'M:4/4')
    }
    case 'slur':
      return sel ? { from, to, insert: `(${sel})` } : { from, to, insert: '( C D E )' }
    case 'tie': {
      if (sel) {
        let last: RegExpExecArray | null = null
        for (const m of sel.matchAll(NOTE_RE)) last = m
        if (last) {
          const at = from + last.index + last[0].length
          return { from: at, to: at, insert: '-' }
        }
      }
      return { from: to, to, insert: '- ' }
    }
    case 'triplet':
      return sel ? { from, to, insert: `(3 ${sel})` } : { from, to, insert: '(3 C D E' }
    case 'ped': return { from: to, to, insert: '!ped!' }
    case 'pedUp': return { from: to, to, insert: '!ped-up!' }
  }
}

export function applyEdit(text: string, e: Edit): string {
  return text.slice(0, e.from) + e.insert + text.slice(e.to)
}
