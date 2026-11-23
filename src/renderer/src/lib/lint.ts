/**
 * 排版檢查（可自動修正）與文風診斷（只提示）。純函式，只看文字，不動編輯器。
 * 會略過：front matter、程式碼區塊、數學區塊、行內程式碼、連結網址、HTML 標籤。
 */
export interface Issue {
  rule: string
  level: 'error' | 'warn' | 'info'
  /** 0 起算的行號 */
  line: number
  col: number
  len: number
  message: string
  /** 取代 [col, col+len) 的文字；沒有這個欄位就不能自動修正 */
  fix?: string
  /** 供跳轉用的原文片段 */
  snippet: string
}

const CJK = '\\u3400-\\u4dbf\\u4e00-\\u9fff'
const MASK = '\u0001'

/** 每行是否為正文（排除 front matter、圍欄、數學區塊），並回傳遮蔽了行內程式碼 / 網址 / 標籤的版本（長度不變）。 */
export function maskedLines(md: string): { raw: string; text: string | null }[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: { raw: string; text: string | null }[] = []
  let fence: string | null = null
  let math = false
  let i = 0
  if (lines[0]?.trim() === '---') {
    for (let j = 1; j < lines.length; j++) {
      if (lines[j].trim() === '---' || lines[j].trim() === '...') {
        i = j + 1
        break
      }
    }
    for (let k = 0; k < i; k++) out.push({ raw: lines[k], text: null })
  }
  for (; i < lines.length; i++) {
    const raw = lines[i]
    const f = /^\s*(`{3,}|~{3,})/.exec(raw)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      out.push({ raw, text: null })
      continue
    }
    if (fence) {
      out.push({ raw, text: null })
      continue
    }
    if (/^\s*\$\$/.test(raw)) {
      const single = /^\s*\$\$.+\$\$\s*$/.test(raw)
      if (!single) math = !math
      out.push({ raw, text: null })
      continue
    }
    if (math || /^\s*\|?\s*:?-{2,}/.test(raw)) {
      out.push({ raw, text: null })
      continue
    }
    const m = (s: string) => MASK.repeat(s.length)
    const text = raw
      .replace(/`[^`\n]*`/g, m)
      .replace(/\]\([^)\n]*\)/g, m)
      .replace(/https?:\/\/[^\s)>\]]+/g, m)
      .replace(/<[^>\n]+>/g, m)
      .replace(/\$[^$\n]+\$/g, m)
      .replace(/\{\{[^{}\n]+\}\}/g, m)
      .replace(/\[\^[^\]\n]+\]/g, m)
    out.push({ raw, text })
  }
  return out
}

const HALF_TO_FULL: Record<string, string> = { ',': '，', ';': '；', ':': '：', '!': '！', '?': '？', '.': '。' }
const EXEMPT_AFTER_DIGIT = '年月日号號時时分秒個个次元块塊%'

export function typographyIssues(md: string): Issue[] {
  const out: Issue[] = []
  maskedLines(md).forEach(({ raw, text }, line) => {
    if (text == null) return
    const push = (rule: string, level: Issue['level'], col: number, len: number, message: string, fix?: string) =>
      out.push({ rule, level, line, col, len, message, fix, snippet: raw.slice(Math.max(0, col - 6), col + len + 6) })

    // 中英文 / 數字之間補空格
    const a = new RegExp(`([${CJK}])([A-Za-z0-9])`, 'g')
    for (let m = a.exec(text); m; m = a.exec(text)) {
      if (/\d/.test(m[2]) && m[1] === '第') continue
      push('cjk-space', 'info', m.index + 1, 0, '中文與英文／數字之間建議留一個空格', ' ')
      a.lastIndex = m.index + 1
    }
    const b = new RegExp(`([A-Za-z0-9])([${CJK}])`, 'g')
    for (let m = b.exec(text); m; m = b.exec(text)) {
      if (/\d/.test(m[1]) && (EXEMPT_AFTER_DIGIT.includes(m[2]) || text[m.index - 1] === '第')) continue
      push('cjk-space', 'info', m.index + 1, 0, '中文與英文／數字之間建議留一個空格', ' ')
      b.lastIndex = m.index + 1
    }
    // 中文後面接半形標點
    const h = new RegExp(`([${CJK}])([,;:!?]|\\.(?=\\s|$))`, 'g')
    for (let m = h.exec(text); m; m = h.exec(text)) {
      push('half-punct', 'warn', m.index + 1, 1, `中文句子裡的「${m[2]}」應該用全形「${HALF_TO_FULL[m[2]]}」`, HALF_TO_FULL[m[2]])
      h.lastIndex = m.index + 1
    }
    // 重複標點
    const d = /([，。；：、！？])\1+/g
    for (let m = d.exec(text); m; m = d.exec(text)) {
      push('dup-punct', 'warn', m.index, m[0].length, `標點重複：「${m[0]}」`, m[1])
    }
    const dots = /。{3,}/g
    for (let m = dots.exec(text); m; m = dots.exec(text)) {
      push('dup-punct', 'warn', m.index, m[0].length, '「。。。」應寫成省略號「……」', '……')
    }
    // 連續空格（不含行首縮排、行尾的換行用空格、表格）
    if (!/^\s*\|/.test(raw)) {
      const s = /(?<=\S) {2,}(?=\S)/g
      for (let m = s.exec(text); m; m = s.exec(text)) push('multi-space', 'info', m.index, m[0].length, '連續空格', ' ')
    }
    // 括號 / 引號配對
    for (const [o, c] of [['「', '」'], ['『', '』'], ['（', '）'], ['“', '”']] as const) {
      const no = text.split(o).length - 1
      const nc = text.split(c).length - 1
      if (no !== nc) push('pair', 'warn', Math.max(0, text.indexOf(no > nc ? o : c)), 1, `「${o}${c}」沒有成對（${no} 個開、${nc} 個關）`)
    }
    // 中文裡的直引號
    const q = new RegExp(`([${CJK}])"|"([${CJK}])`)
    const qm = q.exec(text)
    if (qm) push('ascii-quote', 'info', qm.index, 2, '中文裡建議用「」或“”，不要用直引號 "')
  })
  return out
}

/** 套用所有可自動修正的項目（同一行由右往左改，位置才不會跑掉）。 */
export function applyFixes(md: string, issues: Issue[]): { md: string; count: number } {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const byLine = new Map<number, Issue[]>()
  for (const it of issues) if (it.fix !== undefined) byLine.set(it.line, [...(byLine.get(it.line) ?? []), it])
  let count = 0
  for (const [ln, list] of byLine) {
    list.sort((x, y) => y.col - x.col)
    let s = lines[ln]
    let lastCol = Infinity
    for (const it of list) {
      if (it.col + it.len > lastCol) continue // 與右邊已改的重疊，跳過
      s = s.slice(0, it.col) + it.fix + s.slice(it.col + it.len)
      lastCol = it.col
      count++
    }
    lines[ln] = s
  }
  return { md: lines.join('\n'), count }
}

/* ------------------------------ 文風診斷（只提示，不改文字） ------------------------------ */

const FILLERS_ZH = ['非常', '十分', '極其', '极其', '真的', '其實', '其实', '然後', '然后', '就是', '可能', '也許', '也许', '大概', '比較', '比较', '一定程度上', '某種程度', '某种程度']
const STOP_CH = '的了是在和有不也就都與与及或但而被把將将對对從从為为這这那其之於于'

const sentencesOf = (t: string) => t.split(/(?<=[。！？；!?;])/).map((s) => s.trim()).filter(Boolean)

export function styleIssues(md: string): Issue[] {
  const out: Issue[] = []
  // 以空白行分段，記住起始行
  const lines = maskedLines(md)
  let start = -1
  let buf: string[] = []
  const flush = () => {
    if (start >= 0 && buf.length) analyze(buf.join(''), start)
    start = -1
    buf = []
  }
  const push = (rule: string, level: Issue['level'], line: number, message: string, snippet: string) =>
    out.push({ rule, level, line, col: 0, len: 0, message, snippet: snippet.slice(0, 24) })

  const analyze = (para: string, line: number) => {
    const text = para.replace(/\u0001/g, '')
    const cjk = (text.match(new RegExp(`[${CJK}]`, 'g')) || []).length
    const zh = cjk / Math.max(1, text.replace(/\s/g, '').length) > 0.3
    const sents = sentencesOf(text)
    if (zh) {
      for (const s of sents) {
        const n = s.replace(/\s/g, '').length
        if (n > 70) push('long-sentence', 'warn', line, `這句有 ${n} 字，讀起來會喘，考慮拆開`, s)
      }
      if (cjk >= 60) {
        const de = (text.match(/的/g) || []).length / cjk
        if (de > 0.07) push('de-density', 'info', line, `「的」佔 ${(de * 100).toFixed(1)}%，偏多，試著刪掉幾個`, text)
      }
      for (let i = 0; i + 2 < sents.length; i++) {
        const h = sents.slice(i, i + 3).map((s) => s.slice(0, 2))
        if (h[0].length === 2 && h[0] === h[1] && h[1] === h[2]) {
          push('same-start', 'info', line, `連續三句都以「${h[0]}」開頭`, sents[i])
          break
        }
      }
      const found = FILLERS_ZH.map((w) => [w, text.split(w).length - 1] as const).filter(([, n]) => n > 0)
      const total = found.reduce((a, [, n]) => a + n, 0)
      if (found.some(([, n]) => n >= 3) || total >= 5) {
        push('filler', 'info', line, `弱化詞偏多：${found.map(([w, n]) => `${w}×${n}`).join('、')}`, text)
      }
      if (cjk >= 100) {
        const grams = new Map<string, number>()
        const only = text.replace(new RegExp(`[^${CJK}]`, 'g'), '|')
        for (let i = 0; i + 1 < only.length; i++) {
          const g = only.slice(i, i + 2)
          if (g.includes('|') || STOP_CH.includes(g[0]) || STOP_CH.includes(g[1])) continue
          grams.set(g, (grams.get(g) ?? 0) + 1)
        }
        const top = [...grams.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1])[0]
        if (top) push('repeat-word', 'info', line, `「${top[0]}」在這段出現 ${top[1]} 次，換個說法會更順`, text)
      }
    } else {
      const words = text.split(/\s+/).filter(Boolean)
      for (const s of sents) {
        const n = s.split(/\s+/).length
        if (n > 40) push('long-sentence', 'warn', line, `This sentence has ${n} words; consider splitting it`, s)
      }
      const passive = (text.match(/\b(?:was|were|been|being|is|are|be)\s+\w+ed\b/gi) || []).length
      if (passive >= 3) push('passive', 'info', line, `Passive voice ×${passive}`, text)
      const ly = (text.match(/\b\w+ly\b/gi) || []).length
      if (words.length >= 50 && ly / words.length > 0.05) push('adverbs', 'info', line, `Adverbs ${(100 * ly / words.length).toFixed(0)}% of words`, text)
      const fill = (text.match(/\b(?:very|really|just|actually|basically|quite|simply)\b/gi) || []).length
      if (fill >= 3) push('filler', 'info', line, `Filler words ×${fill} (very/really/just…)`, text)
    }
  }

  lines.forEach(({ raw, text }, i) => {
    const isBody = text != null && raw.trim() !== '' && !/^\s*(#{1,6}\s|>|[-*+]\s|\d+[.)]\s|\|)/.test(raw)
    if (isBody) {
      if (start < 0) start = i
      buf.push(text!)
    } else flush()
  })
  flush()
  return out
}
