// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { encryptJson, decryptJson } from '@/lib/vaultCrypto'

describe('vaultCrypto', () => {
  it('round trips', async () => {
    const blob = await encryptJson('pw', { a: [1, '中文'] })
    expect(blob).not.toContain('中文')
    expect(await decryptJson('pw', blob)).toEqual({ a: [1, '中文'] })
  })
  it('wrong password or tampering returns null', async () => {
    const blob = await encryptJson('pw', { x: 1 })
    expect(await decryptJson('nope', blob)).toBeNull()
    const o = JSON.parse(blob)
    o.ct = o.ct.slice(0, -4) + 'AAAA'
    expect(await decryptJson('pw', JSON.stringify(o))).toBeNull()
  })
  it('uses fresh salt/iv each time', async () => {
    expect(await encryptJson('pw', 1)).not.toBe(await encryptJson('pw', 1))
  })
})
