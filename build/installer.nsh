; Flowriter 安裝程式附加設定
; 安裝目錄若沒有以 Flowriter 結尾，electron-builder 會自動補上，所以選 D:\ 會得到 D:\Flowriter
!macro customInstall
  ; 資料資料夾預設在使用者的 AppData；使用者可在「設定 → 資料與維護」改到其他磁碟
!macroend
!macro customUnInstall
  ; 不刪除使用者資料（歷史版本、膠囊、抽屜、音樂）
!macroend
