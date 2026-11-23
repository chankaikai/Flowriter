/** 二跳關係：由 [[wikilink]] 推出「經由某篇連到的筆記」與「與本文引用相同對象的筆記」。 */
export function extractLinks(md: string): string[] {
  const set = new Set<string>()
  for (const m of md.matchAll(/\[\[([^[\]\n]{1,120})\]\]/g)) {
    const n = m[1].split('|')[0].split('#')[0].trim()
    if (n) set.add(n)
  }
  return [...set]
}

export interface RelatedNote {
  stem: string
  /** 與本文共同引用的對象，或是（二跳）經由哪篇相連 */
  via: string[]
}

/**
 * 共同引用：本文連到 A、B，另一篇也連到 A（或 B）→ 兩篇相關。
 * byTarget：每個連出對象 → 連到它的筆記檔名（不含副檔名）。依共同對象數由多到少排序。
 */
export function sharedTargets(self: string, byTarget: Record<string, string[]>): RelatedNote[] {
  const map = new Map<string, string[]>()
  for (const [target, stems] of Object.entries(byTarget)) {
    for (const s of new Set(stems)) {
      if (s === self) continue
      map.set(s, [...(map.get(s) ?? []), target])
    }
  }
  return [...map.entries()]
    .map(([stem, via]) => ({ stem, via }))
    .sort((a, b) => b.via.length - a.via.length || a.stem.localeCompare(b.stem))
}

/**
 * 二跳連出：X 連到本文，X 又連到 Y（Y 不是本文、也不是本文已直接連到的）。
 * backlinks：連到本文的筆記 → 該筆記的連出清單。
 */
export function twoHopOut(self: string, direct: string[], backlinks: Record<string, string[]>): RelatedNote[] {
  const skip = new Set([self, ...direct])
  const map = new Map<string, string[]>()
  for (const [via, links] of Object.entries(backlinks)) {
    for (const y of links) {
      if (skip.has(y) || y === via) continue
      map.set(y, [...(map.get(y) ?? []), via])
    }
  }
  return [...map.entries()]
    .map(([stem, via]) => ({ stem, via }))
    .sort((a, b) => b.via.length - a.via.length || a.stem.localeCompare(b.stem))
}
