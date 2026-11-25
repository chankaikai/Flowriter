# LilyPond（```lilypond）

````markdown
```lilypond
\version "2.24.0"
\score {
  \new PianoStaff <<
    \new Staff { \clef treble \key g \major \time 3/4 ( d'4 g' b' ) }
    \new Staff { \clef bass \key g \major g,2 d }
  >>
}
```
````

- 依賴 `@sightread/lilypond-wasm`（0.2.x，套件約 38 MB，內含 LilyPond 2.26 的 WebAssembly 版）。**只有文件裡至少有一個 `lilypond` 圍欄時才開始下載**；沒有的話啟動、開檔、渲染其他譜都不會請求它。
- 整個頁面共用一個編譯器；下載時在該區塊上方顯示「下載排版引擎 已下 / 總共 MB」，之後顯示「正在排版」。
- 防抖 800 ms。編譯一次一個；排隊期間文字又變了，舊的會直接丟掉，編譯中途文字變了，過期結果不會畫到新文字上。
- 以來源文字雜湊做快取（最近 20 份），文字沒變不重編。
- 只輸出 SVG，不嵌 PDF。畫面自動裁掉紙張四周空白，寬度 100%。深色模式反相。
- 編譯失敗時顯示 LilyPond 的 log（含 error 的行排最前，最多 12 行）。
- 只做總譜，沒有聲部切換、沒有播放。
- `\version` 若被這個構建拒絕，改成它支援的版本（範例寫 2.24.0，這個構建是 2.26）。
