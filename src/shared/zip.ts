/**
 * 最小的 ZIP 打包（只「存放」不壓縮，PNG 本來就壓縮過）。純函式，主程序與測試共用。
 * 檔名用 UTF-8（general purpose flag bit 11），中文檔名在 Windows／macOS／Linux 的解壓縮工具都能正確顯示。
 */
const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry { name: string; data: Uint8Array }

function dosDateTime(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getFullYear())
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  }
}

export function zipStore(entries: ZipEntry[], when = new Date()): Uint8Array {
  if (entries.length > 0xffff) throw new Error('too many files')
  const enc = new TextEncoder()
  const { time, date } = dosDateTime(when)
  const names = entries.map((e) => enc.encode(e.name.replace(/\\/g, '/').replace(/^\/+/, '')))
  let size = 22
  entries.forEach((e, i) => (size += 30 + names[i].length + e.data.length + 46 + names[i].length))
  if (size > 0xfffffffe) throw new Error('zip too large')
  const out = new Uint8Array(size)
  const dv = new DataView(out.buffer)
  let p = 0
  const offsets: number[] = []
  entries.forEach((e, i) => {
    offsets.push(p)
    dv.setUint32(p, 0x04034b50, true)
    dv.setUint16(p + 4, 20, true) // version needed
    dv.setUint16(p + 6, 0x0800, true) // UTF-8 names
    dv.setUint16(p + 8, 0, true) // stored
    dv.setUint16(p + 10, time, true)
    dv.setUint16(p + 12, date, true)
    dv.setUint32(p + 14, crc32(e.data), true)
    dv.setUint32(p + 18, e.data.length, true)
    dv.setUint32(p + 22, e.data.length, true)
    dv.setUint16(p + 26, names[i].length, true)
    dv.setUint16(p + 28, 0, true)
    out.set(names[i], p + 30)
    out.set(e.data, p + 30 + names[i].length)
    p += 30 + names[i].length + e.data.length
  })
  const cdStart = p
  entries.forEach((e, i) => {
    dv.setUint32(p, 0x02014b50, true)
    dv.setUint16(p + 4, 20, true)
    dv.setUint16(p + 6, 20, true)
    dv.setUint16(p + 8, 0x0800, true)
    dv.setUint16(p + 10, 0, true)
    dv.setUint16(p + 12, time, true)
    dv.setUint16(p + 14, date, true)
    dv.setUint32(p + 16, crc32(e.data), true)
    dv.setUint32(p + 20, e.data.length, true)
    dv.setUint32(p + 24, e.data.length, true)
    dv.setUint16(p + 28, names[i].length, true)
    dv.setUint32(p + 42, offsets[i], true)
    out.set(names[i], p + 46)
    p += 46 + names[i].length
  })
  const cdSize = p - cdStart
  dv.setUint32(p, 0x06054b50, true)
  dv.setUint16(p + 8, entries.length, true)
  dv.setUint16(p + 10, entries.length, true)
  dv.setUint32(p + 12, cdSize, true)
  dv.setUint32(p + 16, cdStart, true)
  return out
}
