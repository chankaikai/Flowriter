/** 段落（以空白行分隔，程式碼圍欄內的空行不算分隔）。每段保留原文，不含前後空行。 */
export function splitBlocks(md: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let fence: string | null = null
  const flush = () => {
    if (cur.length) out.push(cur.join('\n'))
    cur = []
  }
  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
    }
    if (!fence && line.trim() === '') flush()
    else cur.push(line)
  }
  flush()
  return out
}

export const joinBlocks = (b: string[]) => b.join('\n\n') + (b.length ? '\n' : '')

export interface Hunk {
  /** same = 兩邊相同；change = 有差異（可只有一邊有內容） */
  kind: 'same' | 'change'
  cur: string[]
  old: string[]
}

const MAX_CELLS = 4_000_000

/**
 * 段落層級的差異：以 LCS 對齊「目前版本」與「舊版本」。
 * 太大的文件（格數超過上限）退化成整份一個 change，避免卡住畫面。
 */
export function diffBlocks(cur: string[], old: string[]): Hunk[] {
  if ((cur.length + 1) * (old.length + 1) > MAX_CELLS) {
    return cur.join('\n\n') === old.join('\n\n') ? [{ kind: 'same', cur, old }] : [{ kind: 'change', cur, old }]
  }
  const n = cur.length
  const m = old.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = cur[i] === old[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const hunks: Hunk[] = []
  const push = (kind: Hunk['kind'], c: string[], o: string[]) => {
    const last = hunks[hunks.length - 1]
    if (last && last.kind === kind) {
      last.cur.push(...c)
      last.old.push(...o)
    } else hunks.push({ kind, cur: [...c], old: [...o] })
  }
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && cur[i] === old[j]) {
      push('same', [cur[i]], [old[j]])
      i++
      j++
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      push('change', [], [old[j++]])
    } else {
      push('change', [cur[i++]], [])
    }
  }
  return hunks
}

/** 依勾選的 change 段落合併：被勾選的改用舊版內容，其餘維持目前版本。 */
export function mergeHunks(hunks: Hunk[], accept: ReadonlySet<number>): string {
  const out: string[] = []
  hunks.forEach((h, i) => out.push(...(h.kind === 'change' && accept.has(i) ? h.old : h.cur)))
  return joinBlocks(out)
}

export interface DeletedBlock { text: string; ts: number }

/**
 * 垃圾桶：在歷史快照裡出現過、但目前文件已經沒有的段落。
 * snapshots 由新到舊；同一段只列最新出現的那一版。太短（< minLen 字）的段落略過。
 */
export function findDeleted(current: string, snapshots: { ts: number; md: string }[], minLen = 12): DeletedBlock[] {
  const have = new Set(splitBlocks(current).map((b) => b.trim()))
  const seen = new Set<string>()
  const out: DeletedBlock[] = []
  for (const s of snapshots) {
    for (const b of splitBlocks(s.md)) {
      const t = b.trim()
      if (t.length < minLen || have.has(t) || seen.has(t) || /^---$/.test(t)) continue
      seen.add(t)
      out.push({ text: b, ts: s.ts })
    }
  }
  return out
}
