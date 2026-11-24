/**
 * 原生語言（C／C++／Rust／Java／Go／Ruby／PHP／Perl／Lua）的執行規格與安全規則。
 * 純邏輯，主程序與渲染程序共用；主程序執行前會再檢查一次，不信任渲染端。
 *
 * 重要：原生程式直接跑在使用者的電腦上，沒有沙盒。這裡的黑名單只是「盡力攔截」
 * 明顯的檔案刪除／改寫、啟動其他程式、網路、系統呼叫，無法保證擋得住刻意繞過的寫法。
 */
export interface NativeLang {
  id: string
  label: string
  ext: string
  /** 編譯器／直譯器候選（依序嘗試，第一個找得到的） */
  tools: string[]
  /** 找不到工具時的安裝提示 */
  hint: string
  /** 是否需要先編譯成可執行檔 */
  compiled: boolean
}

export const NATIVE_LANGS: Record<string, NativeLang> = {
  c: { id: 'c', label: 'C', ext: 'c', tools: ['gcc', 'cc', 'clang'], hint: '請安裝 gcc 或 clang（Windows 可裝 MinGW-w64／MSYS2）', compiled: true },
  cpp: { id: 'cpp', label: 'C++', ext: 'cpp', tools: ['g++', 'clang++'], hint: '請安裝 g++ 或 clang++（Windows 可裝 MinGW-w64／MSYS2）', compiled: true },
  rust: { id: 'rust', label: 'Rust', ext: 'rs', tools: ['rustc'], hint: '請安裝 Rust（rustup）', compiled: true },
  go: { id: 'go', label: 'Go', ext: 'go', tools: ['go'], hint: '請安裝 Go', compiled: false },
  java: { id: 'java', label: 'Java', ext: 'java', tools: ['java'], hint: '請安裝 JDK 11 以上（需要 java 指令）', compiled: false },
  ruby: { id: 'ruby', label: 'Ruby', ext: 'rb', tools: ['ruby'], hint: '請安裝 Ruby', compiled: false },
  php: { id: 'php', label: 'PHP', ext: 'php', tools: ['php'], hint: '請安裝 PHP CLI', compiled: false },
  perl: { id: 'perl', label: 'Perl', ext: 'pl', tools: ['perl'], hint: '請安裝 Perl', compiled: false },
  lua: { id: 'lua', label: 'Lua', ext: 'lua', tools: ['lua', 'lua5.4', 'luajit'], hint: '請安裝 Lua', compiled: false }
}

const ALIASES: Record<string, string> = {
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  golang: 'go',
  java: 'java',
  ruby: 'ruby',
  rb: 'ruby',
  php: 'php',
  perl: 'perl',
  pl: 'perl',
  lua: 'lua'
}

/** 代碼塊的語言標籤對應到原生語言 id；不支援回傳 null */
export function nativeLang(lang: string): NativeLang | null {
  const id = ALIASES[lang.trim().toLowerCase()]
  return id ? NATIVE_LANGS[id] : null
}

type Rule = [RegExp, string]
const COMMON: Rule[] = [
  [/\brm\s+-[a-z]*r|\bdel\s+\/[sq]\b|\brmdir\s+\/s\b|\bformat\s+[a-z]:|\bmkfs\b|\bdd\s+if=|\bsudo\b/i, '含有刪除／格式化／提權指令']
]
const RULES: Record<string, Rule[]> = {
  c: [
    [/\b(system|popen|_popen|execl|execlp|execle|execv|execvp|execve|fork|vfork|posix_spawn|CreateProcess[AW]?|ShellExecute[AW]?|WinExec)\s*\(/, '啟動其他程式（system／exec／fork 等）'],
    [/\b(remove|unlink|rmdir|rename|chmod|chown|symlink|link|truncate|mkdir|DeleteFile[AW]?|RemoveDirectory[AW]?|MoveFile[AW]?|SetFileAttributes[AW]?)\s*\(/, '刪除／改名／改權限等檔案操作'],
    [/\b(f?open|freopen|fopen64|creat|open64|_wfopen)\s*\([^)]*["'][^"']*[wa+]/, '以寫入模式開啟檔案'],
    [/\b(socket|connect|bind|listen|WSAStartup|getaddrinfo|gethostbyname)\s*\(|<\s*(sys\/socket|netinet|arpa\/inet|winsock2?)\b/, '網路功能'],
    [/\b(asm|__asm__|__asm|syscall|ptrace|dlopen|LoadLibrary[AW]?)\b|<\s*windows\.h\s*>/, '內嵌組語／系統呼叫／動態載入'],
    [/#\s*include\s*[<"][^>"]*(\.\.|\/etc|\/proc|\/sys)/, '引入系統路徑']
  ],
  cpp: [
    [/\b(system|popen|_popen|execl|execlp|execle|execv|execvp|execve|fork|vfork|posix_spawn|CreateProcess[AW]?|ShellExecute[AW]?|WinExec)\s*\(/, '啟動其他程式（system／exec／fork 等）'],
    [/\b(remove|unlink|rmdir|rename|chmod|chown|symlink|truncate|mkdir|DeleteFile[AW]?|RemoveDirectory[AW]?|MoveFile[AW]?)\s*\(|std\s*::\s*filesystem|<\s*filesystem\s*>|\bremove_all\b/, '刪除／改名／檔案系統操作'],
    [/\bofstream\b|\bfstream\b|\b(f?open|freopen|creat)\s*\([^)]*["'][^"']*[wa+]/, '寫入檔案'],
    [/\b(socket|connect|bind|listen|WSAStartup|getaddrinfo)\s*\(|<\s*(sys\/socket|netinet|arpa\/inet|winsock2?)\b|\basio\b/, '網路功能'],
    [/\b(asm|__asm__|__asm|syscall|ptrace|dlopen|LoadLibrary[AW]?)\b|<\s*windows\.h\s*>/, '內嵌組語／系統呼叫／動態載入'],
    [/#\s*include\s*[<"][^>"]*(\.\.|\/etc|\/proc|\/sys)/, '引入系統路徑']
  ],
  rust: [
    [/std\s*::\s*process|\bCommand\s*::\s*new\b/, '啟動其他程式（std::process）'],
    [/std\s*::\s*fs\b|\bFile\s*::\s*(create|options|open)\b|\bOpenOptions\b|remove_(file|dir)|\bfs\s*::\s*(write|remove|rename|copy|create_dir)/, '檔案系統操作'],
    [/std\s*::\s*net\b|\bTcp(Stream|Listener)\b|\bUdpSocket\b|\breqwest\b|\btokio\s*::\s*net\b/, '網路功能'],
    [/\bunsafe\b|\bextern\s*(\"C\")?\s*\{|\basm!|\bglobal_asm!|#\s*\[\s*link|include!\s*\(|include_(str|bytes)!\s*\(/, 'unsafe／外部連結／內嵌組語／include'],
    [/std\s*::\s*env\s*::\s*(set_var|remove_var|set_current_dir)/, '修改環境／工作目錄']
  ],
  go: [
    [/"os\/exec"|"syscall"|"unsafe"|"plugin"|"net(\/http)?"|"os\/signal"|import\s+"C"|#\s*cgo/, '引入 exec／syscall／unsafe／net／cgo 等套件'],
    [/\bos\s*\.\s*(Remove|RemoveAll|Rename|Create|OpenFile|WriteFile|Mkdir|MkdirAll|Chmod|Chown|Chdir|Symlink|Truncate|Setenv|Exit)\s*\(|\bioutil\s*\.\s*WriteFile|\bos\s*\.\s*O_(WRONLY|RDWR|CREATE|APPEND|TRUNC)/, '檔案寫入／刪除／改權限'],
    [/\/\/go:(linkname|embed|generate)/, '編譯指示（linkname／embed／generate）']
  ],
  java: [
    [/\bRuntime\s*\.\s*getRuntime|\bProcessBuilder\b|\bProcess\b\s+\w+\s*=|\bjava\.lang\.reflect\b|\bsun\.misc\b|\bjdk\.internal\b|\bClassLoader\b|\bSystem\s*\.\s*(load|loadLibrary|setSecurityManager|setProperty|setIn|setOut|setErr)\b/, '啟動程式／反射／載入原生函式庫'],
    [/\bjava\.io\.(File|FileWriter|FileOutputStream|RandomAccessFile|PrintWriter)\b|\bFile(Writer|OutputStream)\b|\bRandomAccessFile\b|\bnew\s+File\s*\(|\bjava\.nio\.file\b|\bFiles\s*\.|\bPaths\s*\./, '檔案操作'],
    [/\bjava\.net\b|\bjavax\.net\b|\bSocket\b|\bURL(Connection)?\b|\bHttpClient\b/, '網路功能'],
    [/\bSystem\s*\.\s*exit\b\s*\(\s*-?\d{3,}/, '異常的結束碼']
  ],
  ruby: [
    [/`[^`\n]+`|%x[\[{(]|\b(system|exec|spawn|fork|syscall|IO\.popen|Open3|Kernel\.(system|exec|spawn)|Process\.(spawn|kill|daemon))\b/, '啟動其他程式（system／exec／反引號等）'],
    [/\b(File|FileUtils|Dir|IO)\s*\.\s*(open|write|delete|unlink|rm|rm_rf|rm_r|rmdir|mkdir|rename|chmod|chown|symlink|truncate|binwrite|new|popen|foreach|read|readlines)\b|\bFileUtils\b/, '檔案操作'],
    [/\b(Socket|TCPSocket|TCPServer|UDPSocket|Net::HTTP|open-uri|URI\.open)\b|require\s*['"](socket|net\/|open-uri)/, '網路功能'],
    [/\beval\b|\binstance_eval\b|\bclass_eval\b|\brequire\s*['"](?!set|json|date|time|prime|bigdecimal|securerandom|digest|stringio)/, 'eval／載入外部程式庫']
  ],
  php: [
    [/\b(exec|shell_exec|system|passthru|popen|proc_open|pcntl_\w+|eval|assert|create_function|dl|putenv|ini_set|set_include_path|mail)\s*\(|`[^`\n]+`/, '啟動程式／eval／修改設定'],
    [/\b(file_put_contents|fopen|fwrite|fputs|unlink|rmdir|mkdir|rename|copy|chmod|chown|touch|symlink|tempnam|tmpfile|file|readfile|include|include_once|require|require_once|move_uploaded_file)\b/, '檔案操作／引入檔案'],
    [/\b(curl_\w+|fsockopen|stream_socket_\w+|socket_\w+|file_get_contents\s*\(\s*['"]https?)/, '網路功能']
  ],
  perl: [
    [/\b(system|exec|fork|qx|syscall|kill|eval|open\s*\(?\s*[A-Za-z_$]+\s*,\s*['"]\s*\||open2|open3)\b|`[^`\n]+`/, '啟動其他程式／eval'],
    [/\b(unlink|rmdir|mkdir|rename|chmod|chown|symlink|link|truncate|utime|opendir|File::(Copy|Path|Temp|Find))\b|\bopen\s*\(?[^;\n]*['"]\s*[>+]|\bopen\s*\(?[^;\n]*,\s*['"]?[>+]/, '檔案寫入／刪除'],
    [/\b(IO::Socket|Socket|LWP|HTTP::|Net::|socket)\b/, '網路功能'],
    [/\b(require|use)\s+(?!strict|warnings|utf8|feature|List::Util|Data::Dumper|POSIX|Time::|Math::|constant|integer|bigint|bignum|Scalar::Util)[\w:]+/, '載入外部模組']
  ],
  lua: [
    [/\bos\s*\.\s*(execute|remove|rename|exit|tmpname|setlocale|getenv)\b|\bio\s*\.\s*(popen|open|output|input|lines|tmpfile)\b|\bio\.stdout:setvbuf/, '啟動程式／檔案操作'],
    [/\b(require|dofile|loadfile|load|loadstring|package|debug|collectgarbage\s*\(\s*["']stop)\b/, '載入外部程式／debug／package']
  ]
}

/** 回傳會被擋下的原因（空陣列＝通過）。渲染端用來提前提示，主程序執行前再檢查一次。 */
export function nativeBlocked(lang: NativeLang, code: string): string[] {
  const rules = [...COMMON, ...(RULES[lang.id] ?? [])]
  return rules.filter(([re]) => re.test(code)).map(([, m]) => m)
}

export const NATIVE_COMPILE_TIMEOUT_MS = 20_000
export const NATIVE_RUN_TIMEOUT_MS = 5_000

export interface NativeRunRequest {
  id: string
  lang: string
  code: string
}
export interface NativeRunResult {
  status: 'ok' | 'error' | 'timeout' | 'stopped' | 'missing' | 'blocked'
  /** 依序的輸出（stdout／stderr 分開標記） */
  lines: { kind: 'log' | 'error'; text: string }[]
  message?: string
  exitCode?: number | null
  truncated: boolean
  ms: number
}
