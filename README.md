# Inkwell

所見即所得的 Markdown 桌面編輯器（Electron + React + Milkdown/ProseMirror）。

## 啟動

```bash
npm install
npm run dev        # 開發
npm run build      # 建置
npm run dist       # 打包安裝檔（electron-builder）
```

## 架構

```
src/main        Electron 主進程：檔案系統、對話框、PDF 匯出、inkwell:// 圖片協議
src/preload     contextBridge 暴露的安全 API
src/shared      主進程與渲染進程共用型別
src/renderer/src
  editor/       MarkdownEditor（Milkdown Crepe）、plugins（聚焦/打字機/查找）、SourceEditor（CodeMirror 6）
  components/   Sidebar、Palette、FindBar、SettingsPanel…
  lib/          commands（快捷鍵註冊表）、settings、markdown 工具、path
  export/       HTML / PDF / Word 匯出（獨立於編輯器，源碼模式也能用）
  styles/       theme.css（三套主題變數）、ui.css、editor.css
```

核心設計：單一文檔模型，Milkdown 在游標所在區塊顯示 Markdown 標記、離開即渲染。
源碼模式是獨立的 CodeMirror 視圖（支援多光標：Alt+點擊、Ctrl/⌘+D、矩形選取）。

## 快捷鍵（Typora 慣用鍵位，完整清單見「偏好設定」）

| 動作 | 快捷鍵 |
| --- | --- |
| 命令面板 / 快速開啟 | Mod+Shift+P / Mod+P |
| 查找 / 替換 | Mod+F / Mod+H |
| 資料夾搜尋 / 大綱 | Mod+Shift+F / Mod+Shift+L |
| 源碼模式 / 側欄 | Mod+/ / Mod+\ |
| 聚焦 / 打字機 | F8 / F9 |
| 標題 1–6 / 正文 | Mod+1…6 / Mod+0 |
| 粗體 / 斜體 / 刪除線 / 行內代碼 | Mod+B / Mod+I / Alt+Shift+5 / Mod+Shift+` |
| 代碼塊 / 公式塊 / 表格 / 引用 | Mod+Shift+K / Mod+Shift+M / Mod+T / Mod+Shift+Q |
| 縮排 / 反縮排（列表內） | Tab / Shift+Tab |
| 主題切換 | Mod+Alt+T |

## 液態玻璃 UI

- `lib/pill.ts`：玻璃膠囊（`usePill`）。切換時朝運動方向拉長 → 彈簧過衝回彈；邊緣有細高光。用於側欄頁籤、設定內分段控制、停靠欄。
- `components/GlassCard.tsx`：磨砂玻璃卡片。游標處徑向光斑、靠近游標的邊框局部提亮、3D 傾斜（≤4°，rAF 插值復原）、Border Beam 邊緣流光。
- `components/ExpandCard.tsx`：點擊按鈕後卡片原位放大成詳情（FLIP + portal），關閉時沿原路收回；Esc 先收詳情。
- `components/Dock.tsx`：底部居中浮動玻璃停靠欄，只放圖標；懸停高斯放大並帶動相鄰圖標，上方顯示名稱與快捷鍵；打字時自動淡出。
- 材質變數集中在 `styles/theme.css`（`--glass-*`、`--rim-*`、`--beam-*`），樣式在 `styles/glass.css`。

## 系統級毛玻璃

- macOS：`vibrancy: 'under-window'`（`visualEffectState: 'active'`，失焦也保持）。
- Windows 11 22H2+（build ≥ 22621）：`backgroundMaterial`，可在「設定 → 外觀」切換亞克力 / 雲母。
- Windows 10、Linux：不支援，自動退回應用內玻璃，設定中的開關會停用。
- 開啟後視窗透明，內容區以「內容區不透明度」鋪主題色保證可讀；主題切換時同步 `nativeTheme.themeSource`，讓材質明暗與 App 一致（跟隨系統時還原）。
- 已知：Windows 亞克力在拖動/縮放視窗時可能略有卡頓，這是系統層行為，可改用雲母。

## 多分頁

- 分頁列在標題欄，當前分頁以玻璃膠囊做底並滑動切換；`+` 新建、`×` 或中鍵關閉，未儲存的分頁顯示圓點。
- 快捷鍵：Mod+W 關閉、Mod+Alt+←/→ 切換、Mod+N 新建。
- 切換時各分頁保留內容與捲動位置；已有路徑且開啟自動儲存時，離開前會先寫入磁碟。
- 同一檔案重複開啟會切到既有分頁；目前是未改動的空白頁時原地替換，不多開分頁。
- 切換分頁會重建編輯器，所以各分頁的復原歷史不保留。

## 大文件效能

- 輸入時不再每次序列化整篇 Markdown：編輯器只發出「有變動」訊號（比對 doc 物件身分，O(1)），防抖後才同步內容並更新字數 / 大綱，延遲隨文件大小在 180ms～1.5s 之間自適應；自動儲存同理。
- 超過 `LARGE_DOC`（15 萬字元）的文件：先顯示載入提示再解析；內容超過約 10 萬字時對離屏區塊啟用 `content-visibility: auto`，瀏覽器跳過看不見區塊的版面與繪製。
- 查找：文件超過約 30 萬節點大小時，輸入期間只映射既有結果而不重掃全文。
- 大綱捲動追蹤改為二分搜尋。
- 取捨：`content-visibility` 會對區塊套用繪製隔離，極少數超出區塊邊界的裝飾（如表格把手）在超大文件中可能被裁切；捲動條長度在區塊第一次進入視野前是估算值。
- 這些都是結構性優化，沒有實測數據；若仍卡頓，請告訴我文件大小與卡頓的操作（輸入 / 捲動 / 開啟），我再針對性處理。

## 打包與自動建置

- 本機：`npm run dist`，輸出到 `dist/`（Windows NSIS、macOS dmg/zip、Linux AppImage，需在對應系統上建置）。
- 圖示：`build/icon.png`（1024×1024），electron-builder 會自動轉成 ico / icns。
- GitHub Actions：`.github/workflows/build.yml`，推送 `v*` 標籤或手動觸發即可在三個系統並行建置，安裝檔在 Actions 的 Artifacts 下載。
- 安裝檔未簽署：Windows 會出現 SmartScreen 警告，macOS 首次開啟需手動放行；正式發佈需自備簽署憑證。
- `package.json` 的 `author` / `homepage` 是佔位值，發佈前請改成你自己的。

## 文件樹

側欄標題列的 + 或右鍵選單可新建、重命名、移到回收桶、在檔案管理器中顯示。

## 已知限制

- 第一次完整跑起來前我無法在沙盒內安裝依賴，所以未做過實機執行，只做了語法檢查與純邏輯測試。
- Crepe 的 `renderPreview`、`proxyDomURL` 等設定名稱依 7.x 文件撰寫；若版本差異導致 Mermaid 預覽或相對路徑圖片不顯示，改這兩處即可。
- Word 匯出：公式以原始碼文字呈現，圖片以替代文字呈現，Mermaid 不會轉圖。
- HTML/PDF 匯出的公式為 MathML（Chromium 原生渲染），Mermaid 會轉為內嵌 SVG，本機圖片會內嵌為 base64。

## 工作狀態與便利功能

- **工作階段還原**：關閉前保存分頁、目前分頁與捲動位置；未命名分頁連內容一起保存。下次啟動自動還原。
- **最近開啟**：`Ctrl/⌘ + Alt + O`，模糊搜尋最近 15 個檔案。
- **外部修改偵測**：視窗取得焦點時比對檔案修改時間。未修改的分頁靜默重新載入，有未儲存更改時先詢問。
- **貼上 HTML → Markdown**：從網頁、Word、Google 文件貼上時自動轉成乾淨的 Markdown（程式碼編輯器與原始碼模式內不轉換）。

## 停靠欄功能面板

| 功能 | 說明 | 快捷鍵 |
| --- | --- | --- |
| 版本時光機 | 每次手動儲存、以及至少相隔 90 秒的自動儲存都會在本機留快照（最多 200 份），用滑桿預覽並還原。還原前會先把目前內容也存一份 | `Mod+Alt+H` |
| 寫作儀表板 | 今日新增字數進度環、連續寫作天數、近 14 天柱狀圖、每日目標 | `Mod+Alt+D` |
| 專注 | 番茄鐘（25/5、50/10、15/3）；雨聲、深沉白噪、咖啡館氛圍音，以 WebAudio 即時合成，不需音訊檔 | `Mod+Alt+P` |
| AI 改寫 | 選取文字後潤色、精簡、擴寫、校對、翻譯或自訂指示；結果確認後才取代。需在偏好設定填入 Anthropic API 金鑰，請求由本機主程序直連 Anthropic | `Mod+Alt+I` |
| 連結 | 文中的 `[[筆記名]]` 以連結樣式標出，`Ctrl/⌘ + 點擊` 開啟（不存在則詢問後建立）；面板列出本文連出與其他筆記的反向連結 | `Mod+Alt+L` |
| 閱讀模式 | 唯讀、隱藏所有介面、頂端顯示閱讀進度，`Esc` 退出 | `Mod+Alt+R` |
| 大綱拖曳排序 | 在側欄大綱拖動標題，整個章節（含子標題）一起移動 | — |
| 墨水漣漪 | 輸入時游標處暈開淡淡的墨，可在偏好設定關閉；系統開啟「減少動態效果」時自動停用 | — |
| 依時段換主題 | 07–17 淺色、17–20 護眼、20–07 深色 | — |
| 分享長圖 | 命令面板 →「匯出為分享長圖」，玻璃卡片外框的 PNG（高度上限 16000 px） | — |

已知限制：版本快照只對已儲存為檔案的文件記錄；調整章節與還原版本會重建編輯器，因此該分頁的復原堆疊會清空；AI 金鑰以明文存在本機 localStorage。
