/** 超過此字元數視為大型文件：延後建立編輯器以顯示載入提示，並啟用離屏區塊跳過渲染 */
export const LARGE_DOC = 150_000

export interface OutlineItem {
  level: number
  text: string
  line: number
}

/** 解析標題大綱（略過 YAML front matter 與圍欄代碼塊）。 */
export function parseOutline(md: string): OutlineItem[] {
  const out: OutlineItem[] = []
  const lines = md.split(/\r?\n/)
  let i = 0
  if (lines[0]?.trim() === '---') {
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === '---' || lines[j].trim() === '...') {
        i = j + 1
        break
      }
    }
  }
  let fence: string | null = null
  for (; i < lines.length; i++) {
    const line = lines[i]
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      continue
    }
    if (fence) continue
    const m = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const text = m[2]
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (text) out.push({ level: m[1].length, text, line: i })
  }
  return out
}

export interface DocStats {
  chars: number
  words: number
  minutes: number
}

const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/g

/** 字數 = 中日韓字元數 + 西文單詞數；閱讀時間以中文約 400 字、英文約 230 詞每分鐘估算。 */
export function computeStats(md: string): DocStats {
  const cjk = (md.match(CJK) || []).length
  const latin = (md.replace(CJK, ' ').match(/[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9]+)*/g) || [])
    .length
  const words = cjk + latin
  const minutes = cjk / 400 + latin / 230
  return { chars: md.replace(/\s/g, '').length, words, minutes }
}

export function fuzzyScore(query: string, text: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  const idx = t.indexOf(q)
  if (idx !== -1) return 1000 - idx - t.length * 0.1
  let qi = 0
  let score = 0
  let streak = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      streak++
      score += 1 + streak
    } else streak = 0
  }
  return qi === q.length ? score : -1
}

/** 標題 index 對應的整段範圍（含子標題）：[起始行, 結束行)。 */
export function sectionRange(md: string, items: OutlineItem[], index: number): [number, number] {
  const total = md.split(/\r?\n/).length
  const it = items[index]
  let end = total
  for (let j = index + 1; j < items.length; j++) {
    if (items[j].level <= it.level) {
      end = items[j].line
      break
    }
  }
  return [it.line, end]
}

/**
 * 把第 from 個標題的整段（含子標題）搬到第 to 個標題「之前」；to === items.length 表示搬到文末。
 * 目標落在來源段落內部時回傳 null。
 */
export function moveSection(md: string, from: number, to: number): string | null {
  const items = parseOutline(md)
  if (from < 0 || from >= items.length || to < 0 || to > items.length) return null
  const [a, b] = sectionRange(md, items, from)
  const lines = md.split(/\r?\n/)
  const dest = to === items.length ? lines.length : items[to].line
  if (dest >= a && dest <= b) return null
  const block = lines.slice(a, b)
  const rest = [...lines.slice(0, a), ...lines.slice(b)]
  let at = dest > b ? dest - (b - a) : dest
  // 搬到文末時確保與前一段之間有空行
  if (to === items.length) {
    if (rest.length && rest[rest.length - 1].trim() !== '') rest.push('')
    at = rest.length
  }
  rest.splice(at, 0, ...block)
  return rest.join('\n')
}
