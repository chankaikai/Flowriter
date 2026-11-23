/**
 * 加密抽屜：AES-256-GCM，金鑰由密碼經 PBKDF2-SHA256（310000 次）衍生。
 * 檔案格式 JSON：{ v, salt, iv, ct }，皆為 base64。密碼不會儲存，忘記就無法解開。
 */
const ITER = 310_000
const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (u: Uint8Array) => {
  let s = ''
  for (const b of u) s += String.fromCharCode(b)
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITER, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptJson(password: string, data: unknown): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))))
  return JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) })
}

/** 密碼錯誤或檔案被改動時回傳 null（GCM 驗證失敗）。 */
export async function decryptJson<T>(password: string, blob: string): Promise<T | null> {
  try {
    const o = JSON.parse(blob)
    if (o.v !== 1) return null
    const key = await deriveKey(password, unb64(o.salt))
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) as BufferSource }, key, unb64(o.ct) as BufferSource)
    return JSON.parse(dec.decode(pt)) as T
  } catch {
    return null
  }
}
