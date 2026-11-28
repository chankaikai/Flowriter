import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** 同一個物件字面值裡出現重複的 key，esbuild 會警告（TS 也會報錯）。逐檔、逐個 `= {` 物件檢查。 */
describe('locales 沒有重複 key', () => {
  const dir = 'src/renderer/src/locales'
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    it(f, () => {
      const src = readFileSync(join(dir, f), 'utf8')
      const objs = src.split(/=\s*\{\s*\n/).slice(1)
      const dups: string[] = []
      for (const body of objs) {
        const end = body.search(/\n\}/)
        const part = end >= 0 ? body.slice(0, end) : body
        const seen = new Set<string>()
        for (const m of part.matchAll(/(?:^|[{,]\s*|\n\s*)(['"])((?:(?!\1).)+)\1\s*:/g)) {
          if (seen.has(m[2])) dups.push(m[2])
          seen.add(m[2])
        }
      }
      expect(dups).toEqual([])
    })
  }
})
