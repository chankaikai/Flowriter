import { describe, expect, it } from 'vitest'
import { buildCommands, type Actions } from '@/lib/commands'

// 所有動作都換成空函式，只檢查命令表本身
const actions = new Proxy({}, { get: () => () => undefined }) as unknown as Actions

describe('命令表', () => {
  const cmds = buildCommands(actions)

  it('命令 id 不重複', () => {
    const ids = cmds.map((c) => c.id)
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([])
  })

  it('快捷鍵沒有衝突', () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const c of cmds) {
      for (const k of c.keys ?? []) {
        const prev = owner.get(k)
        if (prev) clashes.push(`${k}: ${prev} / ${c.id}`)
        owner.set(k, c.id)
      }
    }
    expect(clashes).toEqual([])
  })

  it('每個命令都有標題與分組', () => {
    for (const c of cmds) {
      expect(c.title, c.id).toBeTruthy()
      expect(c.group, c.id).toBeTruthy()
    }
  })

  it('快捷鍵規格格式合法', () => {
    for (const c of cmds) {
      for (const k of c.keys ?? []) expect(k, c.id).toMatch(/^((Mod|Alt|Shift)\+)*[A-Za-z0-9]+$/)
    }
  })
})
