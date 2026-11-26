import { keyToAlpha, parseCssColor } from './keyAlpha'
import { opaqueBounds, svgToPng } from './svgPng'
import { padRect } from './regionRect'

/** 往上找第一個有實色的底色；找不到就用 --bg。 */
function effectiveBg(el: Element): [number, number, number] {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = parseCssColor(getComputedStyle(n).backgroundColor)
    if (c && c[3] > 0.6) return [c[0], c[1], c[2]]
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  const v = parseCssColor(raw.startsWith('#') ? hexToRgb(raw) : raw)
  return v ? [v[0], v[1], v[2]] : [255, 255, 255]
}
function hexToRgb(h: string): string {
  const s = h.replace('#', '')
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  const n = parseInt(f.slice(0, 6), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** 把一個畫面上的元素變成「透明底、尺寸貼齊內容最外緣」的 PNG 放進剪貼簿。 */
export async function copyElementPng(el: HTMLElement, hideDuring?: () => () => void): Promise<boolean> {
  // 向量圖（Mermaid、樂譜）：直接由 SVG 轉，最清晰
  const svg = el instanceof SVGElement ? el : el.querySelector('svg')
  if (svg && !el.classList.contains('katex')) {
    const c = svg.cloneNode(true) as SVGSVGElement
    const r = svg.getBoundingClientRect()
    if (!c.getAttribute('viewBox') && r.width > 0) c.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`)
    const png = await svgToPng(new XMLSerializer().serializeToString(c), 3)
    if (!png) return false
    return window.api.clipboardPng(png.data.buffer.slice(png.data.byteOffset, png.data.byteOffset + png.data.byteLength) as ArrayBuffer)
  }
  // 公式（HTML 排版）：截圖後去底色
  const fg = parseCssColor(getComputedStyle(el).color) ?? [0, 0, 0, 1]
  const bg = effectiveBg(el)
  const restore = hideDuring?.()
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
  let buf: ArrayBuffer | null = null
  try {
    buf = await window.api.captureRegion(padRect(el.getBoundingClientRect(), 8, window.innerWidth, window.innerHeight))
  } finally {
    restore?.()
  }
  if (!buf) return false
  const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }))
  const cv = document.createElement('canvas')
  cv.width = bmp.width
  cv.height = bmp.height
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0)
  const im = ctx.getImageData(0, 0, cv.width, cv.height)
  keyToAlpha(im.data, bg, [fg[0], fg[1], fg[2]])
  const b = opaqueBounds(im.data, cv.width, cv.height, 10)
  if (!b) return false
  ctx.putImageData(im, 0, 0)
  const pad = 2
  const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad)
  const w = Math.min(cv.width - x, b.w + pad * 2), h = Math.min(cv.height - y, b.h + pad * 2)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(cv, x, y, w, h, 0, 0, w, h)
  const blob: Blob | null = await new Promise((r) => out.toBlob(r, 'image/png'))
  if (!blob) return false
  return window.api.clipboardPng(await blob.arrayBuffer())
}
