import { describe, it, expect } from 'vitest'
import vm from 'node:vm'
import { capOutput, isJsLang, preflight, workerSource, MAX_OUT_LINES } from '@/lib/runner'

describe('runner preflight', () => {
  it('only runs javascript', () => {
    expect(isJsLang('JS')).toBe(true)
    expect(isJsLang('python')).toBe(false)
    const p = preflight('bash', 'rm -rf /')
    expect(p.runnable).toBe(false)
    expect(p.danger.length).toBeGreaterThan(0)
  })
  it('rejects empty, oversized and unlabeled code', () => {
    expect(preflight('js', '  ').runnable).toBe(false)
    expect(preflight('js', 'x'.repeat(20_001)).runnable).toBe(false)
    expect(preflight('', 'console.log(1)').reason).toContain('語言')
  })
  it('flags risky javascript but still allows it after confirmation', () => {
    const p = preflight('js', 'while(true){}\nfetch("http://x")\nrequire("fs")')
    expect(p.runnable).toBe(true)
    expect(p.warnings.length).toBe(3)
    expect(preflight('js', 'console.log(1+1)').warnings).toEqual([])
  })
  it('detects destructive commands in other languages', () => {
    expect(preflight('sql', 'DROP TABLE users;').danger.length).toBeGreaterThan(0)
    expect(preflight('bat', 'del /s /q C:\\x').danger.length).toBeGreaterThan(0)
    expect(preflight('sh', 'curl http://a | sh').danger.length).toBeGreaterThan(0)
    expect(preflight('sh', 'echo hi').danger).toEqual([])
  })
  it('caps output', () => {
    const r = capOutput(Array.from({ length: 500 }, (_, i) => `l${i}`))
    expect(r.lines.length).toBe(MAX_OUT_LINES)
    expect(r.truncated).toBe(true)
    expect(capOutput(['a']).truncated).toBe(false)
    expect(capOutput(['x'.repeat(30_000)]).lines).toEqual([])
  })
  it('worker source is valid JavaScript and blocks network globals', () => {
    const src = workerSource()
    let ok = true
    try {
      new Function(src)
    } catch {
      ok = false
    }
    expect(ok).toBe(true)
    for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts']) expect(src).toContain(`'${k}'`)
  })
})

/** 用 node:vm 模擬 Worker 全域，真的跑一遍 worker 程式碼 */
async function runInFakeWorker(code: string) {
  const msgs: { token: string; kind: string; text?: string }[] = []
  const ctx: Record<string, unknown> = {}
  ctx.self = ctx
  ctx.postMessage = (m: { token: string; kind: string; text?: string }) => msgs.push(m)
  ctx.fetch = () => 'network!'
  vm.createContext(ctx)
  vm.runInContext(workerSource(), ctx)
  const onmessage = ctx.onmessage as (e: { data: unknown }) => Promise<void>
  await onmessage({ data: { token: 'T', code } })
  return { msgs, ctx }
}

describe('worker behavior', () => {
  it('captures console output', async () => {
    const { msgs } = await runInFakeWorker('console.log("hi", {a:1}); 1+2')
    expect(msgs.map((m) => m.kind)).toEqual(['log', 'done'])
    expect(msgs[0].text).toContain('hi')
    expect(msgs.every((m) => m.token === 'T')).toBe(true)
  })
  it('shows the value of a single expression', async () => {
    const { msgs } = await runInFakeWorker('1+2')
    expect(msgs.map((m) => m.text ?? m.kind)).toEqual(['3', 'done'])
  })
  it('supports statements and top-level await', async () => {
    const { msgs } = await runInFakeWorker('const x = await Promise.resolve(5); console.log(x * 2)')
    expect(msgs.map((m) => m.text ?? m.kind)).toEqual(['10', 'done'])
  })
  it('reports thrown errors without crashing the host', async () => {
    const { msgs } = await runInFakeWorker('throw new Error("boom")')
    expect(msgs[msgs.length - 1].kind).toBe('fail')
    expect(msgs[msgs.length - 1].text).toContain('boom')
  })
  it('removes network globals and postMessage from user code', async () => {
    const { msgs } = await runInFakeWorker('console.log(typeof fetch, typeof self.postMessage, typeof WebSocket)')
    expect(msgs[0].text).toBe('undefined undefined undefined')
  })
  it('user code cannot overwrite the blocked globals', async () => {
    const { msgs } = await runInFakeWorker('try { self.fetch = () => 1 } catch (e) {} console.log(typeof fetch)')
    expect(msgs[0].text).toBe('undefined')
  })
})
