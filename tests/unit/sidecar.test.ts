import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'

describe('sidecar crypto', () => {
  it('round-trips and rejects a wrong key', async () => {
    const mod: any = await import('../../src/main/sidecarCrypto')
    const k = randomBytes(32)
    const enc = mod.encryptText('{"a":"中文"}', k)
    expect(enc.startsWith('FWENC1\n')).toBe(true)
    expect(enc.includes('中文')).toBe(false)
    expect(mod.decryptText(enc, k)).toBe('{"a":"中文"}')
    expect(mod.decryptText(enc, randomBytes(32))).toBeNull()
    expect(mod.decryptText('{"plain":1}', k)).toBe('{"plain":1}')
  })
})
