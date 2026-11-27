/**
 * 擴充行內語法（Typora 風格）：
 *   ==螢光標記==   ^上標^   ~下標~   :emoji:
 * 做法與 {{算式}} 相同：解析時換成行內 html 節點，儲存時原樣寫回，所以 .md 永遠是原本的語法；
 * 畫面上用裝飾上樣式（不改文件內容）。
 */
type Node = { type: string; value?: string; children?: Node[] }

export const EMOJI: Record<string, string> = {
  smile: '😄', grin: '😁', joy: '😂', laughing: '😆', wink: '😉', blush: '😊', heart_eyes: '😍', sunglasses: '😎', thinking: '🤔', cry: '😢', sob: '😭',
  angry: '😠', scream: '😱', sleeping: '😴', neutral_face: '😐', confused: '😕', sweat_smile: '😅', relaxed: '☺️', innocent: '😇', rocket: '🚀',
  heart: '❤️', broken_heart: '💔', star: '⭐', sparkles: '✨', fire: '🔥', zap: '⚡', boom: '💥', tada: '🎉', party: '🥳', gift: '🎁',
  '+1': '👍', thumbsup: '👍', '-1': '👎', thumbsdown: '👎', clap: '👏', pray: '🙏', ok_hand: '👌', wave: '👋', muscle: '💪', eyes: '👀',
  check: '✔️', white_check_mark: '✅', x: '❌', warning: '⚠️', question: '❓', exclamation: '❗', bulb: '💡', memo: '📝', book: '📖', books: '📚',
  pencil: '✏️', pushpin: '📌', paperclip: '📎', link: '🔗', lock: '🔒', key: '🔑', bell: '🔔', calendar: '📅', clock: '🕒', hourglass: '⌛',
  sun: '☀️', moon: '🌙', cloud: '☁️', rain: '🌧️', snowflake: '❄️', rainbow: '🌈', tree: '🌲', flower: '🌸', coffee: '☕', pizza: '🍕',
  computer: '💻', phone: '📱', email: '📧', bug: '🐛', trophy: '🏆', medal: '🏅', chart: '📈', target: '🎯', dart: '🎯', globe: '🌍'
}

const RE = /==([^=\n](?:[^\n]*?[^=\n])?)==(?!=)|\^([^\s^\[\]]+)\^|(?<!~)~([^\s~\[\]]+)~(?!~)|:([a-z0-9_+-]{1,24}):/g

/** 這段 html 節點的內容是哪一種擴充語法；不是回 null。 */
export function extKind(value: string): 'mark' | 'sup' | 'sub' | 'emoji' | null {
  if (/^==[^=\n](?:[^\n]*?[^=\n])?==$/.test(value)) return 'mark'
  if (/^\^[^\s^\[\]]+\^$/.test(value)) return 'sup'
  if (/^~[^\s~\[\]]+~$/.test(value)) return 'sub'
  const m = /^:([a-z0-9_+-]{1,24}):$/.exec(value)
  if (m && EMOJI[m[1]]) return 'emoji'
  return null
}

export function inlineExtTransform(tree: Node): number {
  let n = 0
  const visit = (node: Node): void => {
    if (!node.children) return
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return
    const out: Node[] = []
    let changed = false
    for (const c of node.children) {
      if (c.type !== 'text' || !/[=^~:]/.test(c.value ?? '')) {
        visit(c)
        out.push(c)
        continue
      }
      const v = c.value as string
      let last = 0
      RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = RE.exec(v))) {
        if (m[4] !== undefined && !EMOJI[m[4]]) continue // 不是已知的表情名稱：維持原文
        if (m.index > last) out.push({ type: 'text', value: v.slice(last, m.index) })
        out.push({ type: 'html', value: m[0] })
        last = m.index + m[0].length
        changed = true
        n++
      }
      if (last < v.length) out.push({ type: 'text', value: v.slice(last) })
      else if (last === 0) out.push(c)
    }
    if (changed) node.children = out
  }
  visit(tree)
  return n
}

/** 匯出 HTML 用：把文字裡的擴充語法換成 <mark>/<sup>/<sub>/表情；略過代碼。 */
export function applyInlineExtDom(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    if (t.parentElement?.closest('pre, code, script, style, .katex, .math')) continue
    if (/[=^~:]/.test(t.data)) targets.push(t)
  }
  for (const t of targets) {
    const v = t.data
    const frag = document.createDocumentFragment()
    let last = 0
    let hit = false
    RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RE.exec(v))) {
      const k = extKind(m[0])
      if (!k) continue
      if (m.index > last) frag.append(v.slice(last, m.index))
      if (k === 'emoji') frag.append(EMOJI[m[0].slice(1, -1)])
      else {
        const el = document.createElement(k === 'mark' ? 'mark' : k)
        el.textContent = k === 'mark' ? m[0].slice(2, -2) : m[0].slice(1, -1)
        frag.append(el)
      }
      last = m.index + m[0].length
      hit = true
    }
    if (!hit) continue
    if (last < v.length) frag.append(v.slice(last))
    t.replaceWith(frag)
  }
}
