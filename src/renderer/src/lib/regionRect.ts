/** 把元素的 getBoundingClientRect 加上邊距並限制在視窗內，輸出整數（純函式）。 */
export function padRect(r: { left: number; top: number; width: number; height: number }, pad: number, vw: number, vh: number) {
  const x = Math.max(0, Math.floor(r.left - pad))
  const y = Math.max(0, Math.floor(r.top - pad))
  const x2 = Math.min(vw, Math.ceil(r.left + r.width + pad))
  const y2 = Math.min(vh, Math.ceil(r.top + r.height + pad))
  return { x, y, width: Math.max(0, x2 - x), height: Math.max(0, y2 - y) }
}
