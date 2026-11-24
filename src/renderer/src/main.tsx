import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/jetbrains-mono'
import './styles/theme.css'
import './styles/ui.css'
import './styles/editor.css'
import './styles/glass.css'
import './styles/translucent.css'

/** 把錯誤直接顯示在視窗裡，避免白屏時什麼線索都沒有。 */
function showFatal(title: string, err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
  console.error(title, err)
  let box = document.getElementById('fatal-error')
  if (!box) {
    box = document.createElement('pre')
    box.id = 'fatal-error'
    box.style.cssText =
      'position:fixed;inset:0;z-index:99999;margin:0;padding:24px 28px;overflow:auto;background:#1c1b19;color:#f3d9c9;' +
      'font:12.5px/1.65 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;-webkit-app-region:no-drag'
    document.body.appendChild(box)
  }
  box.textContent += `${title}\n${msg}\n\n————————\n\n`
}

/** 編輯器銷毀過程中（例如開發模式重複掛載、切換分頁），Milkdown 的上下文會先被釋放，
 *  此時若還有更新抵達就會丟出 Context not found。這是無害的收尾噪音，只記錄、不彈出全螢幕錯誤。 */
function isEditorTeardownNoise(err: unknown): boolean {
  const m = String((err as Error)?.message ?? err ?? '')
  return /^Context ".+" not found/.test(m) || m.includes('do you forget to inject it')
}

window.addEventListener('error', (e) => {
  if (isEditorTeardownNoise(e.error ?? e.message)) {
    console.warn('[editor teardown]', e.error ?? e.message)
    e.preventDefault()
    return
  }
  showFatal('執行錯誤', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  if (isEditorTeardownNoise(e.reason)) {
    console.warn('[editor teardown]', e.reason)
    e.preventDefault()
    return
  }
  showFatal('未處理的 Promise 錯誤', e.reason)
})

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    showFatal('介面渲染失敗', new Error(`${err.message}${info.componentStack ?? ''}`, { cause: err }))
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

// 動態載入 App：連模組載入階段的錯誤（匯入失敗、頂層程式碼拋錯）也能顯示出來
const isInbox = location.hash === '#inbox'
;(isInbox ? import('./components/InboxWindow') : import('./App'))
  .then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Boundary>
          <App />
        </Boundary>
      </StrictMode>
    )
  })
  .catch((err) => showFatal('載入應用程式失敗', err))
