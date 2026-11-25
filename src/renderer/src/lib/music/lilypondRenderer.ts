import type { MusicRenderer } from './types'
import { MusicError } from './abcRenderer'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * LilyPond（@sightread/lilypond-wasm），只在文件裡出現 lilypond 圍欄時才動態載入。
 * - 整個頁面共用一個編譯器實例；編譯一次一個（排隊），過期的排隊項目直接丟掉。
 * - 這個套件自己用 Web Worker 編譯，不會卡住編輯器輸入。
 * - 以來源文字的雜湊做快取，文字沒變不重編。
 * - 只要 SVG；失敗時顯示 LilyPond 的 log。
 */

/* ------------------------------ 快取 ------------------------------ */

/** cyrb53 雜湊（同步、不需要 crypto） */
export function hashText(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + s.length
}

const CACHE_MAX = 20
const cache = new Map<string, string[]>()
const cacheGet = (k: string) => {
  const v = cache.get(k)
  if (v) {
    cache.delete(k)
    cache.set(k, v) // 最近使用移到最後
  }
  return v
}
const cacheSet = (k: string, v: string[]) => {
  cache.set(k, v)
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string)
}
export const __cacheSize = () => cache.size

/* ------------------------------ log 與 SVG 處理 ------------------------------ */

/** 把各種形狀的 logs（字串、陣列、物件）整理成文字 */
export function formatLogs(logs: unknown): string {
  const one = (x: any): string => (typeof x === 'string' ? x : x && typeof x === 'object' ? String(x.text ?? x.message ?? x.line ?? JSON.stringify(x)) : String(x ?? ''))
  const text = Array.isArray(logs) ? logs.map(one).join('\n') : one(logs)
  return text.replace(/\r\n?/g, '\n').trim()
}

/** 取 log 最有用的幾行：先放含 error 的行，其餘照原順序，最多 12 行 */
export function summarizeLog(log: string): string {
  const lines = log.split('\n').map((l) => l.trimEnd()).filter(Boolean)
  if (!lines.length) return ''
  const errs = lines.filter((l) => /error|錯誤|fatal/i.test(l))
  const pick = errs.length ? [...errs, ...lines.filter((l) => !errs.includes(l))] : lines
  return pick.slice(0, 12).join('\n')
}

/** 去掉會執行程式或載入外部資源的東西；回傳乾淨的 <svg> 元素 */
export function cleanSvg(text: string): SVGSVGElement | null {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null
  svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove())
  const walk = (el: Element) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase()
      const v = a.value.trim().toLowerCase()
      if (n.startsWith('on') || ((n === 'href' || n === 'xlink:href') && /^(javascript:|https?:|data:text)/.test(v))) el.removeAttribute(a.name)
    }
    for (const c of [...el.children]) walk(c)
  }
  walk(svg)
  return document.importNode(svg, true) as unknown as SVGSVGElement
}

/* ------------------------------ 編譯器（全頁共用一個） ------------------------------ */

type Progress = (loaded: number, total: number) => void
const progressListeners = new Set<Progress>()
let compilerPromise: Promise<any> | null = null
let lastProgress: [number, number] | null = null

function getCompiler(): Promise<any> {
  compilerPromise ??= (async () => {
    const lib: any = await import('@sightread/lilypond-wasm')
    const compiler = lib.createReusableCompiler()
    if (typeof compiler.preload === 'function') {
      await compiler.preload({
        onProgress: (p: any) => {
          const loaded = Number(p?.loadedBytes ?? p?.loaded ?? 0)
          const total = Number(p?.totalBytes ?? p?.total ?? 0)
          lastProgress = [loaded, total]
          for (const f of progressListeners) f(loaded, total)
        }
      })
    }
    lastProgress = null
    return compiler
  })().catch((e) => {
    compilerPromise = null // 下載失敗下次可以重試
    throw e
  })
  return compilerPromise
}

let queue: Promise<unknown> = Promise.resolve()

const decoder = new TextDecoder()
/** 從結果裡取出所有 .svg，依檔名排序（多頁時頁序要對） */
function svgFiles(result: any): string[] {
  const files: Record<string, Uint8Array | string> = result?.files ?? {}
  return Object.keys(files)
    .filter((k) => k.toLowerCase().endsWith('.svg'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((k) => (typeof files[k] === 'string' ? (files[k] as string) : decoder.decode(files[k] as Uint8Array)))
}

const mb = (n: number) => (n / 1048576).toFixed(1)

export function createLilypondRenderer(): MusicRenderer {
  let mount: HTMLElement | null = null
  let gen = 0
  let off: (() => void) | null = null
  return {
    async render(source, target) {
      mount = target
      const my = ++gen
      const text = source.replace(/^﻿/, '')
      if (!text.trim()) throw new MusicError('這個 lilypond 圍欄是空的')

      const key = hashText(text)
      const hit = cacheGet(key)
      if (hit) return void draw(target, hit)

      const status = document.createElement('div')
      status.className = 'music-status'
      const setStatus = (t: string) => (status.textContent = t)
      setStatus(lastProgress || !compilerPromise ? '準備排版引擎…' : '正在排版…')
      target.prepend(status) // 舊的譜還在就留著，只在上面加一行狀態
      const onProg: Progress = (l, t) => setStatus(t ? `下載排版引擎 ${mb(l)} / ${mb(t)} MB` : `下載排版引擎 ${mb(l)} MB`)
      progressListeners.add(onProg)
      const offLocal = () => progressListeners.delete(onProg)
      off = offLocal
      if (lastProgress) onProg(...lastProgress)

      try {
        const compiler = await getCompiler()
        if (my !== gen) return
        // 一次編一個；排隊期間文字又變了就跳過，不浪費時間
        const result: any = await (queue = queue.catch(() => undefined).then(async () => {
          if (my !== gen) return null
          setStatus('正在排版…')
          return compiler.compile(text, { format: 'svg' })
        }))
        if (my !== gen || !result) return // 過期結果不畫到新文字上
        const svgs = svgFiles(result)
        if (!svgs.length) {
          const log = summarizeLog(formatLogs(result?.logs))
          throw new MusicError(log || 'LilyPond 沒有產生 SVG（請確認有 \\score 或可排版的音符）')
        }
        cacheSet(key, svgs)
        draw(target, svgs)
      } catch (e) {
        if (my !== gen) return
        status.remove()
        if (e instanceof MusicError) throw e
        const log = summarizeLog(formatLogs((e as any)?.logs))
        throw new MusicError(log || `LilyPond 無法執行：${String((e as Error)?.message ?? e).split('\n')[0].slice(0, 160)}`)
      } finally {
        offLocal() // 只收自己的進度監聽，不動較新那次渲染的
        if (off === offLocal) off = null
        status.remove()
      }
    },
    destroy() {
      gen++ // 讓還在排隊或編譯中的結果作廢
      off?.()
      off = null
      mount?.replaceChildren()
      mount = null
    }
  }
}

function draw(target: HTMLElement, svgs: string[]): void {
  const frag = document.createDocumentFragment()
  const made: SVGSVGElement[] = []
  for (const text of svgs) {
    const svg = cleanSvg(text)
    if (!svg) continue
    const wrap = document.createElement('div')
    wrap.className = 'ly-page'
    wrap.appendChild(svg)
    frag.appendChild(wrap)
    made.push(svg)
  }
  if (!made.length) throw new MusicError('LilyPond 產生的 SVG 無法讀取')
  target.replaceChildren(frag)
  // LilyPond 輸出整張紙；量出實際內容範圍把四周空白裁掉，寬度 100%
  for (const svg of made) {
    try {
      const b = svg.getBBox()
      if (b.width > 0 && b.height > 0) {
        const pad = Math.max(b.width, b.height) * 0.01
        svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}`)
      }
    } catch {
      /* 沒有版面就維持原 viewBox */
    }
    svg.removeAttribute('width')
    svg.removeAttribute('height')
    svg.style.width = '100%'
    svg.style.height = 'auto'
  }
}
