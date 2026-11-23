import { describe, it, expect } from 'vitest'
import { buildCommands, type Actions } from '@/lib/commands'
import { MENUS, RIBBON, collectMenuIds } from '@/lib/menus'

const cmds = buildCommands(new Proxy({} as Actions, { get: () => () => undefined }))
const ids = new Set(cmds.map((c) => c.id))

describe('menus', () => {
  it('every menu / ribbon entry points at a real command', () => {
    for (const id of collectMenuIds()) expect(ids.has(id)).toBe(true)
  })
  it('every command is reachable from a menu or the ribbon', () => {
    const shown = collectMenuIds()
    const missing = cmds.map((c) => c.id).filter((id) => !shown.has(id))
    expect(missing).toEqual([])
  })
  it('has the classic top-level menus', () => {
    const labels = MENUS.map((m) => m.label)
    for (const l of ['檔案', '編輯', '檢視', '說明']) expect(labels).toContain(l)
  })
  it('ribbon items have an icon or glyph', () => {
    for (const t of RIBBON) for (const g of t.groups) for (const i of g.items) expect(!!(i.icon || i.glyph)).toBe(true)
  })
})
