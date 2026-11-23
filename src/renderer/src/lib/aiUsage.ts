export interface Usage { in: number; out: number }
export interface UsageRow { day: string; todayIn: number; todayOut: number; totalIn: number; totalOut: number; calls: number }
export type UsageStore = Record<string, UsageRow>

const KEY = 'inkwell.aiusage.v1'

/** 累加一次呼叫的用量；跨日時今日計數歸零。純函式，回傳新的 store。 */
export function addUsage(store: UsageStore, id: string, u: Usage, day: string): UsageStore {
  const cur = store[id] ?? { day, todayIn: 0, todayOut: 0, totalIn: 0, totalOut: 0, calls: 0 }
  const same = cur.day === day
  return {
    ...store,
    [id]: {
      day,
      todayIn: (same ? cur.todayIn : 0) + u.in,
      todayOut: (same ? cur.todayOut : 0) + u.out,
      totalIn: cur.totalIn + u.in,
      totalOut: cur.totalOut + u.out,
      calls: cur.calls + 1
    }
  }
}

/** 取某服務商目前的用量；若資料是昨天的，今日數字視為 0。 */
export function readUsage(store: UsageStore, id: string, day: string): UsageRow {
  const r = store[id]
  if (!r) return { day, todayIn: 0, todayOut: 0, totalIn: 0, totalOut: 0, calls: 0 }
  return r.day === day ? r : { ...r, day, todayIn: 0, todayOut: 0 }
}

export function loadUsage(): UsageStore {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}')
    return o && typeof o === 'object' ? (o as UsageStore) : {}
  } catch {
    return {}
  }
}

export function recordUsage(id: string, u: Usage, day: string): UsageStore {
  const next = addUsage(loadUsage(), id, u, day)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 容量滿或被禁用就算了，只是少一筆統計 */
  }
  return next
}

export const fmtTokens = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n))
