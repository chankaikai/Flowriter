/**
 * LilyPond 的「盡力而為」音符解析：只認常見的音符、休止、和弦、\relative、\repeat、\tuplet/\times、
 * \tempo、變數與 << >> 並行聲部。認不得的指令會被略過，不會中斷播放。
 * LilyPond 本身（wasm）只出 SVG、不出 MIDI，所以這裡自己解析；複雜的寫法可能與實際排版結果不同。
 */
import type { NoteEv } from './player'

type Tok = { k: 'word' | 'cmd' | 'sym' | 'num' | 'str'; v: string; s: number; e: number; marks?: string; dur?: string }

const RE = /%\{[\s\S]*?%\}|%[^\n]*|("(?:[^"\\]|\\.)*")|(\\\\)|\\([A-Za-z]+)|(<<|>>|[{}<>|~()[\]=])|([A-Za-z]+)([',]*)[!?]*(\d+\.*)?|(\d+\.*(?:\/\d+)?)|(\S)/g

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  for (const m of src.matchAll(RE)) {
    const s = m.index ?? 0
    const e = s + m[0].length
    if (m[1]) out.push({ k: 'str', v: m[1], s, e })
    else if (m[2]) out.push({ k: 'sym', v: '\\\\', s, e })
    else if (m[3]) out.push({ k: 'cmd', v: m[3], s, e })
    else if (m[4]) out.push({ k: 'sym', v: m[4], s, e })
    else if (m[5]) out.push({ k: 'word', v: m[5], s, e, marks: m[6], dur: m[7] })
    else if (m[8]) out.push({ k: 'num', v: m[8], s, e })
    else if (m[9]) out.push({ k: 'sym', v: m[9], s, e })
  }
  return out
}

const LETTER: Record<string, number> = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 }
const SEMI = [0, 2, 4, 5, 7, 9, 11]
const NOTE_RE = /^([a-g])(isis|eses|is|es|ses|s)?$/
const accOf = (a?: string): number => (!a ? 0 : a === 'isis' ? 2 : a === 'is' ? 1 : a === 'eses' || a === 'ses' ? -2 : -1)
const SKIP_BLOCK = new Set(['header', 'layout', 'paper', 'midi', 'with', 'lyricmode', 'lyrics', 'addlyrics', 'chordmode', 'figuremode', 'drummode', 'markup', 'markuplist', 'grace', 'acciaccatura', 'appoggiatura', 'afterGrace'])

interface St { t: number; prevN: number; rel: boolean; dur: number; dots: number; tie: boolean; scale: number }

export function lilypondEvents(source: string): NoteEv[] {
  const toks = tokenize(source)
  const ev: NoteEv[] = []
  let beat = 60 / 90 // 四分音符秒數
  let i = 0
  const st: St = { t: 0, prevN: 7, rel: false, dur: 4, dots: 0, tie: false, scale: 1 }
  const vars = new Map<string, [number, number]>()
  let depth = 0

  const closeOf = (open: number): number => {
    // 回傳與 open 位置的 { 或 << 配對的結尾 token 之後的位置
    let n = 0
    for (let j = open; j < toks.length; j++) {
      const v = toks[j].k === 'sym' ? toks[j].v : ''
      if (v === '{' || v === '<<') n++
      else if (v === '}' || v === '>>') {
        n--
        if (n === 0) return j + 1
      }
    }
    return toks.length
  }
  const skipElement = () => {
    const t = toks[i]
    if (!t) return
    if (t.k === 'sym' && (t.v === '{' || t.v === '<<')) i = closeOf(i)
    else i++
  }
  const setDur = (d?: string) => {
    if (!d) return
    const m = /^(\d+)(\.*)$/.exec(d)
    if (!m) return
    st.dur = +m[1] || st.dur
    st.dots = m[2].length
  }
  const len = () => (4 / st.dur) * (2 - Math.pow(2, -st.dots)) * beat * st.scale
  const pitch = (name: string, marks: string): { midi: number; n: number } | null => {
    const m = NOTE_RE.exec(name)
    if (!m) return null
    const l = LETTER[m[1]]
    const up = (marks.match(/'/g) ?? []).length - (marks.match(/,/g) ?? []).length
    let oct: number
    if (st.rel) {
      oct = Math.round((st.prevN - l) / 7)
      // 取離上一個音最近的八度（距離 ≤ 3 級）
      while (Math.abs(oct * 7 + l - st.prevN) > 3) oct += oct * 7 + l > st.prevN ? -1 : 1
      oct += up
    } else oct = up
    const n = oct * 7 + l
    return { midi: 48 + 12 * oct + SEMI[l] + accOf(m[2]), n }
  }
  const emit = (midis: number[], d: number, range: [number, number]) => {
    for (const midi of midis) {
      if (st.tie) {
        const prev = [...ev].reverse().find((e) => e.midi === midi && Math.abs(e.t + e.d - st.t) < 1e-6)
        if (prev) {
          prev.d += d
          prev.range = [prev.range![0], range[1]]
          continue
        }
      }
      ev.push({ t: st.t, d, midi, range })
    }
    st.tie = false
    st.t += d
  }

  const parseOne = (): void => {
    const t = toks[i]
    if (!t || depth > 40) {
      i++
      return
    }
    if (t.k === 'sym') {
      if (t.v === '{') {
        i++
        parseSeq('}')
        return
      }
      if (t.v === '<<') {
        i++
        const t0 = st.t
        let end = t0
        while (i < toks.length && !(toks[i].k === 'sym' && toks[i].v === '>>')) {
          if (toks[i].k === 'sym' && toks[i].v === '\\\\') {
            i++
            continue
          }
          st.t = t0
          parseOne()
          end = Math.max(end, st.t)
        }
        i++
        st.t = end
        return
      }
      if (t.v === '<') {
        i++
        const midis: number[] = []
        const first = st.prevN
        let firstN: number | null = null
        while (i < toks.length && !(toks[i].k === 'sym' && toks[i].v === '>')) {
          const w = toks[i]
          if (w.k === 'word') {
            const p = pitch(w.v, w.marks ?? '')
            if (p) {
              midis.push(p.midi)
              firstN ??= p.n
              st.prevN = p.n
            }
          }
          i++
        }
        const close = toks[i]
        i++
        if (firstN !== null) st.prevN = firstN
        else st.prevN = first
        let e = close?.e ?? t.e
        const d = toks[i]
        if (d && d.k === 'num' && d.s === e) {
          setDur(d.v)
          e = d.e
          i++
        }
        emit(midis, len(), [t.s, e])
        return
      }
      if (t.v === '~') st.tie = true
      i++
      return
    }
    if (t.k === 'cmd') {
      i++
      const name = t.v
      if (name === 'relative') {
        const saved = { rel: st.rel, prevN: st.prevN }
        let ref = 7
        const a = toks[i]
        if (a?.k === 'word' && NOTE_RE.test(a.v)) {
          ref = LETTER[a.v[0]] + 7 * ((a.marks?.match(/'/g)?.length ?? 0) - (a.marks?.match(/,/g)?.length ?? 0))
          i++
        }
        st.rel = true
        st.prevN = ref
        parseOne()
        st.rel = saved.rel
        st.prevN = saved.prevN
        return
      }
      if (name === 'absolute') return parseOne()
      if (name === 'tempo') {
        while (toks[i]?.k === 'str') i++
        const a = toks[i]
        const eq = toks[i + 1]
        const b = toks[i + 2]
        if (a?.k === 'num' && eq?.v === '=' && b?.k === 'num') {
          const unit = +a.v.replace(/\./g, '') || 4
          const dots = a.v.includes('.') ? 1.5 : 1
          const bpm = +b.v
          if (bpm > 0) beat = 60 / ((bpm * dots * 4) / unit)
          i += 3
        }
        return
      }
      if (name === 'repeat') {
        i++ // volta / unfold
        const n = Math.max(1, Math.min(16, +(toks[i]?.v ?? '2') || 2))
        i++
        const from = ev.length
        const t0 = st.t
        parseOne()
        const body = ev.slice(from)
        const span = st.t - t0
        for (let k = 1; k < n; k++) for (const e of body) ev.push({ ...e, t: e.t + span * k })
        st.t = t0 + span * n
        return
      }
      if (name === 'tuplet' || name === 'times') {
        const a = toks[i]
        i++
        const m = /^(\d+)\/(\d+)$/.exec(a?.v ?? '')
        const saved = st.scale
        if (m) st.scale *= name === 'tuplet' ? +m[2] / +m[1] : +m[1] / +m[2]
        parseOne()
        st.scale = saved
        return
      }
      if (name === 'key') {
        i += 2
        return
      }
      if (name === 'time' || name === 'clef' || name === 'version' || name === 'language' || name === 'include') {
        i++
        return
      }
      if (name === 'new' || name === 'context') {
        i += 2 // 類型與（可選的）名稱
        if (toks[i]?.k === 'sym' && toks[i].v === '=') i += 2
        if (toks[i]?.k === 'cmd' && toks[i].v === 'with') {
          i++
          skipElement()
        }
        parseOne()
        return
      }
      if (name === 'score' || name === 'book' || name === 'bookpart' || name === 'transpose' || name === 'partcombine') {
        if (name === 'transpose') i += 2
        parseOne()
        return
      }
      if (SKIP_BLOCK.has(name)) {
        skipElement()
        return
      }
      const v = vars.get(name)
      if (v) {
        depth++
        const save = i
        i = v[0]
        while (i < v[1]) parseOne()
        i = save
        depth--
      }
      return
    }
    if (t.k === 'word') {
      // 變數定義：name = { … }
      if (toks[i + 1]?.k === 'sym' && toks[i + 1].v === '=' && !NOTE_RE.test(t.v) && !/^[rRsq]$/.test(t.v)) {
        i += 2
        const a = i
        if (toks[i]?.k === 'cmd') {
          // \relative c' { … } 之類：先越過前綴指令與參數，再整塊略過
          let j = i
          while (j < toks.length && j - i < 6 && !(toks[j].k === 'sym' && (toks[j].v === '{' || toks[j].v === '<<'))) j++
          i = j
        }
        skipElement()
        vars.set(t.v, [a, i])
        return
      }
      i++
      setDur(t.dur)
      if (/^[rRs]$/.test(t.v)) {
        st.t += len()
        st.tie = false
        return
      }
      const p = pitch(t.v, t.marks ?? '')
      if (!p) return
      st.prevN = p.n
      emit([p.midi], len(), [t.s, t.e])
      return
    }
    i++ // 數字、字串等：略過
  }

  function parseSeq(close: string): void {
    while (i < toks.length) {
      const t = toks[i]
      if (t.k === 'sym' && t.v === close) {
        i++
        return
      }
      parseOne()
    }
  }

  // 頂層：定義與 \score 區塊；沒有任何 \score 時，頂層的 { } 就是樂曲
  while (i < toks.length) parseOne()
  return ev
}
