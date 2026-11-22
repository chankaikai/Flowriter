export interface TaskItem { line: number; text: string; checked: boolean }

/** 收集 Markdown 裡的 `- [ ]` / `- [x]` 任務（略過程式碼區塊）。 */
export function collectTasks(md: string): TaskItem[] {
  const out: TaskItem[] = []
  let fence: string | null = null
  md.split('\n').forEach((raw, i) => {
    const f = /^\s*(`{3,}|~{3,})/.exec(raw)
    if (f) {
      if (!fence) fence = f[1][0]
      else if (f[1][0] === fence) fence = null
      return
    }
    if (fence) return
    const m = /^\s*(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s+(.*\S)\s*$/.exec(raw)
    if (m) out.push({ line: i, text: m[2], checked: m[1] !== ' ' })
  })
  return out
}
