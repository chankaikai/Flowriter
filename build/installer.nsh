; Flowriter 安裝程式附加設定
; 1) 安裝目錄若沒有以 Flowriter 結尾，electron-builder 會自動補上（選 D:\ 得到 D:\Flowriter）
; 2) 多一頁「使用者資料夾」：歷史版本、時間膠囊、加密抽屜、音樂庫、瀏覽器快取都放在這裡，避免佔滿 C 槽
;    選擇結果寫入 %APPDATA%\Flowriter-boot.json，程式啟動時讀取。已經有設定時（升級安裝）略過這一頁。
; 3) 資料夾預設放在安裝目錄「旁邊」（如 D:\FlowriterData），不放在安裝目錄裡，否則解除安裝會一併刪掉。
!include nsDialogs.nsh
!include FileFunc.nsh
!include WordFunc.nsh
!insertmacro GetParent
!insertmacro WordReplace

Var FwDataText
Var FwDataDir

!macro customPageAfterChangeDir
  Function FwDataPre
    IfFileExists "$APPDATA\Flowriter-boot.json" 0 +2
      Abort
    ${GetParent} "$INSTDIR" $0
    StrCmp $0 "" 0 +2
      StrCpy $0 "$INSTDIR"
    StrCpy $FwDataDir "$0\FlowriterData"
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 36u "選擇使用者資料夾。歷史版本、時間膠囊、加密抽屜、音樂庫與快取會放在這裡，不會佔用 C 槽。$\r$\n之後也可以在 設定 → 資料與維護 裡更改。"
    Pop $0
    ${NSD_CreateDirRequest} 0 44u 76% 13u "$FwDataDir"
    Pop $FwDataText
    ${NSD_CreateBrowseButton} 78% 43u 22% 15u "瀏覽..."
    Pop $0
    ${NSD_OnClick} $0 FwDataBrowse
    nsDialogs::Show
  FunctionEnd

  Function FwDataBrowse
    nsDialogs::SelectFolderDialog "選擇使用者資料夾" "$FwDataDir"
    Pop $0
    StrCmp $0 "error" +3
      StrCpy $FwDataDir $0
      ${NSD_SetText} $FwDataText $0
  FunctionEnd

  Function FwDataLeave
    ${NSD_GetText} $FwDataText $FwDataDir
    StrCmp $FwDataDir "" 0 +3
      MessageBox MB_OK|MB_ICONEXCLAMATION "請選擇一個資料夾。"
      Abort
    StrLen $1 "$INSTDIR"
    StrCpy $2 "$FwDataDir" $1
    StrCmp $2 "$INSTDIR" 0 +3
      MessageBox MB_OK|MB_ICONEXCLAMATION "資料夾不能放在程式安裝目錄裡面，否則解除安裝時會被一起刪除。"
      Abort
    ClearErrors
    CreateDirectory "$FwDataDir"
    IfErrors 0 +3
      MessageBox MB_OK|MB_ICONEXCLAMATION "無法建立這個資料夾，請換一個位置。"
      Abort
    ${WordReplace} "$FwDataDir" "\" "/" "+" $3
    FileOpen $4 "$APPDATA\Flowriter-boot.json" w
    FileWrite $4 '{"dataDir":"$3"}'
    FileClose $4
  FunctionEnd

  Page custom FwDataPre FwDataLeave
!macroend

!macro customUnInstall
  ; 不刪除使用者資料（歷史版本、膠囊、抽屜、音樂）
!macroend
