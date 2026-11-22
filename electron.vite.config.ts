import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// 主進程只依賴 electron 與 Node 內建模組，所有第三方套件都由 renderer 打包。
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    build: { chunkSizeWarningLimit: 4000 }
  }
})
