import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { padRect } from '@/lib/regionRect'
import { tr } from '@/lib/i18n'

/**
 * 公式：滑過時顯示 LaTeX 原始碼，並提供「複製 PNG」。
 * 全部是浮動的 DOM，不進入文件內容；PNG 是請主程序把視窗該區域截圖放進剪貼簿。
 */
const key = new PluginKey('inkwell-math-hover')
const MAX_SRC = 90

let chip: HTMLDivElement | null = null
let hideTimer = 0
let current: HTMLElement | null = null

function texOf(katex: Element): string {
  return katex.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim() ?? ''
}

function ensureChip(): HTMLDivElement {
  if (chip) return chip
  const c = document.createElement('div')
  c.className = 'math-chip'
  c.setAttribute('contenteditable', 'false')
  c.addEventListener('mouseenter', () => window.clearTimeout(hideTimer))
  c.addEventListener('mouseleave', () => schedule())
  document.body.appendChild(c)
  chip = c
  return c
}

function hide() {
  if (chip) chip.style.display = 'none'
  current = null
}
function schedule() {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(hide, 250)
}

async function copyPng(el: HTMLElement, btn: HTMLButtonElement) {
  const r = padRect(el.getBoundingClientRect(), 8, window.innerWidth, window.innerHeight)
  chip && (chip.style.visibility = 'hidden') // 截圖前先藏起浮層，免得拍進去
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
  let ok = false
  try {
    ok = await window.api.copyRegionImage(r)
  } catch {
    ok = false
  }
  chip && (chip.style.visibility = '')
  btn.textContent = ok ? tr('已複製') : tr('複製失敗')
  window.setTimeout(() => (btn.textContent = tr('複製 PNG')), 1400)
}

function show(katex: HTMLElement) {
  window.clearTimeout(hideTimer)
  if (current === katex && chip && chip.style.display !== 'none') return
  current = katex
  const c = ensureChip()
  const src = texOf(katex)
  c.replaceChildren()
  if (src) {
    const code = document.createElement('code')
    code.textContent = src.length > MAX_SRC ? src.slice(0, MAX_SRC) + '…' : src
    code.title = src
    c.appendChild(code)
  }
  const btn = document.createElement('button')
  btn.textContent = tr('複製 PNG')
  btn.addEventListener('mousedown', (e) => e.preventDefault())
  btn.addEventListener('click', () => void copyPng(katex, btn))
  c.appendChild(btn)
  c.style.display = 'flex'
  const r = katex.getBoundingClientRect()
  const w = c.offsetWidth
  c.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`
  const above = r.top - c.offsetHeight - 6
  c.style.top = `${above > 8 ? above : r.bottom + 6}px`
}

export const mathHoverPlugin = $prose(
  () =>
    new Plugin({
      key,
      props: {
        handleDOMEvents: {
          mouseover(_view, e) {
            const k = (e.target as Element | null)?.closest?.('.katex') as HTMLElement | null
            if (k) show(k)
            return false
          },
          mouseout(_view, e) {
            if ((e.target as Element | null)?.closest?.('.katex')) schedule()
            return false
          }
        }
      },
      view: () => ({ destroy: () => { window.clearTimeout(hideTimer); chip?.remove(); chip = null; current = null } })
    })
)
