/**
 * 代碼塊執行器的安全規則（純邏輯，可測試）。
 * 只執行 JavaScript，且只在沒有 DOM、沒有 Node、沒有檔案系統的 Worker 裡跑；
 * 結果只顯示在面板，永遠不會自動寫回文件。
 */
export const RUN_TIMEOUT_MS = 3000
export const MAX_CODE_CHARS = 20_000
export const MAX_OUT_LINES = 200
export const MAX_OUT_CHARS = 20_000

const JS_LANGS = new Set(['js', 'javascript', 'mjs', 'node'])
export const isJsLang = (lang: string): boolean => JS_LANGS.has(lang.trim().toLowerCase())

export interface Preflight {
  /** 能否執行 */
  runnable: boolean
  /** 不能執行的原因 */
  reason?: string
  /** 會被封鎖或值得注意的用法（執行前需使用者確認） */
  warnings: string[]
  /** 看起來具破壞性的指令（僅提醒；本程式不會執行這類語言） */
  danger: string[]
}

const WARN: [RegExp, string][] = [
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\b/, '網路請求（執行環境已封鎖，會失敗）'],
  [/\b(require|process|module\.exports|child_process|fs\.|__dirname)\b/, 'Node 功能（這裡沒有 Node，會失敗）'],
  [/\b(importScripts|import\s*\(|new\s+Worker|SharedWorker)\b/, '載入外部程式碼（已封鎖）'],
  [/\b(indexedDB|localStorage|sessionStorage|caches)\b/, '瀏覽器儲存（已封鎖）'],
  [/while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;\s*;\s*\)/, `看似無限迴圈（${RUN_TIMEOUT_MS / 1000} 秒後會被強制中止）`],
  [/\.repeat\s*\(\s*\d{8,}|new\s+Array\s*\(\s*\d{8,}|Array\s*\(\s*\d{8,}/, '可能配置超大記憶體（過大會被中止）']
]

const DANGER: [RegExp, string][] = [
  [/\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b|\brm\s+-rf\b/i, 'rm -rf（遞迴強制刪除）'],
  [/\b(del|erase)\s+\/[sq]\b|\brmdir\s+\/s\b|\bformat\s+[a-z]:/i, 'Windows 刪除／格式化指令'],
  [/\bdrop\s+(table|database)\b|\btruncate\s+table\b|\bdelete\s+from\s+\w+\s*;?\s*$/im, '資料庫刪除語句'],
  [/\bmkfs\b|\bdd\s+if=|>\s*\/dev\/sd[a-z]/i, '磁碟寫入／格式化'],
  [/:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, 'fork 炸彈'],
  [/\bsudo\b|\bchmod\s+-R\s+777\b|\bcurl\b[^\n|]*\|\s*(ba)?sh\b/i, '提權或下載後直接執行']
]

export function preflight(lang: string, code: string): Preflight {
  const danger = DANGER.filter(([re]) => re.test(code)).map(([, m]) => m)
  if (!code.trim()) return { runnable: false, reason: '代碼塊是空的', warnings: [], danger }
  if (code.length > MAX_CODE_CHARS) return { runnable: false, reason: `程式碼超過 ${MAX_CODE_CHARS} 字，不執行`, warnings: [], danger }
  if (!isJsLang(lang)) {
    return {
      runnable: false,
      reason: lang.trim()
        ? `目前只支援執行 JavaScript，「${lang}」不會被執行（也不會在你的電腦上跑任何指令）`
        : '代碼塊沒有標示語言；請標為 js 或 javascript 才能執行',
      warnings: [],
      danger
    }
  }
  return { runnable: true, warnings: WARN.filter(([re]) => re.test(code)).map(([, m]) => m), danger }
}

/** 限制輸出量：行數與總字元都有上限，避免輸出灌爆介面 */
export function capOutput(lines: string[]): { lines: string[]; truncated: boolean } {
  const out: string[] = []
  let chars = 0
  for (const l of lines) {
    if (out.length >= MAX_OUT_LINES || chars + l.length > MAX_OUT_CHARS) return { lines: out, truncated: true }
    out.push(l)
    chars += l.length
  }
  return { lines: out, truncated: false }
}

/**
 * Worker 的程式碼。先備份溝通用的 postMessage，再移除網路與儲存相關的全域物件，
 * 使用者的程式碼只能拿到被代理的 console。每個訊息都帶一次性 token，避免被使用者程式偽造。
 */
export function workerSource(): string {
  return `
'use strict';
const __post = self.postMessage.bind(self);
const __AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const __blocked = ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches','BroadcastChannel','SharedWorker','Worker','WebTransport','navigator','location','close'];
for (const k of __blocked) {
  try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch (e) { try { delete self[k]; } catch (e2) {} }
}
try { delete self.postMessage; } catch (e) {}
const __leaks = __blocked.filter((k) => { try { return self[k] !== undefined; } catch (e) { return false; } });
const __fmt = (a) => a.map((x) => {
  if (typeof x === 'string') return x;
  if (typeof x === 'function') return String(x);
  try { return JSON.stringify(x, (k, v) => typeof v === 'bigint' ? v + 'n' : v, 2) ?? String(x); } catch (e) { return String(x); }
}).join(' ');
self.onmessage = async (ev) => {
  const { token, code } = ev.data || {};
  self.onmessage = null;
  if (__leaks.length) { __post({ token, kind: 'fail', text: '無法建立隔離環境（' + __leaks.join(', ') + ' 仍可使用），已拒絕執行' }); return; }
  let n = 0;
  const send = (kind, text) => { if (n++ < 2000) __post({ token, kind, text }); };
  const con = {};
  for (const k of ['log','info','debug']) con[k] = (...a) => send('log', __fmt(a));
  for (const k of ['warn']) con[k] = (...a) => send('warn', __fmt(a));
  for (const k of ['error']) con[k] = (...a) => send('error', __fmt(a));
  try {
    let fn;
    try { fn = new __AsyncFunction('console', 'return (' + code + '\\n)'); }
    catch (e) { fn = new __AsyncFunction('console', code); }
    const r = await fn(con);
    if (r !== undefined) send('result', __fmt([r]));
    __post({ token, kind: 'done' });
  } catch (e) {
    __post({ token, kind: 'fail', text: (e && e.stack ? String(e.stack).split('\\n').slice(0, 4).join('\\n') : String(e)) });
  }
};
`
}
