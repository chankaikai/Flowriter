/** 收件匣一行的格式：待辦勾選框 + 時間 + 內容；多行內容以縮排接續，維持是合法的 Markdown 清單。 */
export function formatInboxLine(text: string, d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n')
  const [first, ...rest] = lines
  return [`- [ ] ${stamp} ${first}`, ...rest.map((l) => `  ${l}`.trimEnd())].join('\n') + '\n'
}
