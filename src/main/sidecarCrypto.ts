/** 純加解密（不依賴 electron，方便測試）。格式：魔術字串 + base64(iv | tag | 密文)。 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export const MAGIC = 'FWENC1\n'

export function encryptText(plain: string, k: Buffer): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', k, iv)
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return MAGIC + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')
}

export function decryptText(text: string, k: Buffer): string | null {
  if (!text.startsWith(MAGIC)) return text // 舊的明文檔
  try {
    const raw = Buffer.from(text.slice(MAGIC.length), 'base64')
    const d = createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12))
    d.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
  } catch {
    return null // 金鑰不對或檔案損壞
  }
}

