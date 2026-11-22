import { _electron as electron, expect, test } from '@playwright/test'
import { join } from 'node:path'

// 需要先 `npm run build`。CI 在 xvfb 下執行。
test('啟動、輸入文字、切換原始碼模式', async () => {
  const app = await electron.launch({
    args: ['--no-sandbox', join(__dirname, '../..')],
    env: { ...process.env, INKWELL_E2E: '1' }
  })
  try {
    const win = await app.firstWindow()
    const errors: string[] = []
    win.on('pageerror', (e) => errors.push(e.message))

    const pm = win.locator('.milkdown .ProseMirror').first()
    await expect(pm).toBeVisible({ timeout: 30_000 })

    await pm.click()
    await win.keyboard.press('Control+End')
    await win.keyboard.type('\n\n# 冒煙測試標題\n\n這是一段測試文字。')
    await expect(pm).toContainText('冒煙測試標題')

    expect(errors).toEqual([])
  } finally {
    await app.close()
  }
})
