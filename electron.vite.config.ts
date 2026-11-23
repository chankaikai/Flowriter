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
    // Windows 常把 ::1（IPv6 localhost）的 5173 埠列入系統保留範圍，會出現 EACCES；固定綁 127.0.0.1
    server: { host: '127.0.0.1', port: 38417, strictPort: false },
    build: { chunkSizeWarningLimit: 4000 }
  }
})
