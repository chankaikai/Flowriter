# MEI 與 MusicXML（```mei／```xml，Verovio）

用 Verovio 把 MEI 或**未壓縮**的 MusicXML 渲染成 SVG。第一次出現這兩種圍欄時才動態載入 Verovio（WebAssembly，npm 套件約 7 MB 左右），之後所有圍欄共用同一個實例。

## `mei`

````markdown
```mei
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0">
  <meiHead><fileDesc><titleStmt><title>Demo</title></titleStmt></fileDesc></meiHead>
  <music><body><mdiv><score>
    <scoreDef meter.count="4" meter.unit="4"><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2"/></staffGrp></scoreDef>
    <section><measure n="1"><staff n="1"><layer n="1">
      <note pname="c" oct="4" dur="4"/><note pname="d" oct="4" dur="4"/><note pname="e" oct="4" dur="4"/><note pname="f" oct="4" dur="4"/>
    </layer></staff></measure></section>
  </score></mdiv></body></music>
</mei>
```
````

## `xml`（MusicXML，兩個聲部，會出現聲部下拉）

````markdown
```xml
<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Violin</part-name></score-part>
    <score-part id="P2"><part-name>Cello</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><type>half</type></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><type>half</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>
```
````

## 規則

- `xml` 圍欄只有內容含 `<score-partwise>` 或 `<score-timewise>` 時才當譜渲染；其他普通 XML 範例維持一般代碼塊，不會報錯。
- 不支援 `.mxl`（zip 壓縮檔）。貼上壓縮檔內容會顯示一行紅字提示先解壓縮。
- 聲部下拉（總譜＋各聲部）只在偵測到 2 個以上聲部時出現。過濾只動送給 Verovio 的副本，原文不改。選擇綁在這個區塊上，聲部消失就回到總譜。
- 解析失敗時，譜下方顯示 Verovio 回報的第一行訊息。
- 沒有播放功能。深色模式下譜面反相顯示。
