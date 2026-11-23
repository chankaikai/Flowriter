export interface SnapMeta { key: string; name: string; ts: number; size: number }
export interface Memory extends SnapMeta { label: string }

const DAY = 86_400_000
const SPANS: [number, string][] = [[7, '一週前'], [30, '一個月前'], [90, '三個月前'], [180, '半年前'], [365, '一年前'], [730, '兩年前'], [1095, '三年前']]

/**
 * 「那年今天」：對每個時間跨度，挑出離「現在往前推 N 天」最近、且落在 ±1 天內的快照；
 * 同一份文件同一跨度只留一張，跨度越久排越前面。
 */
export function pickMemories(snaps: SnapMeta[], now = Date.now()): Memory[] {
  const out: Memory[] = []
  for (const [days, label] of [...SPANS].reverse()) {
    const target = now - days * DAY
    const best = new Map<string, SnapMeta>()
    for (const s of snaps) {
      const d = Math.abs(s.ts - target)
      if (d > DAY) continue
      const cur = best.get(s.key)
      if (!cur || d < Math.abs(cur.ts - target)) best.set(s.key, s)
    }
    for (const s of best.values()) if (!out.some((o) => o.key === s.key && o.ts === s.ts)) out.push({ ...s, label })
  }
  return out
}
