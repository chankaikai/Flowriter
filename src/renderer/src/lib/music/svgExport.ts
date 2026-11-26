/**
 * 把畫面上的譜面 SVG 變成可以獨立開啟的檔案文字（純字串處理）。
 * 畫面上用 currentColor 與 CSS 反相配色，獨立檔案沒有這些上下文，所以：
 * - currentColor 換成固定的深色；
 * - 補上 xmlns；
 * - 拿掉內嵌的 style 寬度（width:100%），避免在其他程式裡被拉成整個視窗。
 */
export function standaloneSvg(svg: string, ink = '#1a1a1a'): string {
  let s = svg.replace(/currentColor/gi, ink)
  if (!/<svg\b[^>]*\sxmlns\s*=/.test(s)) s = s.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"')
  if (/<svg\b[^>]*\bxlink:/.test(s) || /\sxlink:href=/.test(s)) {
    if (!/<svg\b[^>]*xmlns:xlink=/.test(s)) s = s.replace(/<svg\b/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
  }
  // 去掉 root 的 style 屬性（只動第一個 <svg ...> 標籤）
  s = s.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\sstyle="[^"]*"/, ''))
  // 沒有 width/height 的 root 補上來自 viewBox 的尺寸，離開瀏覽器後才有大小
  s = s.replace(/<svg\b[^>]*>/, (tag) => {
    if (/\swidth=/.test(tag) || /\sheight=/.test(tag)) return tag
    const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(tag)
    return vb ? tag.replace(/<svg\b/, `<svg width="${Math.round(+vb[1])}" height="${Math.round(+vb[2])}"`) : tag
  })
  return /^\s*<\?xml/.test(s) ? s : `<?xml version="1.0" encoding="UTF-8"?>\n${s}`
}

export function svgFileName(lang: string, index: number, total: number): string {
  return total > 1 ? `score-${lang}-${index + 1}.svg` : `score-${lang}.svg`
}
