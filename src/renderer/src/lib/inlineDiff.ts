/** 段落內的細部差異：中日韓逐字、英數整詞，回傳相同／刪除／新增的片段。 */
export interface Seg { t: string; k: 'same' | 'del' | 'add' }

const TOKEN = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]|[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9]+)*|\s+|[^]/gu
const MAX_CELLS = 1_500_000

export const tokenize = (s: string): string[] => s.match(TOKEN) ?? []

/** a → b：del 是 a 有 b 沒有，add 是 b 有 a 沒有。太長時退化成整段刪除＋整段新增。 */
export function diffInline(a: string, b: string): Seg[] {
  if (a === b) return a ? [{ t: a, k: 'same' }] : []
  const x = tokenize(a)
  const y = tokenize(b)
  // 去掉共同的頭尾，縮小 LCS 範圍
  let p = 0
  while (p < x.length && p < y.length && x[p] === y[p]) p++
  let q = 0
  while (q < x.length - p && q < y.length - p && x[x.length - 1 - q] === y[y.length - 1 - q]) q++
  const xm = x.slice(p, x.length - q)
  const ym = y.slice(p, y.length - q)
  const out: Seg[] = []
  const push = (t: string, k: Seg['k']) => {
    if (!t) return
    const last = out[out.length - 1]
    if (last && last.k === k) last.t += t
    else out.push({ t, k })
  }
  push(x.slice(0, p).join(''), 'same')
  if ((xm.length + 1) * (ym.length + 1) > MAX_CELLS) {
    push(xm.join(''), 'del')
    push(ym.join(''), 'add')
  } else {
    const n = xm.length
    const m = ym.length
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) dp[i][j] = xm[i] === ym[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && xm[i] === ym[j]) {
        push(xm[i], 'same')
        i++
        j++
      } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) push(ym[j++], 'add')
      else push(xm[i++], 'del')
    }
  }
  push(x.slice(x.length - q).join(''), 'same')
  return out
}
