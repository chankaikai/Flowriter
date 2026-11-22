let counter = 0

/** 以目前主題渲染 Mermaid，回傳 SVG 字串。mermaid 體積大，所以延遲載入。 */
export async function renderMermaid(code: string, dark: boolean): Promise<string> {
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'neutral',
    fontFamily: 'inherit'
  })
  const { svg } = await mermaid.render(`mmd-${Date.now()}-${counter++}`, code)
  return svg
}
