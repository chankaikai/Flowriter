import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(n)) out.push(p)
  }
  return out
}

describe('i18n 匯入', () => {
  it('用到 tr() / trf() 的檔案都要匯入或定義它（否則執行時 tr is not defined）', () => {
    const bad: string[] = []
    for (const f of walk('src/renderer/src')) {
      const s = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const name of ['tr', 'trf']) {
        if (!new RegExp(`(?<![\\w.$])${name}\\(`).test(s)) continue
        const ok = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(s) || new RegExp(`(const|function)\\s+${name}\\b`).test(s)
        if (!ok) bad.push(`${name}: ${f}`)
      }
    }
    expect(bad).toEqual([])
  })
})
