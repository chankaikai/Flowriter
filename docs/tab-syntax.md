# 吉他六線譜（```tab 與 abc 六線譜）

## 方式一：`tab` 圍欄（alphaTab / alphaTex）

````markdown
```tab
\title "Demo"
.
:4 0.3 2.2 3.1 (0.3 2.2) | r.4 5.3 7.3 -.3 |
```
````

- 音符寫法是 `格.弦`，例如 `5.3` 是第 3 弦第 5 格；弦 1 是最細的高音弦。
- `:4` 之後的音都是四分音符，`:8` 八分，`:16` 十六分。單個音也可寫成 `3.3.8`。
- `(0.3 2.2)` 是和弦，`r.4` 是休止，`-.3` 與同弦前一個音相連，`|` 是小節線。
- 沒有 `\tuning`／`\instrument`／`\staff` 時，渲染會自動補標準調弦 `E4 B3 G3 D3 A2 E2`（只補在給 alphaTab 的副本，不改文件）。
- 完整語法見 alphaTab 的 alphaTex 文件。
- 播放：按「播放」才載入音源與播放器，平常只渲染。

## 方式二：abc 圍欄加六線譜

在 `abc` 圍欄最前面加一行（或按工具列的「六線譜」）：

```
%%abcjs_render_params {"tablature":[{"instrument":"guitar"}]}
```

只接受 `tablature` 這一個鍵：`instrument` 為 `guitar` 或 `violin`，可選 `label`、`tuning`（3–8 個 ABC 音名）、`capo`（0–12）。其他鍵會被拒絕並在譜下顯示一行紅字。
