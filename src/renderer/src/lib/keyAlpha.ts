/**
 * 把「前景色畫在底色上」的截圖還原成透明底：每個像素沿 底色→前景色 的連線取投影，得到 0–1 的不透明度，
 * 顏色一律設為前景色。這樣黑字白底的公式會變成乾淨的透明底黑字，抗鋸齒邊緣也保留。
 * 原本就帶透明度的像素會再乘上去。就地修改 rgba。
 */
export function keyToAlpha(rgba: Uint8ClampedArray | Uint8Array, bg: [number, number, number], fg: [number, number, number]): void {
  let dr = bg[0] - fg[0], dg = bg[1] - fg[1], db = bg[2] - fg[2]
  let f = fg
  const len2 = dr * dr + dg * dg + db * db
  if (len2 < 30 * 30) {
    // 前景與底色幾乎一樣（例如抓不到顏色）：改用與底色反差最大的黑／白當前景
    const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]
    f = lum > 128 ? [0, 0, 0] : [255, 255, 255]
    dr = bg[0] - f[0]
    dg = bg[1] - f[1]
    db = bg[2] - f[2]
  }
  const l2 = dr * dr + dg * dg + db * db
  for (let i = 0; i < rgba.length; i += 4) {
    const t = ((bg[0] - rgba[i]) * dr + (bg[1] - rgba[i + 1]) * dg + (bg[2] - rgba[i + 2]) * db) / l2
    const a = Math.max(0, Math.min(1, t))
    rgba[i] = f[0]
    rgba[i + 1] = f[1]
    rgba[i + 2] = f[2]
    rgba[i + 3] = Math.round(a * rgba[i + 3])
  }
}

export function parseCssColor(s: string): [number, number, number, number] | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/i.exec(s)
  if (!m) return null
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a]
}
