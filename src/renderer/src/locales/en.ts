/**
 * 補充翻譯：選單項目、功能區按鈕、命令標題與提示。
 * 英文為完整；其他非中文語言查不到時退回英文（外國使用者看英文比看中文有用）。
 * 簡體中文用逐字轉換，不需要另外維護一份表。
 */
export const EN: Record<string, string> = {
  'AI 改寫選取文字': 'AI rewrite selection', '上一個分頁': 'Previous tab', '下一個分頁': 'Next tab', '主題：跟隨系統': 'Theme: follow system',
  '代碼塊': 'Code block', '任務列表': 'Task list', '任務收集': 'Task collection', '保護': 'Protect', '偏好設定': 'Preferences', '備註': 'Note',
  '儲存': 'Save', '全螢幕': 'Full screen', '全選': 'Select all', '分隔線': 'Divider', '切換主題': 'Toggle theme', '切換側邊欄': 'Toggle sidebar',
  '切換源碼模式': 'Toggle source mode', '刪除線': 'Strikethrough', '剪下': 'Cut', '剪貼簿收集': 'Clipboard collection', '匯出': 'Export', '匯出為': 'Export as',
  '匯出為 HTML…': 'Export as HTML…', '匯出為 Markdown…': 'Export as Markdown…', '匯出為 PDF…': 'Export as PDF…', '匯出為 Word…': 'Export as Word…',
  '匯出為分享長圖…': 'Export as share image…', '區塊': 'Blocks', '參考資料抽屜': 'Reference drawer', '另存為…': 'Save as…', '命令面板': 'Command palette',
  '在資料夾中搜尋': 'Search in folder', '執行游標所在的代碼塊（JavaScript／Python）': 'Run code block at cursor (JavaScript/Python)', '字型': 'Font',
  '寫作': 'Writing', '寫作儀表板': 'Writing dashboard', '專注': 'Focus', '尋找': 'Find', '導覽': 'Navigate', '工具': 'Tools', '常用': 'Home', '引用': 'Quote',
  '復原': 'Undo', '快速收集到收件匣…': 'Quick capture to inbox…', '快速開啟檔案': 'Quick open file', '打字機模式': 'Typewriter mode', '接續列表': 'Resume list',
  '提示框：備註': 'Callout: Note', '提示框：提醒': 'Callout: Tip', '提示框：總結': 'Callout: Summary', '提示框：警告': 'Callout: Warning', '提示框：重點': 'Callout: Important',
  '提醒': 'Tip', '插入': 'Insert', '插入 YAML 前置資料': 'Insert YAML front matter', '插入提示框': 'Insert callout', '插入目錄 [TOC]': 'Insert table of contents [TOC]',
  '插入腳註': 'Insert footnote', '插入表格': 'Insert table', '插入連結': 'Insert link', '插入雙語對照': 'Insert bilingual block', '收集與保護': 'Collect & protect',
  '放大字體': 'Increase font size', '數學公式塊': 'Math block', '文A': 'A/文', '文件健檢、排版與文風': 'Document check, layout & style', '文件比對…': 'Compare documents…',
  '斜體': 'Italic', '新建文件': 'New document', '新視窗': 'New window', '時間膠囊與加密抽屜': 'Time capsule & encrypted drawer', '更換文件樹資料夾…': 'Change file-tree folder…',
  '更換資料夾': 'Change folder', '替換': 'Replace', '最近開啟…': 'Recent files…', '有序列表': 'Numbered list', '朗讀校對（選取處或從游標開始）': 'Read aloud to proofread (selection or from cursor)',
  '本地知識雷達': 'Local knowledge radar', '查找': 'Find', '格式': 'Format', '標記目前版本為里程碑…': 'Mark current version as milestone…',
  '標題 1': 'Heading 1', '標題 2': 'Heading 2', '標題 3': 'Heading 3', '標題 4': 'Heading 4', '標題 5': 'Heading 5', '標題 6': 'Heading 6',
  '模式': 'Mode', '檔案': 'File', '檢查更新': 'Check for updates', '檢視': 'View', '正文段落': 'Body paragraph', '歷史與整理': 'History & tidy', '段落': 'Paragraph',
  '氛圍音': 'Ambient sound', '添加接續提示': 'Add resume hint', '添加接續提示（記住目前位置，下次打開時回到這裡）': 'Add resume hint (remember this position and return to it next time)',
  '無序列表': 'Bullet list', '版本時光機': 'Version time machine', '番茄鐘': 'Pomodoro', '移除前置資料': 'Remove front matter', '粗體': 'Bold', '結束': 'Exit',
  '編輯': 'Edit', '縮小字體': 'Decrease font size', '縮放': 'Zoom', '總結': 'Summary', '聚焦模式': 'Focus mode', '行內代碼': 'Inline code',
  '表格依目前欄位升序排序': 'Sort table ascending by this column', '表格依目前欄位降序排序': 'Sort table descending by this column', '表格工具': 'Table tools',
  '複製': 'Copy', '說明': 'Help', '警告': 'Warning', '貼上': 'Paste', '迷你置頂便籤模式': 'Mini always-on-top note mode', '連結與反向連結': 'Links & backlinks',
  '連結與標記': 'Links & marks', '進階': 'Advanced', '重做': 'Redo', '重點': 'Important', '鎖定／解鎖游標所在段落': 'Lock / unlock paragraph at cursor',
  '開啟': 'Open', '開啟收件匣檔案': 'Open inbox file', '開啟文件樹': 'Open file tree', '開啟檔案…': 'Open file…', '開啟資料夾…': 'Open folder…', '閱讀模式': 'Reading mode',
  '關於 Flowiter／說明與回饋': 'About Flowiter / help & feedback', '關閉': 'Close', '關閉分頁': 'Close tab', '關閉文件樹（不關閉已開啟的文件）': 'Close file tree (keeps open documents)',
  '頁邊便條': 'Margin notes', '顯示': 'Show', '顯示大綱': 'Show outline', '顯示文件樹': 'Show file tree', '顯示／隱藏段落權重': 'Show / hide paragraph weight',
  // UI 提示與其他外框文字
  '展開功能區': 'Expand ribbon', '摺疊功能區': 'Collapse ribbon', '摺疊功能區（雙擊分頁也可以）': 'Collapse ribbon (double-click a tab also works)',
  '表格：滑過格子選擇行列數': 'Table: hover the grid to choose rows × columns', '點擊選擇類型': 'click to choose a type',
  '關閉番茄鐘': 'Close Pomodoro', '隱藏代碼': 'Hide code', '顯示代碼': 'Show code',
  '大綱': 'Outline', '文件樹': 'File tree', '儀表板': 'Dashboard', '時光機': 'Time machine', '目錄': 'Contents', '腳註': 'Footnote', '連結': 'Link', '表格': 'Table',
  '公式': 'Math', '前置資料': 'Front matter', '提示框': 'Callout', '清單': 'Lists', '有序清單': 'Numbered list', '無序清單': 'Bullet list', '任務清單': 'Task list',
  '雙語對照': 'Bilingual', '資料夾': 'Folder', '源碼': 'Source', '閱讀': 'Read', '膠囊抽屜': 'Capsule drawer', '知識雷達': 'Knowledge radar', '朗讀校對': 'Read aloud',
  '段落權重': 'Paragraph weight', '段落上鎖': 'Lock paragraph', '段落樣式': 'Paragraph style', '排版檢驗': 'Check & layout', '接續提示': 'Resume hint', '正文': 'Body',
  '文件比對': 'Compare', '全域搜尋': 'Search all', '參考抽屜': 'References', '長圖': 'Share image', '里程碑': 'Milestone', '升序排序': 'Sort ascending', '降序排序': 'Sort descending',
  '迷你便籤': 'Mini note', '跟隨系統': 'Follow system', '打字機': 'Typewriter', '聚焦': 'Focus', '側邊欄': 'Sidebar', '主題': 'Theme', '檢查更新…': 'Check for updates…',
  '快捷鍵與偏好設定…': 'Shortcuts & preferences…', '預覽': 'Preview', '僅源碼': 'Source only', '源碼＋預覽': 'Source + preview', '佈局': 'Layout', '總譜': 'Full score',
  '▶ 播放': '▶ Play', '■ 停止': '■ Stop', '載入音源…': 'Loading sound…', '聲部': 'Part',
  '高音譜號': 'Treble clef', '低音譜號': 'Bass clef', '中音譜號': 'Alto clef', '調號': 'Key', '拍號': 'Time signature', '連音線': 'Slur', '延音線': 'Tie',
  '三連音': 'Triplet', '踏板踩下': 'Pedal down', '踏板抬起': 'Pedal up', '高八度': 'Octave up', '低八度': 'Octave down', '附點': 'Dotted', '八分': 'Eighth',
  '十六分': 'Sixteenth', '延時線': 'Sustain dash', '功能標記': 'Function mark'
}

const SIMP: Record<string, string> = {}
// 繁→簡：只收會出現在介面文字裡的字，漏掉的字會維持繁體（仍可讀）
const T2S_FROM = '啟檔編輯插檢視導覽寫歷與整收護專匯區塊連結記階說復儲開關另為執顯隱縮縮預設體調譜聲總載後選擇類別層項時點擊內並設則備註總結權鎖機議庫窗頁邊便籤閱讀鍵樹資料夾圖兩個來這種還對於從當開關網頁應該請輸確認為產傳歸動態處條無單裡面項們進測試錯誤訊嘗確應驗證覆蓋稱組織變實現畫響優級環繞電腦戶語氣讀聽寫繪點線號碼臺灣當時間經過計劃導引釋義異範圍術語視覺幫助響應稅購買賣價錢銀屬於樣業務'
const T2S_TO = '启档编辑插检视导览写历与整收护专汇区块连结记阶说复储开关另为执显隐缩缩预设体调谱声总载后选择类别层项时点击内并设则备注总结权锁机议库窗页边便签阅读键树资料夹图两个来这种还对于从当开关网页应该请输确认为产传归动态处条无单里面项们进测试错误讯尝确应验证覆盖称组织变实现画响优级环绕电脑户语气读听写绘点线号码台湾当时间经过计划导引释义异范围术语视觉帮助响应税购买卖价钱银属于样业务'
{
  const a = [...T2S_FROM], b = [...T2S_TO]
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) SIMP[a[i]] = b[i]
}
// 逐字轉換前先處理幾個詞，避免「檔案」變「档案」以外的歧義詞
const WORDS: [string, string][] = [['檔案', '文件'], ['游標', '光标'], ['儲存', '保存'], ['程式', '程序'], ['資料夾', '文件夹'], ['源碼', '源码'], ['代碼', '代码'], ['表格', '表格'], ['剪貼簿', '剪贴板'], ['介面', '界面'], ['設定', '设置'], ['預覽', '预览'], ['匯出', '导出'], ['復原', '撤销'], ['重做', '重做'], ['視窗', '窗口'], ['分頁', '标签页'], ['列表', '列表'], ['清單', '清单'], ['便籤', '便签']]
export function toSimplified(zh: string): string {
  let s = zh
  for (const [a, b] of WORDS) s = s.split(a).join(b)
  let out = ''
  for (const ch of s) out += SIMP[ch] ?? ch
  return out
}
