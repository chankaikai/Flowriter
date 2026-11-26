/**
 * SVG → 透明底 PNG，並裁掉四周的透明邊（尺寸以內容最外緣為準）。
 * 公式、流程圖、樂譜的「複製 PNG」與匯出 Word 都走這裡。
 */
export interface PngImage {
  data: Uint8Array
  width: number
  height: number
}

/** 找出不透明像素的外框；整張都是透明時回傳 null。純函式，方便測試。 */
export function opaqueBounds(rgba: ArrayLike<number>, w: number, h: number, alphaMin = 8): { x: number; y: number; w: number; h: number } | null {
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    const row = y * w * 4
    for (let x = 0; x < w; x++) {
      if (rgba[row + x * 4 + 3] > alphaMin) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** 取出 SVG 的自然尺寸（width/height 屬性優先，其次 viewBox）。 */
export function svgSize(svg: string): { w: number; h: number } {
  const num = (s: string | null) => (s && /^[\d.]+(px)?$/.test(s.trim()) ? parseFloat(s) : NaN)
  const head = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? ''
  const attr = (n: string) => new RegExp(`\\s${n}=["']([^"']+)["']`, 'i').exec(head)?.[1] ?? null
  let w = num(attr('width'))
  let h = num(attr('height'))
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if ((!(w > 0) || !(h > 0)) && vb && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    w = vb[2]
    h = vb[3]
  }
  return { w: w > 0 ? w : 300, h: h > 0 ? h : 150 }
}

export async function svgToPng(svg: string, scale = 3, pad = 2): Promise<PngImage | null> {
  const { w, h } = svgSize(svg)
  const W = Math.min(8000, Math.ceil(w * scale))
  const H = Math.min(8000, Math.ceil(h * scale))
  if (W < 1 || H < 1) return null
  // 保證有 xmlns 與明確寬高，否則 <img> 無法正確載入
  let markup = svg.replace(/<svg\b([^>]*)>/i, (_m, a: string) => {
    let attrs = a
    if (!/\sxmlns=/.test(attrs)) attrs += ' xmlns="http://www.w3.org/2000/svg"'
    attrs = attrs.replace(/\s(width|height)=["'][^"']*["']/gi, '')
    return `<svg${attrs} width="${w}" height="${h}">`
  })
  if (!/viewBox=/i.test(markup)) markup = markup.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`)
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok()
      img.onerror = () => bad(new Error('SVG 載入失敗'))
      img.src = url
    })
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d', { willReadFrequently: true })!
    ctx.clearRect(0, 0, W, H) // 透明底
    ctx.drawImage(img, 0, 0, W, H)
    const b = opaqueBounds(ctx.getImageData(0, 0, W, H).data, W, H)
    if (!b) return null
    const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad)
    const cw = Math.min(W - x, b.w + pad * 2), ch = Math.min(H - y, b.h + pad * 2)
    const out = document.createElement('canvas')
    out.width = cw
    out.height = ch
    out.getContext('2d')!.drawImage(cv, x, y, cw, ch, 0, 0, cw, ch)
    const blob: Blob | null = await new Promise((r) => out.toBlob(r, 'image/png'))
    if (!blob) return null
    return { data: new Uint8Array(await blob.arrayBuffer()), width: cw / scale, height: ch / scale }
  } finally {
    URL.revokeObjectURL(url)
  }
}
