/**
 * 代碼塊執行器的安全規則（純邏輯，可測試）。
 * 支援 JavaScript 與 Python，都只在沒有 DOM、沒有 Node、碰不到你檔案的 Worker 裡跑
 * （Python 用 Pyodide：WebAssembly，只有記憶體內的虛擬檔案系統）；
 * 結果只顯示在代碼塊下方，永遠不會寫回文件。
 */
export const RUN_TIMEOUT_MS = 3000
/** Python 環境首次載入（下載約 10MB）的等待上限 */
export const PY_LOAD_TIMEOUT_MS = 90_000
export const PYODIDE_VERSION = '0.26.4'
export const PYODIDE_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
export const MAX_CODE_CHARS = 20_000
export const MAX_OUT_LINES = 200
export const MAX_OUT_CHARS = 20_000

const JS_LANGS = new Set(['js', 'javascript', 'mjs', 'node'])
const PY_LANGS = new Set(['py', 'python', 'python3', 'py3'])
export const isJsLang = (lang: string): boolean => JS_LANGS.has(lang.trim().toLowerCase())
export const isPyLang = (lang: string): boolean => PY_LANGS.has(lang.trim().toLowerCase())
export type RunKind = 'js' | 'py'
/** 這個語言能不能在代碼塊上直接執行；不能則回傳 null（不顯示執行按鈕） */
export function runKind(lang: string): RunKind | null {
  return isJsLang(lang) ? 'js' : isPyLang(lang) ? 'py' : null
}

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

const PY_BLOCK: [RegExp, string][] = [
  [/(^|\n)\s*(import|from)\s+(js|pyodide|micropip)\b/, '載入 js／pyodide／micropip（會碰到執行環境本身，不允許）'],
  [/__/, '含有雙底線（__import__ 等可繞過隔離，不允許）']
]
const PY_WARN: [RegExp, string][] = [
  [/(^|\n)\s*(import|from)\s+(os|subprocess|shutil|socket|requests|urllib|http|pathlib|sys)\b/, '系統／網路模組（在隔離環境中碰不到你的電腦與網路，多半會失敗或只影響虛擬環境）'],
  [/\binput\s*\(/, 'input()（沒有輸入來源，會失敗）'],
  [/while\s+(True|1)\s*:/, `看似無限迴圈（${RUN_TIMEOUT_MS / 1000} 秒後會被強制中止）`]
]

export function preflight(lang: string, code: string): Preflight {
  const danger = DANGER.filter(([re]) => re.test(code)).map(([, m]) => m)
  if (!code.trim()) return { runnable: false, reason: '代碼塊是空的', warnings: [], danger }
  if (code.length > MAX_CODE_CHARS) return { runnable: false, reason: `程式碼超過 ${MAX_CODE_CHARS} 字，不執行`, warnings: [], danger }
  if (isPyLang(lang)) {
    const blocked = PY_BLOCK.filter(([re]) => re.test(code)).map(([, m]) => m)
    if (blocked.length) return { runnable: false, reason: blocked[0], warnings: [], danger }
    return { runnable: true, warnings: PY_WARN.filter(([re]) => re.test(code)).map(([, m]) => m), danger }
  }
  if (!isJsLang(lang)) {
    return {
      runnable: false,
      reason: lang.trim()
        ? `目前支援執行 JavaScript 與 Python，「${lang}」不會被執行（也不會在你的電腦上跑任何指令）`
        : '代碼塊沒有標示語言；請標為 js 或 python 才能執行',
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

/**
 * Python（Pyodide）的 Worker 程式碼。載入完成、使用者程式開始前才移除網路／儲存相關全域物件
 * （Pyodide 本身已載入完畢，不再需要它們）；之後 Python 端的 `js` 模組也拿不到 fetch。
 * 若移除失敗則拒絕執行。
 */
export function pythonWorkerSource(): string {
  return `
'use strict';
const __post = self.postMessage.bind(self);
const __blocked = ['fetch','XMLHttpRequest','WebSocket','EventSource','importScripts','indexedDB','caches','BroadcastChannel','SharedWorker','Worker','WebTransport','navigator','location','close'];
self.onmessage = async (ev) => {
  const { token, code, indexURL } = ev.data || {};
  self.onmessage = null;
  const send = (kind, text) => __post({ token, kind, text });
  try {
    send('loading');
    importScripts(indexURL + 'pyodide.js');
    const py = await self.loadPyodide({
      indexURL,
      stdout: (t) => send('log', t),
      stderr: (t) => send('error', t)
    });
    for (const k of __blocked) {
      try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }); } catch (e) { try { delete self[k]; } catch (e2) {} }
    }
    try { delete self.postMessage; } catch (e) {}
    const leaks = __blocked.filter((k) => { try { return self[k] !== undefined; } catch (e) { return false; } });
    if (leaks.length) { send('fail', '無法建立隔離環境（' + leaks.join(', ') + ' 仍可使用），已拒絕執行'); return; }
    send('running');
    const r = await py.runPythonAsync(code);
    if (r !== undefined && r !== null) send('result', String(r));
    __post({ token, kind: 'done' });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    // Python 的錯誤只留最後幾行（traceback 尾端才有意義）
    send('fail', msg.split('\\n').filter(Boolean).slice(-4).join('\\n'));
  }
};
`
}
