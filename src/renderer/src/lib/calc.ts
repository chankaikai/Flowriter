/**
 * 行內微變量：`@單價 = 120` 定義變數，`{{單價 * 1.5}}` 顯示計算結果。
 * 自己寫的遞迴下降解析器，不使用 eval / Function，所以不會執行任意程式碼。
 */

export type Vars = Record<string, number>

const FUNCS: Record<string, (...a: number[]) => number> = {
  round: (x, d = 0) => {
    const f = 10 ** d
    return Math.round(x * f) / f
  },
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  min: Math.min,
  max: Math.max
}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))
      if (!m) return null
      out.push({ t: 'num', v: parseFloat(m[0]) })
      i += m[0].length
      continue
    }
    // 變數名稱：字母（含中日韓）、底線、數字（不可開頭）
    const id = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i))
    if (id) {
      out.push({ t: 'id', v: id[0] })
      i += id[0].length
      continue
    }
    if ('+-*/%^(),×÷'.includes(c)) {
      out.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c })
      i++
      continue
    }
    return null
  }
  return out
}

/** 計算算式；語法錯誤、未定義變數、除以零等一律回傳 null。 */
export function evaluate(expr: string, vars: Vars = {}): number | null {
  // 儲存後 Markdown 可能把 * 跳脫成 \*，這裡一併接受
  const toks = tokenize(expr.replace(/\\([*_])/g, '$1'))
  if (!toks || toks.length === 0) return null
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v
  const fail = (): never => {
    throw new Error('calc')
  }

  const primary = (): number => {
    const k = toks[p++]
    if (!k) return fail()
    if (k.t === 'num') return k.v
    if (k.t === 'id') {
      if (isOp('(')) {
        p++
        const args: number[] = []
        if (!isOp(')')) {
          do args.push(add())
          while (isOp(',') && ++p)
        }
        if (!isOp(')')) return fail()
        p++
        const f = Object.prototype.hasOwnProperty.call(FUNCS, k.v) ? FUNCS[k.v] : null
        return f ? f(...args) : fail()
      }
      if (!Object.prototype.hasOwnProperty.call(vars, k.v)) return fail()
      return vars[k.v]
    }
    if (k.v === '(') {
      const v = add()
      if (!isOp(')')) return fail()
      p++
      return v
    }
    return fail()
  }
  const unary = (): number => {
    if (isOp('-')) {
      p++
      return -unary()
    }
    if (isOp('+')) {
      p++
      return unary()
    }
    return power()
  }
  const power = (): number => {
    const base = primary()
    if (isOp('^')) {
      p++
      return base ** unary() // 右結合
    }
    return base
  }
  const mul = (): number => {
    let v = unary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (toks[p++] as { v: string }).v
      const r = unary()
      if (op === '*') v *= r
      else if (r === 0) return fail()
      else v = op === '/' ? v / r : v % r
    }
    return v
  }
  const add = (): number => {
    let v = mul()
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v
      const r = mul()
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  try {
    const v = add()
    if (p !== toks.length || !Number.isFinite(v)) return null
    return v
  } catch {
    return null
  }
}

/** 顯示用：最多 6 位小數，去掉多餘的 0。 */
export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return String(parseFloat(n.toFixed(6)))
}

const DEF = /^\s*@([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+?)\s*$/u

/** 依出現順序收集 `@名稱 = 算式` 的定義（後面的定義可以引用前面的）。 */
export function collectVars(lines: Iterable<string>): Vars {
  const vars: Vars = {}
  for (const line of lines) {
    const m = DEF.exec(line)
    if (!m) continue
    const v = evaluate(m[2], vars)
    if (v !== null) vars[m[1]] = v
  }
  return vars
}

export const CALC_RE = /\{\{([^{}\n]+)\}\}/g

/** 匯出用：把整份 Markdown 裡的 {{算式}} 換成結果（略過圍欄程式碼）。算不出來的原樣保留。 */
export function applyInlineCalcs(md: string): string {
  const lines = md.split('\n')
  const vars = collectVars(lines)
  let fence: string | null = null
  return lines
    .map((line) => {
      const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
      if (f) {
        if (!fence) fence = f[1][0]
        else if (f[1][0] === fence) fence = null
        return line
      }
      if (fence) return line
      return line.replace(CALC_RE, (all, expr: string) => {
        const v = evaluate(expr, vars)
        return v === null ? all : formatNumber(v)
      })
    })
    .join('\n')
}
