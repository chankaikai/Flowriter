/**
 * 文件旁 .inkwell 資料夾裡的 JSON（便條、參考、語音索引、段落上鎖）加密存放。
 * AES-256-GCM；金鑰是第一次使用時產生的隨機 32 位元組，放在使用者資料夾的 sidecar.key（備份會一起帶走）。
 * 舊的明文檔照常讀得到，下一次寫入時自動轉成加密格式。
 *
 * 誠實說明：金鑰在同一台電腦上，所以這保護的是「資料夾被複製、同步、分享出去」的情況，
 * 防不了能登入你這個系統帳號的人。
 */
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { decryptText, encryptText } from './sidecarCrypto'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

let keyCache: Buffer | null = null

export const sidecarKeyPath = (): string => join(app.getPath('userData'), 'sidecar.key')

async function key(): Promise<Buffer> {
  if (keyCache) return keyCache
  const f = sidecarKeyPath()
  try {
    const b = Buffer.from((await fs.readFile(f, 'utf8')).trim(), 'base64')
    if (b.length === 32) return (keyCache = b)
  } catch {
    /* 還沒有金鑰 */
  }
  const k = randomBytes(32)
  await fs.mkdir(dirname(f), { recursive: true })
  await fs.writeFile(f, k.toString('base64'), { encoding: 'utf8', mode: 0o600 })
  return (keyCache = k)
}

/** 還原備份換了金鑰檔後，清掉記憶體裡的舊金鑰。 */
export function resetSidecarKey(): void {
  keyCache = null
}

/** 讀：成功回傳明文 JSON 字串；檔案不存在或無法解密回傳空字串（前端當作「沒有資料」）。 */
export async function readSidecar(file: string): Promise<string> {
  try {
    return decryptText(await fs.readFile(file, 'utf8'), await key()) ?? ''
  } catch {
    return ''
  }
}

/** 寫：加密後寫入；先寫暫存檔再改名，避免寫到一半斷電留下壞檔。資料夾在 Windows 上設為隱藏。 */
export async function writeSidecar(file: string, json: string): Promise<boolean> {
  try {
    const dir = dirname(file)
    const fresh = !(await fs.stat(dir).catch(() => null))
    await fs.mkdir(dir, { recursive: true })
    if (fresh && process.platform === 'win32') execFile('attrib', ['+h', dir], () => undefined)
    const tmp = `${file}.${process.pid}.tmp`
    await fs.writeFile(tmp, encryptText(json, await key()), 'utf8')
    await fs.rename(tmp, file)
    return true
  } catch {
    return false
  }
}
