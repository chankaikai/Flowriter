/** 力導向排版（Fruchterman–Reingold，純函式、結果可重現）。 */
export interface Pos { x: number; y: number }

export function forceLayout(ids: string[], edges: { s: string; t: string }[], w: number, h: number, iters = 220): Map<string, Pos> {
  const n = ids.length
  const out = new Map<string, Pos>()
  if (!n) return out
  const idx = new Map(ids.map((id, i) => [id, i]))
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  // 起始：圓周上均勻分布（固定順序，不用亂數，同一份資料每次排出一樣的圖）
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    const r = Math.min(w, h) * 0.35 * (0.6 + 0.4 * ((i * 7919) % 13) / 13)
    x[i] = w / 2 + Math.cos(a) * r
    y[i] = h / 2 + Math.sin(a) * r
  }
  const es = edges.map((e) => [idx.get(e.s), idx.get(e.t)] as const).filter((p): p is readonly [number, number] => p[0] !== undefined && p[1] !== undefined)
  const k = Math.sqrt((w * h) / n) * 0.9
  let temp = Math.min(w, h) / 8
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  for (let it = 0; it < iters; it++) {
    dx.fill(0)
    dy.fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ex = x[i] - x[j]
        let ey = y[i] - y[j]
        let d2 = ex * ex + ey * ey
        if (d2 < 0.01) {
          ex = (i - j) * 0.1
          ey = 0.1
          d2 = ex * ex + ey * ey
        }
        const d = Math.sqrt(d2)
        const f = (k * k) / d / d // 斥力 k²/d，再除 d 取單位向量
        dx[i] += ex * f
        dy[i] += ey * f
        dx[j] -= ex * f
        dy[j] -= ey * f
      }
    }
    for (const [a, b] of es) {
      const ex = x[a] - x[b]
      const ey = y[a] - y[b]
      const d = Math.sqrt(ex * ex + ey * ey) || 0.01
      const f = d / k // 引力 d²/k，除 d 取單位向量
      dx[a] -= ex * f
      dy[a] -= ey * f
      dx[b] += ex * f
      dy[b] += ey * f
    }
    for (let i = 0; i < n; i++) {
      dx[i] += (w / 2 - x[i]) * 0.02 // 輕微向心力，孤立節點不會飛走
      dy[i] += (h / 2 - y[i]) * 0.02
      const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 0.01
      const m = Math.min(d, temp)
      x[i] = Math.max(20, Math.min(w - 20, x[i] + (dx[i] / d) * m))
      y[i] = Math.max(20, Math.min(h - 20, y[i] + (dy[i] / d) * m))
    }
    temp *= 0.985
  }
  ids.forEach((id, i) => out.set(id, { x: x[i], y: y[i] }))
  return out
}
