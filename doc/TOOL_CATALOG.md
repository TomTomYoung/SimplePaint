# ツール一覧・実装監査

調査日: 2026-09-13。対象: `master` の `1e80fb0eeca39c3dc53de19e793a072207fe7f51`（キャンバス表示修正まで）。このページはツールの追加仕様ではなく、現在の意図・設定・実装を照合した記録です。今回の変更は文書のみで、下記の不具合を修正したことは意味しません。

マニフェスト登録78件、画面のツールボタン75件（基本10＋その他65件）、登録されているがボタンがないもの3件です。さらに未登録のロープ補正と、本文のない複写スタンプ用ファイルを掲載します。全80項目を個別に記載しています。

名称やコード先頭の共通コメントだけを実装済みの根拠にせず、実行される関数、設定定義、保存先、描画先を確認しています。「実装」はコード経路の説明であり、全ツールの実ブラウザ動作を保証する表記ではありません。個別に実行した確認は末尾の検証記録に限定しています。

## 鉛筆とブラシはどう違うか

現在は両方とも、入力点を丸い線端の直線で結ぶ基本的なラスター描画です。ブラシだけが曲線補間・筆圧・柔らかい筆先を持つ、という差別化は現行コードにはありません。

| 比較 | 鉛筆 `pencil` | ブラシ `brush` |
| --- | --- | --- |
| 既定設定 | 線幅4px・黒・不透明度1 | 同左。ただし設定状態は別々 |
| 押し始め | 長さゼロのパスを `stroke()` | 半径が線幅/2の円を `fill()` |
| 移動 | 前回点と今回点を `lineTo()` | 同左 |
| 座標補正 | x/yに0.01を加算 | x/yに0.5を加算 |
| 線端・結合 | round / round | round / round |
| 筆圧・速度・専用AA制御 | なし | なし |
| 曲線補間 | なし | 旧案がコメントアウトされているだけ |

コード: [makePencil](../src/tools/drawing/pencil.js)、[makeBrush](../src/tools/drawing/brush.js)。ソース比較時は、brush.js 前半のコメントアウトされた旧関数と、後半の有効な関数を区別してください。ピクセル格子に描く専用処理は `pixel-brush`、平滑化処理は `smooth` 等にあります。

## ベクターレイヤーは機能しているか

判定は「レイヤー管理とデータ保存はあるが、編集可能なベクターレイヤーとしての一連の操作は未完成」です。

`＋V` は `HTMLCanvasElement` に `layerType='vector'` と `vectorData` を付けたレイヤーを追加します。鉛筆などに渡す描画先は引き続きそのcanvasの2Dコンテキストなので、ベクターレイヤー上に鉛筆で描いても線は画素になり、制御点データにはなりません。

| 系統 | 制御データの保存先 | 表示・確定経路 | 実装上の制約 |
| --- | --- | --- | --- |
| `＋V` / 編集曲線の転送 | `layer.vectorData.curves` と `store.vectorLayer` | 編集曲線ツールのoverlay、確定ボタンでcanvasへ焼き付け | 保存した曲線をツールに関係なく常時描くレイヤーレンダラーがない |
| `vector-keep` | `store.tools['vector-keep'].vectors` | 直接ラスター描画＋点列保存 | layer.vectorDataともvector-editとも未接続。初期幅がなく、初期状態では画素ゼロ |
| `vectorization` → `vector-edit` | `store.tools.vectorization.vectors` | ベジェ化・制御点編集の後にラスター描画 | 画素のUndoと制御データのUndoが別。旧線を消して置き換える処理も不十分 |
| `vector-tool` | ツール内部model＋`store.tools['vector-tool'].vectors` | overlayと任意のラスタライズ、SVG文字列を返すメソッド | 通常UIなし。通常の画像保存とSVG／onExportは未接続 |

`flattenLayers()` は各レイヤーのcanvasを `drawImage()` で合成するだけで、`vectorData.curves` を描画しません。`Engine.requestRepaint()` が追加描画するのは、現在選んでいるツールの `drawPreview()` です。そのため、曲線をベクターレイヤーにコピーしても、鉛筆へ切り替えると曲線が消え、PNG/JPEG/WebPへの画像保存にも入りません。コピー後に編集曲線へ戻ると、制御データ由来のプレビューは再表示できます。

編集曲線の「ベクターレイヤーに移動」は転送後にツール内データを消すため、現在のツールのプレビューも消えます。「コピー／移動」は新規のベクターレイヤーを作成したり転送先を選んだりするUIではありません。現在選択中のレイヤーがvectorであることを、`PaintApp.setupVectorLayerSync()` 側が前提にしています。

保存データの `curves` は `points / weights / style` だけで、2次ベジェ・3次ベジェ・Bスプライン等を表す種類タグがありません。5種類の編集曲線ツールは同じ配列を自分の曲線として読みます。種類ごとの再描画・混在も未完成です。

| 操作 | 現状 |
| --- | --- |
| ベクターレイヤーの追加・削除・並べ替え | レイヤー管理として実装。構造変更の履歴対象 |
| 非表示・不透明度・合成モード | canvas合成には反映。ツール所有のoverlayには独立した制御が残る |
| 制御点のコピー・保存・復元 | `vectorData` とstoreのスナップショットに保持する経路あり |
| ベクター制御点の編集・転送をUndo | 専用のデータ差分履歴なし。通常ストローク履歴は画素パッチのみ |
| 線色・線幅・破線・線端の変更 | 既定スタイル／曲線スタイルを更新する処理あり。常時描画とは未接続 |
| サイズ変更・反転・切り抜き | 画素は変更するが、ベクター座標を同じ変換で更新する処理なし |
| PNG/JPEG/WebP保存 | レイヤーcanvasのみ合成。未焼き付けの曲線プレビューは対象外 |
| SVG保存 | `vector-tool.exportVectorsToSvg()` はあるが、通常保存UIに入口なし |

根拠: [レイヤー生成・合成](../src/core/layer.js)、[常時描画と画素履歴](../src/core/engine.js)、[ベクター同期・変形](../src/app.js)、[曲線のデータ型](../src/core/vector-layer-state.js)、[編集曲線共通処理](../src/tools/curves/editable_curve_base.js)、[自動保存形式](../src/io/layered-snapshot.js)、[画像書き出し](../src/io/export-actions.js)。旧 [vector-tool-progress_JA.md](../docs/vector-tool-progress_JA.md) はツール単体の進捗記録で、現在の通常UIやベクターレイヤーの完成を示すものではありません。

## 一覧の読み方と共通経路

「意図」は名称・UI説明・実装から読み取れる役割です。「実装」は有効なコードの処理です。「注意点」は意図との食い違い、未接続、未検証を示します。表示名と内部IDは同一とは限りません。

「画面パラメータ」は `toolPropDefs` から照合した専用入力です。基本項目以外は「詳しい設定」の中に入ります。「内部設定」は専用入力がないコード側の既定値です。内部設定をコードで与えられることと、普通の画面から指定できることは別です。UIの範囲と実装内のclamp範囲が違う場合があり、実装側の厳密な制限は各項目のコードリンクにある `getState` 等を参照してください。

座標・太さ・間隔のpxは原則として画像座標です。画面上の見た目はズーム倍率に左右されます。共通パレットは各ツールの `primaryColor` と `palette` に書き込む仕組みです。専用色入力がないツールでも、このパレットで色を渡せる場合があります。設定はツールごとで、鉛筆の色・太さを変えてもブラシへ自動継承しません。

| 調べる対象 | コード |
| --- | --- |
| ボタン名・基本／その他の配置 | [index.html](../index.html) の `data-tool` |
| 登録されるIDとファクトリー | [manifest.js](../src/tools/base/manifest.js) の `DEFAULT_TOOL_MANIFEST` |
| 実際の生成 | [registry.js](../src/tools/base/registry.js) の `instantiateTool`。原則 `entry.factory(store)` |
| パラメータ名・初期値・入力範囲 | [tool-props.js](../src/gui/tool-props.js) の `toolPropDefs` / `computeToolDefaults` |
| 状態の取得 | [store.js](../src/core/store.js) の `getToolState`。UI既定値と各ツールの保存値を合成 |
| 選択・設定とアプリの接続 | [app.js](../src/app.js) の `selectTool` |
| 入力・描画先・履歴 | [engine.js](../src/core/engine.js) の `_bindEvents` / `ctx` / `finishStrokeToHistory` |
| 破線・線端の適用 | [stroke-style.js](../src/utils/stroke-style.js) の `applyStrokeStyle` |

エンジンが渡すイベントは `img / sx / sy / button / detail / shift / ctrl / alt / pressure / pointerId / type` です。元のPointerEvent全部ではありません。`timeStamp` や傾きはこのオブジェクトにありません。速度系で `performance.now()` を使う処理と、実機ペンの傾きに対応する処理を混同しないでください。

`defaultState` に全ツール共通の `brushSize` や `primaryColor` はありません。`toolPropDefs` がなく、ツール本体にもフォールバックがなければ、値は未定義です。「固有の設定はありません（パレットのみ）」という画面文言でも、コードが必要とする幅を供給できていないツールがあります。

ブラシ見本は [brush-preview.js](../src/gui/brush-preview.js) で鉛筆・ブラシ・消しゴムの実際のファクトリーを呼んで描きます。この3種類以外では見本canvasを非表示にします。見本表示だけでは、アプリ上の履歴・保存・レイヤーとの接続までは確認できません。

## 目次

[基本10ツール](#basic) — [鉛筆](#tool-pencil) / [ブラシ](#tool-brush) / [消しゴム](#tool-eraser) / [塗りつぶし](#tool-bucket) / [スポイト](#tool-eyedropper) / [選択](#tool-select-rect) / [直線](#tool-line) / [四角](#tool-rect) / [楕円](#tool-ellipse) / [文字](#tool-text)

[その他の描画ツール](#drawing) — [鉛筆(オフドラッグ)](#tool-pencil-click) / [極細ブラシ](#tool-minimal) / [なめらかブラシ](#tool-smooth) / [補間描画](#tool-freehand) / [補間描画(オフドラッグ)](#tool-freehand-click) / [なめらかな直線](#tool-aa-line-brush) / [ピクセル筆](#tool-pixel-brush) / [ぼかし](#tool-blur-brush) / [縁保持塗り](#tool-edge-aware-paint) / [ノイズ変位](#tool-noise-displaced) / [グラデーションの筆](#tool-gradient-brush) / [斜線の筆](#tool-hatching) / [先読み補正ブラシ](#tool-predictive-brush) / [筆圧・速度で変化](#tool-pvel-map) / [格子に沿う筆](#tool-snap-grid) / [色を重ねるスタンプ](#tool-stamp-blend) / [揺らぎのある線](#tool-stroke-boil) / [対称描画](#tool-symmetry-mirror) / [時間で変化する筆](#tool-time-aware) / [消しゴム(オフドラッグ)](#tool-eraser-click)

[特殊ブラシ](#special) — [質感ブラシ](#tool-texture-brush) / [曲線補間ブラシ](#tool-tess-stroke) / [輪郭補間ブラシ](#tool-sdf-stroke) / [水彩](#tool-watercolor) / [描画後になめらか補正](#tool-preview-refine) / [カリグラフィ](#tool-calligraphy) / [リボン](#tool-ribbon) / [多毛筆](#tool-bristle) / [エアブラシ](#tool-airbrush) / [散布](#tool-scatter) / [スマッジ](#tool-smudge) / [チョーク](#tool-chalk-pastel) / [曲がりに応じた筆](#tool-curvature-adaptive) / [奥行き表現](#tool-depth-aware) / [等間隔スタンプ](#tool-distance-stamped) / [垂れる絵の具](#tool-drip-gravity) / [流れに沿う筆](#tool-flow-guided-brush) / [文字模様の筆](#tool-glyph-brush) / [連続スタンプ](#tool-gpu-instanced-brush) / [粒状の筆](#tool-granulation) / [網点の筆](#tool-halftone-dither) / [光を重ねる筆](#tool-hdr-linear) / [凹凸表現](#tool-height-normal) / [マスクに沿う筆](#tool-mask-driven) / [組み合わせブラシ](#tool-meta-brush) / [画像をゆがめる](#tool-on-image-warp) / [パレット色に置換](#tool-palette-mapped) / [模様の筆](#tool-pattern-art-brush)

[曲線ツール](#curves) — [2次ベジェ](#tool-quad) / [3次ベジェ](#tool-cubic) / [Catmull](#tool-catmull) / [Bスプライン](#tool-bspline) / [NURBS](#tool-nurbs) / [2次ベジェ編集](#tool-quad-edit) / [3次ベジェ編集](#tool-cubic-edit) / [Catmull編集](#tool-catmull-edit) / [Bスプライン編集](#tool-bspline-edit) / [NURBS編集](#tool-nurbs-edit)

[その他の図形](#shapes) — [円弧](#tool-arc) / [扇形](#tool-sector) / [楕円(回転)](#tool-ellipse-2)

[ベクター関連](#vectors) — [編集できる線](#tool-vector-keep) / [ベクタ化](#tool-vectorization) / [ベクタ編集](#tool-vector-edit) / [線を塗りの形に変換](#tool-outline-stroke-fill) / [vector-tool](#tool-vector-tool) / [path-bool](#tool-path-bool)

[互換登録・未登録・未実装](#unavailable) — [select-free](#tool-select-free) / [rope-stabilizer](#tool-rope-stabilizer) / [clone-stamp](#tool-clone-stamp)

<a id="basic"></a>

## 基本10ツール

<a id="tool-pencil"></a>

### 鉛筆 — `pencil`

入口: 基本ツール。意図: 直接的な手描きの線を描く。

実装: 前回点から今回点へ Canvas 2D の moveTo / lineTo / stroke。丸い線端・結合、座標に +0.01。開始時も長さゼロの線を stroke する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `opacity` — 不透明度 | `1`；0.05〜1；刻み0.05 | 線の透け具合を設定します（0.05でほぼ透明〜1で完全不透明）。 |

コード: [src/tools/drawing/pencil.js / makePencil](../src/tools/drawing/pencil.js#L9)。

注意点: ブラシとほぼ同じ直線連結。筆圧・速度・紙の粒子感・鉛筆専用のピクセル描画は実装されていない。

<a id="tool-brush"></a>

### ブラシ — `brush`

入口: 基本ツール。意図: 一般的な手描きのブラシ線を描く。

実装: 開始点は brushSize/2 の円を fill。移動は丸い線端・結合の直線を stroke。座標に +0.5。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `opacity` — 不透明度 | `1`；0.05〜1；刻み0.05 | 線の透け具合を設定します（0.05でほぼ透明〜1で完全不透明）。 |

コード: [src/tools/drawing/brush.js / makeBrush](../src/tools/drawing/brush.js#L124)。

注意点: Catmull–Rom による補間案はコメントアウトされ、現行コードは補間しない。鉛筆と同じ太さ・色・不透明度で、押し始めとサブピクセル位置が主な差。

<a id="tool-eraser"></a>

### 消しゴム — `eraser`

入口: 基本ツール。意図: 触れた部分を透明にする。

実装: destination-out と円スタンプ／線分で選択中レイヤーの画素を消す。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 消し幅 | `4`；1〜64；刻み1 | 消しゴムの太さを 1〜64px で指定します。 |

コード: [src/tools/drawing/eraser.js / makeEraser](../src/tools/drawing/eraser.js#L2)。

注意点: 白を塗る処理ではない。ベクターデータの点や曲線を削除する機能はない。

<a id="tool-bucket"></a>

### 塗りつぶし — `bucket`

入口: 基本ツール。意図: つながった同系色の領域を塗る。

実装: 選択中のcanvasに floodFill を適用し、返された画素パッチを履歴へ入れる。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `primaryColor` — 塗り色 | `#000000` | 塗りつぶしに使用する色を選びます。 |

コード: [src/tools/fill/bucket.js / makeBucket](../src/tools/fill/bucket.js#L5)。

注意点: 色差許容値は16固定、塗布アルファは255固定。許容値・全レイヤー参照の専用設定UIはない。

<a id="tool-eyedropper"></a>

### スポイト — `eyedropper`

入口: 基本ツール。意図: 表示中の画像から色を取る。

実装: 合成画像 bctx の1画素からRGBを取得し、color:picked イベントで前の基本描画ツールへ色を渡して戻る。

画面パラメータ: 専用入力なし。共通パレットのみ。

コード: [src/tools/fill/eyedropper.js / makeEyedropper](../src/tools/fill/eyedropper.js#L5)。

注意点: 透明度は取得しない。すべての特殊ツールへ戻る仕様ではなく、PaintApp.lastDrawingTool の対象は基本の描画ツールに限定。

<a id="tool-select-rect"></a>

### 選択 — `select-rect`

入口: 基本ツール。意図: 四角い範囲を選択し、内容を移動する。

実装: ドラッグで矩形を作り、内側のドラッグで floatCanvas へ切り出して移動する。選択は engine.selection に保持する。

画面パラメータ: 専用入力なし。共通パレットのみ。

コード: [src/tools/selection/select-rect.js / makeSelectRect](../src/tools/selection/select-rect.js#L2)。

注意点: 自由な輪郭の選択ではない。レイヤー／画像全体の処理範囲は編集メニューと各編集処理に依存する。

<a id="tool-line"></a>

### 直線 — `line`

入口: 基本ツール。意図: 始点と終点を結ぶ直線を引く。

実装: makeShape(line) でドラッグ入力を処理し、Shift時は45度刻みに拘束。確定はCanvas 2D。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `antialias` — アンチエイリアス | `false` | 定義はあるが描画には未接続。上記実装と注意点を参照。 |

コード: [src/tools/shapes/shape.js / makeShape](../src/tools/shapes/shape.js#L31)。

注意点: 専用 antialias 値を描画処理が読まない。エンジン側の画像補間設定もストアの別の階層を読む。

<a id="tool-rect"></a>

### 四角 — `rect`

入口: 基本ツール。意図: 四角形・角丸四角形を描く。

実装: makeShape(rect) が角丸半径を辺の半分以下に制限してパスを作り、塗りと輪郭を描く。Shiftで正方形。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `cornerRadius` — 角丸半径 | `0`；0〜256；刻み1 | 矩形の角を丸める半径を指定します。0で直角、数値が大きいほど丸みが増します。 |
| `secondaryColor` — 塗り色 | `#ffffff` | 矩形や楕円の塗りつぶしに使う色を選びます。 |
| `fillOn` — 塗りを有効にする | `true` | オンにすると図形を塗りつぶし、オフで輪郭のみ描画します。 |
| `antialias` — アンチエイリアス | `false` | 定義はあるが描画には未接続。上記実装と注意点を参照。 |

コード: [src/tools/shapes/shape.js / makeShape](../src/tools/shapes/shape.js#L31)。

注意点: 確定後はラスター。antialias 設定は実際の処理と未接続。

<a id="tool-ellipse"></a>

### 楕円 — `ellipse`

入口: 基本ツール。意図: 対角のドラッグで楕円を描く。

実装: makeShape(ellipse) が drawEllipsePath で楕円パスを作り、塗りと輪郭を描く。Shiftで円。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `secondaryColor` — 塗り色 | `#ffffff` | 矩形や楕円の塗りつぶしに使う色を選びます。 |
| `fillOn` — 塗りを有効にする | `true` | オンにすると図形を塗りつぶし、オフで輪郭のみ描画します。 |
| `antialias` — アンチエイリアス | `false` | 定義はあるが描画には未接続。上記実装と注意点を参照。 |

コード: [src/tools/shapes/shape.js / makeShape](../src/tools/shapes/shape.js#L31)。

注意点: 確定後はラスター。antialias 設定は実際の処理と未接続。

<a id="tool-text"></a>

### 文字 — `text`

入口: 基本ツール。意図: 文字を配置する。

実装: DOMテキストエディターを開き、text-editor の確定処理で文字をcanvasへ描画する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | 定義はあるが描画には未接続。上記実装と注意点を参照。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `fontFamily` — フォント | `system-ui, sans-serif`；候補 `system-ui, sans-serif`, `"Noto Sans JP", sans-serif`, `serif`, `monospace` | テキストツールで使用するフォントファミリを選択します。 |
| `fontSize` — サイズ | `24`；8〜200；刻み1 | テキストの文字サイズ（ポイント相当）を 8〜200px で指定します。 |

コード: [src/tools/text/text-tool.js / makeTextTool](../src/tools/text/text-tool.js#L4)。

注意点: 画面に線幅が出るが text-editor は brushSize を使用しない。独立した編集可能なテキストオブジェクトとしての保存ではない。

<a id="drawing"></a>

## その他の描画ツール

<a id="tool-pencil-click"></a>

### 鉛筆(オフドラッグ) — `pencil-click`

入口: その他のツール。意図: ボタンを押し続けずに鉛筆で描く。

実装: 1回目のクリックで開始し、ボタンを離した移動でも描画。2回目のクリックで終了。線の処理は鉛筆と同様。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `opacity` — 不透明度 | `1`；0.05〜1；刻み0.05 | 線の透け具合を設定します（0.05でほぼ透明〜1で完全不透明）。 |

コード: [src/tools/drawing/pencil-click.js / makePencilClick](../src/tools/drawing/pencil-click.js#L10)。

注意点: onPointerUp は空。エンジンは pointerup 単位で履歴を閉じるため、2クリック間を1ストロークとする取り消しの整合性は未確認。cancel もない。

<a id="tool-minimal"></a>

### 極細ブラシ — `minimal`

入口: その他のツール。意図: 軽量な線描画を行う。

実装: 移動区間と離した位置までを lineTo で描く。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅（ミニマル） | `4`；1〜6；刻み1 | 極細線ブラシの太さを 1〜6px で調整します。 |
| `primaryColor` — 線色 | `#000000` | 描画に使用する色を選びます。 |

コード: [src/tools/drawing/minimal.js / makeMinimal](../src/tools/drawing/minimal.js#L2)。

注意点: 画面名は極細ブラシだが既定線幅は4pxで、1px固定ではない。不透明度の設定なし。

<a id="tool-smooth"></a>

### なめらかブラシ — `smooth`

入口: その他のツール。意図: 手の揺れをならした曲線を描く。

実装: buildSmoothPath が EMA → centripetal Catmull–Rom → 距離再サンプルを行い、確定時に円スタンプを置く。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `smoothAlpha` — 滑らかさ | `0.55`；0〜1；刻み0.05 | 定義はあるが描画には未接続。上記実装と注意点を参照。 |
| `spacingRatio` — スタンプ間隔 | `0.4`；0.1〜1；刻み0.05 | 定義はあるが描画には未接続。上記実装と注意点を参照。 |

コード: [src/tools/drawing/smooth.js / makeSmooth](../src/tools/drawing/smooth.js#L2)。

注意点: 画面の smoothAlpha と spacingRatio を描画コードが読まない。実際は EMA=0.3、分割=16、間隔=max(線幅/2,0.5) に固定。

<a id="tool-freehand"></a>

### 補間描画 — `freehand`

入口: その他のツール。意図: ドラッグの点列を補間して描く。

実装: 離したときとプレビューで catmullRomSpline(pts,8) を呼ぶ。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `smoothAlpha` — 滑らかさ | `0.55`；0〜1；刻み0.05 | 定義はあるが描画には未接続。上記実装と注意点を参照。 |
| `spacingRatio` — スタンプ間隔 | `0.4`；0.1〜1；刻み0.05 | 定義はあるが描画には未接続。上記実装と注意点を参照。 |

コード: [src/tools/drawing/freehand.js / makeFreehand](../src/tools/drawing/freehand.js#L2)。

注意点: catmullRomSpline の import／定義がなく ReferenceError を再現。smoothAlpha・spacingRatio も参照しない。

<a id="tool-freehand-click"></a>

### 補間描画(オフドラッグ) — `freehand-click`

入口: その他のツール。意図: クリックで開始／終了する補間描画。

実装: 2クリック間の移動を記録し、2回目で catmullRomSpline(pts,8) に渡す。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `smoothAlpha` — 滑らかさ | `0.55`；0〜1；刻み0.05 | 定義はあるが描画には未接続。上記実装と注意点を参照。 |
| `spacingRatio` — スタンプ間隔 | `0.4`；0.1〜1；刻み0.05 | 定義はあるが描画には未接続。上記実装と注意点を参照。 |

コード: [src/tools/drawing/freehand-click.js / makeFreehandClick](../src/tools/drawing/freehand-click.js#L2)。

注意点: freehand と同じ未定義関数を使用する。smoothAlpha・spacingRatio は参照しない。

<a id="tool-aa-line-brush"></a>

### なめらかな直線 — `aa-line-brush`

入口: その他のツール。意図: 細い線をアンチエイリアス付きで描く。

実装: drawWuSegment が Xiaolin Wu の被覆率を計算し、sRGB を線形化して画素合成する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `opacity` — 不透明度 | `0.8`；0.1〜1；刻み0.05 | アンチエイリアス線の濃さを指定します（0.1〜1）。 |

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `primaryColor` | `#000000` | 描画色 |

コード: [src/tools/drawing/aa_line_brush.js / makeAaLineBrush](../src/tools/drawing/aa_line_brush.js#L2)、[値の変換・clamp: getState](../src/tools/drawing/aa_line_brush.js#L200)。

注意点: 線幅の設定なし。色は内部で primaryColor を読むが専用色入力はない。共通パレット経由では設定できる。

<a id="tool-pixel-brush"></a>

### ピクセル筆 — `pixel-brush`

入口: その他のツール。意図: 整数格子にピクセル／ブロックを描く。

実装: 座標を pixelSize の格子へ量子化し、Bresenham で間を埋めて fillRect。任意パレットへの最近傍色変換も行う。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `pixelSize` — ピクセルサイズ | `1`；1〜32；刻み1 | 描画されるピクセル単位の大きさを 1〜32px で指定します。 |

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `palette` | `null` | 量子化に使う色配列 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/drawing/pixel_brush.js / makePixelBrush](../src/tools/drawing/pixel_brush.js#L2)、[値の変換・clamp: getState](../src/tools/drawing/pixel_brush.js#L156)。

注意点: 通常ブラシの太さとは別の pixelSize を使う。専用色入力はなく共通パレットで primaryColor を変更する。

<a id="tool-blur-brush"></a>

### ぼかし — `blur-brush`

入口: その他のツール。意図: 触れた範囲をぼかす。

実装: 半径3σの領域を読み、分離ガウシアンぼかしと線形色合成を反復する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `sigma` — ぼかし強度 | `3`；0.5〜10；刻み0.5 | ガウシアンぼかしのσ値（0.5〜10）です。大きいほどぼけが広がります。 |
| `iterations` — 反復回数 | `1`；1〜5；刻み1 | 処理を重ねる回数です。増やすと滑らかになりますが処理が重くなります。 |
| `spacingRatio` — スタンプ間隔 | `0.6`；0.1〜1；刻み0.05 | ぼかしスタンプの間隔を調整します（0.1〜1）。 |

コード: [src/tools/drawing/blur_brush.js / makeBlurBrush](../src/tools/drawing/blur_brush.js#L2)、[値の変換・clamp: getState](../src/tools/drawing/blur_brush.js#L235)。

注意点: 色を新規に塗るツールではなく、既存画素に作用する。白紙だけでは効果を判断できない。

<a id="tool-edge-aware-paint"></a>

### 縁保持塗り — `edge-aware-paint`

入口: その他のツール。意図: 画像の境界を越えにくく塗る。

実装: boxGauss3 / sobelEdge / dilate で境界を求め、growRegion で局所領域を選び塗布する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `primaryColor` — 線色 | `#000000` | 塗りつぶす際のベースカラーを選択します。 |
| `tau` — エッジ感度 | `30`；1〜100；刻み1 | エッジ検出の閾値を設定します（1〜100）。低いほど細かな輪郭を検知します。 |
| `radius` — 探索半径 | `16`；1〜64；刻み1 | エッジを探索する半径を 1〜64px で指定します。 |
| `boundaryPad` — 境界余白 | `1`；0〜3；刻み1 | 境界へどれだけ余白を取るかを 0〜3px で調整します。 |
| `strength` — 適用強度 | `0.6`；0〜1；刻み0.05 | 塗りの影響力を 0〜1 で制御します。高いほど輪郭を強く保護します。 |
| `spacingRatio` — スタンプ間隔 | `0.5`；0.1〜1；刻み0.05 | ブラシを打つ頻度を倍率で調整します（0.1〜1）。 |

コード: [src/tools/drawing/edge_aware_paint.js / makeEdgeAwarePaint](../src/tools/drawing/edge_aware_paint.js#L2)、[値の変換・clamp: getState](../src/tools/drawing/edge_aware_paint.js#L295)。

注意点: 画像から推定した局所境界であり、物体を意味的に認識する処理ではない。

<a id="tool-noise-displaced"></a>

### ノイズ変位 — `noise-displaced`

入口: その他のツール。意図: 輪郭が不規則に揺れた線を描く。

実装: 平滑化した中心線を法線方向へ valueNoise1D で変位させ、drawRibbon で塗る。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `ndAmplitude` — 変位振幅 | `2`；0〜6；刻み0.1 | ノイズ変位の強さを 0〜6px で調整します。 |
| `ndFrequency` — 変位周波数 | `0.25`；0.02〜1；刻み0.01 | ノイズの細かさを制御します（0.02〜1）。高いほど細かな揺らぎになります。 |
| `ndSeed` — シード値 | `0`；刻み1 | ノイズパターンを決める乱数シードです。同じ値なら結果が再現されます。 |

コード: [src/tools/drawing/noise-displaced.js / makeNoiseDisplaced](../src/tools/drawing/noise-displaced.js#L2)。

注意点: ndSeed にストローク連番を XOR するため、同じ設定でも連続する線は同形にならない。

<a id="tool-gradient-brush"></a>

### グラデーションの筆 — `gradient-brush`

入口: その他のツール。意図: 線に沿って色と透明度を変化させる。

実装: 経路を平滑化・再サンプルし、gradientStops と radialStops を評価して線形色空間でスタンプ合成する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `16` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `easing` | `linear` | 線に沿うグラデーションの進行関数 |
| `gradientStops` | `null` | 経路方向の色・透明度の制御点配列 |
| `radialStops` | `null` | 半径方向の色・透明度の制御点配列 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/drawing/gradient_brush.js / makeGradientBrush](../src/tools/drawing/gradient_brush.js#L2)、[値の変換・clamp: getState](../src/tools/drawing/gradient_brush.js#L267)。

注意点: 画面にグラデーション点・イージングの入力がない。内部設定を与えない状態では用意された既定の表現に限られる。

<a id="tool-hatching"></a>

### 斜線の筆 — `hatching`

入口: その他のツール。意図: ストロークの範囲を斜線や交差線で埋める。

実装: オフスクリーンに平行線を引き、ストローク形状で destination-in マスクする。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `未設定→実効0.1` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |
| `hatchAngles` | `null` | ハッチ方向の配列（度） |
| `crosshatch` | `false` | 0・45・90・135度の交差ハッチ |
| `hatchAngle` | `0` | 単一ハッチの角度（度） |
| `hatchDensity` | `0.5` | ハッチの密度。線間隔12〜4pxへ変換 |
| `hatchSpacing` | `未指定→密度から計算（初期8px）` | 線間隔を明示する値（px） |
| `hatchWidth` | `1` | ハッチ自体の線幅（0.5〜4px） |

コード: [src/tools/drawing/hatching.js / makeHatching](../src/tools/drawing/hatching.js#L2)。

注意点: 専用設定が未定義。brushSize 未設定時は0.1へ落ち、線の領域が極端に細くなる。

<a id="tool-predictive-brush"></a>

### 先読み補正ブラシ — `predictive-brush`

入口: その他のツール。意図: 入力の遅れを予測表示で補う。

実装: alphaBetaUpdate / gainsFromQR で位置・速度を推定し、extrapolate で先の点を作る。確定側は記録点列を整形する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `14` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `qOverR` | `1` | 予測用αβフィルターの追従性を決める比 |
| `horizonMs` | `12` | 予測する時間（ms） |
| `hysteresis` | `0.6` | 予測位置をなだらかにする係数 |
| `maxExtrapRatio` | `1.5` | 線幅に対する最大外挿距離の比 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/drawing/predictive_brush.js / makePredictiveBrush](../src/tools/drawing/predictive_brush.js#L2)、[値の変換・clamp: getState](../src/tools/drawing/predictive_brush.js#L201)。

注意点: qOverR は αβ フィルターのゲイン計算に用いる値で、完全なカルマンフィルターの共分散更新ではない。専用設定UIなし。

<a id="tool-pvel-map"></a>

### 筆圧・速度で変化 — `pvel-map`

入口: その他のツール。意図: 筆圧と描画速度で太さを変える。

実装: readPressure と速度を EMA でならし、computeWidthScale の混合値で円スタンプの大きさを変える。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `18` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000000` | 描画色 |
| `alpha` | `1` | 合成アルファ |
| `aWeight` | `0.6` | 筆圧の混合重み |
| `bWeight` | `0.4` | 速度の混合重み |
| `pressureGamma` | `1` | 筆圧応答の指数 |
| `velocityMode` | `inv1p` | 速度応答の関数（inv1p / log） |
| `velK` | `1` | 速度応答の係数 |
| `speedRef` | `900` | 速度を正規化する基準（px/s） |
| `widthRange` | `0.2` | 線幅の変動幅の比 |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `emaP` | `0.5` | 筆圧の指数移動平均係数 |
| `emaV` | `0.35` | 速度の指数移動平均係数 |

コード: [src/tools/drawing/pressure_velocity_map_brush.js / makePressureVelocityMapBrush](../src/tools/drawing/pressure_velocity_map_brush.js#L25)、[値の変換・clamp: getState](../src/tools/drawing/pressure_velocity_map_brush.js#L212)。

注意点: 筆圧は ev.pressure を使用する。マウスでの値とペン入力の実測感度は別途確認が必要。専用設定UIなし。

<a id="tool-snap-grid"></a>

### 格子に沿う筆 — `snap-grid`

入口: その他のツール。意図: 線を格子・角度・既存点に吸着させる。

実装: applySnap がグリッド、角度刻み、getVertexPool の候補を比較し、強度で補正位置を混合する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `12` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |
| `gridSize` | `16` | 格子の間隔（px） |
| `angleStepDeg` | `15` | 角度の刻み（度） |
| `snapRadius` | `8` | 吸着候補を探す半径（px） |
| `snapStrength` | `1` | 元座標から吸着先へ寄せる強度 |
| `enableGrid` | `true` | グリッド吸着の有効化 |
| `enableAngle` | `true` | 角度吸着の有効化 |
| `enableVertex` | `true` | 既存頂点への吸着の有効化 |
| `minSampleDist` | `0.5` | 点を追加する最小距離（px） |

コード: [src/tools/drawing/snap_grid_brush.js / makeSnapGridBrush](../src/tools/drawing/snap_grid_brush.js#L26)、[値の変換・clamp: getState](../src/tools/drawing/snap_grid_brush.js#L262)。

注意点: 専用設定UIなし。既存点はコードが参照する頂点プールの範囲で、すべてのレイヤー形状を自動認識するわけではない。

<a id="tool-stamp-blend"></a>

### 色を重ねるスタンプ — `stamp-blend`

入口: その他のツール。意図: 乗算や加算などでスタンプを重ねる。

実装: 通常経路では Canvas の合成モード、linear 経路では画素を線形化して手動合成する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `18` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000000` | 描画色 |
| `alpha` | `1` | 合成アルファ |
| `mode` | `normal` | このツール内の処理方式。本文とgetStateの分岐を参照 |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `linear` | `false` | 線形色空間での手動合成 |

コード: [src/tools/drawing/stamp_blend_modes_brush.js / makeStampBlendModesBrush](../src/tools/drawing/stamp_blend_modes_brush.js#L19)、[値の変換・clamp: getState](../src/tools/drawing/stamp_blend_modes_brush.js#L247)。

注意点: 専用設定UIなし。未設定では mode=normal、linear=false で通常の円スタンプになる。

<a id="tool-stroke-boil"></a>

### 揺らぎのある線 — `stroke-boil`

入口: その他のツール。意図: 線を時間とともに揺らす。

実装: 点列を tools[stroke-boil].strokes に保持し、requestAnimationFrame のループで座標と幅に乱数を加えて描き直す。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `alpha` — 透明度 | `1`；0.1〜1；刻み0.05 | ストローク全体の不透明度を設定します。 |
| `amplitude` — 揺らぎ振幅 | `1`；0.1〜3；刻み0.1 | 線を揺らす振幅（px）です。大きいほど変形が大きくなります。 |
| `widthJitter` — 幅ゆらぎ | `0.15`；0〜0.35；刻み0.01 | 線幅をどれだけランダムに変化させるかを割合で指定します。 |
| `boilStep` — 更新間隔 | `1`；候補 `1`, `2` | 揺らぎを更新する頻度です。隔フレームにすると動きが緩やかになります。 |
| `spacingRatio` — スタンプ間隔 | `0.5`；0.1〜1；刻み0.05 | 入力点列をどれだけ間引くかをブラシ幅に対する倍率で指定します。 |
| `minSampleDist` — 最小サンプル距離 | `0.5`；0.1〜5；刻み0.1 | 新しい点を追加する最小距離（px）です。 |

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `seedBase` | `起動時の乱数` | 線ごとの乱数の基準種 |

コード: [src/tools/drawing/stroke_boil_brush.js / makeStrokeBoilBrush](../src/tools/drawing/stroke_boil_brush.js#L31)、[値の変換・clamp: getState](../src/tools/drawing/stroke_boil_brush.js#L264)。

注意点: 時間変化する内部データと通常の静止画履歴は別系統。取り消し・ツール切替・復元後のループ整合性は未検証。

<a id="tool-symmetry-mirror"></a>

### 対称描画 — `symmetry-mirror`

入口: その他のツール。意図: 回転対称・鏡映対称の線を描く。

実装: 中心点から n 回転と任意の鏡映を作り、変換した経路をリボンとして描く。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `12` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `n` | `6` | 回転対称の分割数 |
| `mode` | `dihedral` | このツール内の処理方式。本文とgetStateの分岐を参照 |
| `reflect` | `true` | 鏡映を追加するか |
| `axisAngle` | `0` | 対称軸の基準角度（度） |
| `center` | `null` | 対称描画の中心座標オブジェクト |
| `centerX` | `未指定` | 対称中心のX座標 |
| `centerY` | `未指定` | 対称中心のY座標 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/drawing/symmetry_mirror.js / makeSymmetryMirror](../src/tools/drawing/symmetry_mirror.js#L2)、[値の変換・clamp: getState](../src/tools/drawing/symmetry_mirror.js#L213)。

注意点: 専用設定UIなし。既定は6回転の鏡映あり。中心指定は内部値に依存する。

<a id="tool-time-aware"></a>

### 時間で変化する筆 — `time-aware`

入口: その他のツール。意図: 速度や停止時間に応じて線幅とにじみを変える。

実装: 移動イベントの時間差から速度を計算し、factorsFromSpeed と追加スタンプで変化を付ける。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `18` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000000` | 描画色 |
| `alpha` | `1` | 合成アルファ |
| `stopThresholdMs` | `90` | 停止判定の時間（ms） |
| `speedGamma` | `0.7` | 速度と線幅の応答指数 |
| `widthRange` | `0.2` | 線幅の変動幅の比 |
| `speedRef` | `900` | 速度を正規化する基準（px/s） |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `dwellSpeed` | `12` | 滞留と判断する速度（px/s） |
| `bleedStrength` | `0.2` | 滞留時の追加塗布の強さ |

コード: [src/tools/drawing/time_aware_brush.js / makeTimeAwareBrush](../src/tools/drawing/time_aware_brush.js#L21)、[値の変換・clamp: getState](../src/tools/drawing/time_aware_brush.js#L213)。

注意点: 描画はポインタイベント駆動で、完全静止中もタイマーで連続してにじませる実装ではない。専用設定UIなし。

<a id="tool-eraser-click"></a>

### 消しゴム(オフドラッグ) — `eraser-click`

入口: その他のツール。意図: クリックで開始／終了する消しゴム。

実装: 描画中フラグをクリックで切り替え、destination-out で消去する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 消し幅 | `4`；1〜64；刻み1 | クリック単位で削除する円の直径を決めます。 |

コード: [src/tools/drawing/eraser-click.js / makeEraserClick](../src/tools/drawing/eraser-click.js#L2)。

注意点: 2クリック間の履歴のまとまりは未検証。ベクターの制御データは消去しない。

<a id="special"></a>

## 特殊ブラシ

<a id="tool-texture-brush"></a>

### 質感ブラシ — `texture-brush`

入口: その他のツール。意図: 粒のあるブラシ先端を散らして描く。

実装: 64×64のランダム透明度マスクを生成し、色別キャッシュを作って回転・散布しながらスタンプする。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `spacingRatio` — スタンプ間隔 | `0.4`；0.1〜1；刻み0.05 | テクスチャスタンプの間隔を倍率で調整します（0.1〜1）。低いほど密に押されます。 |

コード: [src/tools/special/texture-brush.js / makeTextureBrush](../src/tools/special/texture-brush.js#L2)。

注意点: 外部テクスチャ選択UIはない。マスクと散布に Math.random を使うため毎回同じ形にはならない。

<a id="tool-tess-stroke"></a>

### 曲線補間ブラシ — `tess-stroke`

入口: その他のツール。意図: 線の輪郭を面として構成する。

実装: 確定時に中心線の両側へ法線オフセットした多角形と丸い端を塗る。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |

コード: [src/tools/special/tessellated-stroke.js / makeTessellatedStroke](../src/tools/special/tessellated-stroke.js#L2)。

注意点: 画面名の曲線補間ブラシに反して曲線補間は行わず、入力折れ線の簡易テッセレーション。途中の描画プレビューはない。

<a id="tool-sdf-stroke"></a>

### 輪郭補間ブラシ — `sdf-stroke`

入口: その他のツール。意図: 線分からの距離で滑らかな輪郭を描く。

実装: drawSegment が pointSegmentDistance から被覆率を計算し、画素を合成する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `未設定→実効0` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `未設定` | 描画色 |

コード: [src/tools/special/sdf-stroke.js / makeSdfStroke](../src/tools/special/sdf-stroke.js#L2)。

注意点: 専用設定UIも既定 brushSize もない。size=0 で早期終了し、初期状態で描画されないことを確認。

<a id="tool-watercolor"></a>

### 水彩 — `watercolor`

入口: その他のツール。意図: 湿った絵の具の拡散と乾燥を表現する。

実装: wetCanvas と absorbCanvas に描き、step が拡散・蒸発・吸収をフレームごとに進める。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `diffusion` — 拡散量 | `0.1`；0.05〜0.2；刻み0.01 | 水彩の滲みの広がりを指定します（0.05〜0.20）。大きいほどぼんやり広がります。 |
| `evaporation` — 蒸発速度 | `0.02`；0.01〜0.05；刻み0.01 | 水分が乾く速さを制御します（0.01〜0.05）。高いほど乾きが速く濃く残ります。 |

コード: [src/tools/special/watercolor.js / makeWatercolor](../src/tools/special/watercolor.js#L3)。

注意点: 物理風のラスタ処理。乾燥終了までの非同期更新と履歴・レイヤー切替の組合せは未検証。

<a id="tool-preview-refine"></a>

### 描画後になめらか補正 — `preview-refine`

入口: その他のツール。意図: 描画中は軽く表示し、離した後に線をならす。

実装: 途中は折れ線、確定時に EMA=0.5 → Catmull–Rom → 再サンプルした円スタンプ列にする。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `未設定→実効0` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/preview-refine.js / makePreviewRefine](../src/tools/special/preview-refine.js#L3)。

注意点: 専用設定UIも既定 brushSize もなく、確定時 size=0 で終了する。プレビューだけ見えて確定画素が残らない可能性がある。

<a id="tool-calligraphy"></a>

### カリグラフィ — `calligraphy`

入口: その他のツール。意図: 斜めの平たいペン先で字を書く。

実装: penAngle で回転した楕円スタンプを距離に応じて配置する。kappa が長短軸比、w_min が短半径の下限。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | UIは幅／短径と説明するが、実装では楕円の短半径として使う。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `penAngle` — ペン角度 | `45`；0〜180；刻み1 | ペン先の回転角度を 0〜180° で指定します。傾きを変えると太さの出方が変化します。 |
| `kappa` — 長短径比 | `2`；1.5〜3；刻み0.1 | 筆先の長径と短径の比率を設定します。値が高いほど楕円が細長くなります。 |
| `w_min` — 最小幅 | `1`；1〜64；刻み1 | UIは幅／短径と説明するが、実装では楕円の短半径として使う。 |

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `spacingRatio` | `0.4` | 筆幅または半径に対するスタンプ間隔の比 |

コード: [src/tools/special/calligraphy.js / makeCalligraphy](../src/tools/special/calligraphy.js#L2)。

注意点: brushSize は実装上の短半径に使われ、表示名の線幅と実寸の意味が異なる。

<a id="tool-ribbon"></a>

### リボン — `ribbon`

入口: その他のツール。意図: 帯状の線を描く。

実装: 入力を距離再サンプルし、接線から求めた法線の左右をつないで帯を塗る。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `未設定→実効4（4〜16に制限）` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/ribbon.js / makeRibbon](../src/tools/special/ribbon.js#L2)。

注意点: 専用設定UIなし。幅の補正は clampWidth に依存し、テクスチャ付きのリボンではない。

<a id="tool-bristle"></a>

### 多毛筆 — `bristle`

入口: その他のツール。意図: 複数の毛を持つ筆の線を描く。

実装: 毛ごとに正規乱数の位置・太さを持たせ、同じ動きの細い線を複数描く。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 束の幅 | `8`；1〜64；刻み1 | ブラシ全体の太さを 1〜64px で調整します。 |
| `count` — 毛の本数 | `8`；4〜12；刻み1 | スタンプ内の毛束の本数を設定します。多いほど密で滑らかになります。 |

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `primaryColor` | `未設定` | 描画色 |

コード: [src/tools/special/bristle.js / makeBristle](../src/tools/special/bristle.js#L3)。

注意点: primaryColor を読むが専用色入力なし。共通パレットを使う。毛先形状の編集機能はない。

<a id="tool-airbrush"></a>

### エアブラシ — `airbrush`

入口: その他のツール。意図: 細かな絵の具を吹き付ける。

実装: spray が1回50粒を半径内に配置し、中心からの距離で透明度を落とす。移動のサンプル間隔は4px。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `未設定` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `未設定` | 描画色 |

コード: [src/tools/special/airbrush.js / makeAirbrush](../src/tools/special/airbrush.js#L2)。

注意点: 専用設定UIも brushSize の既定値もなく、半径が未定義のまま計算される。通常UIからの初期動作は要修正。停止中に吹き続けるタイマーもない。

<a id="tool-scatter"></a>

### 散布 — `scatter`

入口: その他のツール。意図: 大きさや角度の違うスタンプを散らす。

実装: 確率・間隔・拡大率・回転・位置ずれを乱数で決めて stamp を置く。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |

コード: [src/tools/special/scatter.js / makeScatter](../src/tools/special/scatter.js#L2)。

注意点: 散布量等はコード内の固定範囲。画面で変更できるのは太さと色。

<a id="tool-smudge"></a>

### スマッジ — `smudge`

入口: その他のツール。意図: 画像の色を引きずって混ぜる。

実装: smudgeStamp が近傍画素を双線形サンプルし、接線または指定角度方向へ混合する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `radius` — ぼかし半径 | `16`；1〜64；刻み1 | 周囲から色を引き延ばす半径を 1〜64px で指定します。大きいほど広範囲を混ぜます。 |
| `strength` — 混ざり強度 | `0.5`；0〜1；刻み0.05 | ドラッグした方向へどれだけ色を引きずるかを 0〜1 で制御します。 |
| `dirMode` — 方向モード | `tangent`；候補 `tangent`, `angle` | ストローク方向に従うか、角度を固定するかを選びます。 |
| `angle` — 固定角度 | `0`；-180〜180；刻み1 | 方向モードが角度指定のときに使用する角度を −180〜180° で設定します。 |
| `spacingRatio` — サンプル間隔 | `0.5`；0.1〜1；刻み0.05 | ストローク中のサンプリング間隔を倍率で調整します（0.1〜1）。 |

コード: [src/tools/special/smudge.js / makeSmudge](../src/tools/special/smudge.js#L2)、[値の変換・clamp: getState](../src/tools/special/smudge.js#L200)。

注意点: 既存画素に作用し、白紙上では見た目の変化がない。

<a id="tool-chalk-pastel"></a>

### チョーク — `chalk-pastel`

入口: その他のツール。意図: 紙目の残るチョークの線を描く。

実装: ノイズから紙の凹凸を作り、samplePaper と不透明度の揺らぎを線形色合成へ反映する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `16` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `paperScale` | `1.3` | 内部の紙目ノイズのスケール |
| `opacityJitter` | `0.2` | 不透明度の乱数変動幅 |
| `spacingRatio` | `0.45` | 筆幅または半径に対するスタンプ間隔の比 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/chalk_pastel.js / makeChalkPastel](../src/tools/special/chalk_pastel.js#L2)、[値の変換・clamp: getState](../src/tools/special/chalk_pastel.js#L256)。

注意点: 紙画像を読み込むUIではなく内部生成の紙目。専用設定UIなし。

<a id="tool-curvature-adaptive"></a>

### 曲がりに応じた筆 — `curvature-adaptive`

入口: その他のツール。意図: 曲がり具合に合わせてスタンプ密度を変える。

実装: 曲率を推定・安定化し、resampleByCurvature で直線は疎、急な曲がりは密に再サンプルする。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `14` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `dsMinRatio` | `0.3333333333333333` | 線幅に対する最小サンプル間隔 |
| `dsMaxRatio` | `1` | 線幅に対する最大サンプル間隔 |
| `curvatureScale` | `18` | 曲率をサンプル密度へ変換する係数 |
| `kappaAlpha` | `0.35` | 曲率の平滑化係数 |
| `dsSmooth` | `0.5` | サンプル間隔変化の平滑化係数 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/curvature_adaptive_brush.js / makeCurvatureAdaptiveBrush](../src/tools/special/curvature_adaptive_brush.js#L2)、[値の変換・clamp: getState](../src/tools/special/curvature_adaptive_brush.js#L361)。

注意点: 専用設定UIなし。筆圧を直接使って太さを変える機能ではない。

<a id="tool-depth-aware"></a>

### 奥行き表現 — `depth-aware`

入口: その他のツール。意図: 深度やステンシルに応じて塗布を制限する。

実装: 深度比較 less / lequal とステンシル判定で画素を選び、任意で深度を書き戻す。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `18` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000000` | 描画色 |
| `alpha` | `1` | 合成アルファ |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `depthBuffer` | `null` | 背景深度の数値バッファ |
| `depthImage` | `null` | 背景深度を供給する画像 |
| `brushDepth` | `0` | 塗布側の深度 |
| `brushDepthImage` | `null` | 塗布側の深度画像 |
| `depthCompare` | `lequal` | 深度比較方式（less / lequal） |
| `writeDepth` | `false` | 通過した画素の深度を書き戻すか |
| `stencilBuffer` | `null` | ステンシルの数値バッファ |
| `stencilImage` | `null` | ステンシル画像 |
| `stencilThreshold` | `0.5` | ステンシルのしきい値 |
| `depthVersion` | `0` | 深度キャッシュの更新番号 |
| `stencilVersion` | `0` | ステンシルキャッシュの更新番号 |

コード: [src/tools/special/depth_aware_brush.js / makeDepthAwareBrush](../src/tools/special/depth_aware_brush.js#L30)、[値の変換・clamp: getState](../src/tools/special/depth_aware_brush.js#L399)。

注意点: 深度・ステンシルを供給する画面や3Dシーンとの接続なし。マップなしの既定状態だけで奥行き表現が得られるとは限らない。

<a id="tool-distance-stamped"></a>

### 等間隔スタンプ — `distance-stamped`

入口: その他のツール。意図: 速度によらず等間隔にスタンプを置く。

実装: 移動距離の残りを持ち越し、computeSpacing の間隔ごとに stampCircle を置く。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `14` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `dsRatio` | `0.5` | 線幅に対する基本サンプル間隔 |
| `dsMinFactor` | `0.3333333333333333` | 線幅に対するサンプル間隔の下限比 |
| `dsMaxFactor` | `1.25` | 線幅に対するサンプル間隔の上限比 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/distance_stamped_brush.js / makeDistanceStampedBrush](../src/tools/special/distance_stamped_brush.js#L2)、[値の変換・clamp: getState](../src/tools/special/distance_stamped_brush.js#L135)。

注意点: 専用設定UIなし。任意画像スタンプの読込機能ではない。

<a id="tool-drip-gravity"></a>

### 垂れる絵の具 — `drip-gravity`

入口: その他のツール。意図: 重力で垂れる絵の具を表現する。

実装: spawnDrop で滴を作り、step が重力・粘性・蒸発を更新して軌跡を描く。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `16` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |
| `gravity` | `9.8` | 滴に加える重力加速度 |
| `pixelsPerMeter` | `100` | 物理距離から画像座標への換算係数 |
| `viscosity` | `0.25` | 滴の速度の減衰係数 |
| `evaporation` | `0.02` | 蒸発・乾燥速度。時間単位はツールのstep処理を参照 |
| `directionDeg` | `90` | 重力の向き（度） |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `opacity` | `1` | 不透明度 |

コード: [src/tools/special/drip_gravity_brush.js / makeDripGravityBrush](../src/tools/special/drip_gravity_brush.js#L22)、[値の変換・clamp: getState](../src/tools/special/drip_gravity_brush.js#L232)。

注意点: 非同期アニメーションと履歴・レイヤー切替の整合性は未検証。専用設定UIなし。

<a id="tool-flow-guided-brush"></a>

### 流れに沿う筆 — `flow-guided-brush`

入口: その他のツール。意図: 下絵の流れに沿って筆跡の向きを変える。

実装: getFlowAngle が局所画素から方向を推定し、mixAngles が入力の接線と混合して線状スタンプを置く。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `16` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `lambda` | `0.5` | 入力接線と画像方向場の混合率 |
| `fieldUpdateMs` | `16` | 方向場を再計算する間隔（ms） |
| `fieldRadiusScale` | `1.5` | 筆幅に対する方向解析窓の倍率 |
| `dabLengthRatio` | `1` | 筆幅に対する線状スタンプの長さ |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/flow_guided_brush.js / makeFlowGuidedBrush](../src/tools/special/flow_guided_brush.js#L2)、[値の変換・clamp: getState](../src/tools/special/flow_guided_brush.js#L237)。

注意点: 画像からの数値的な方向推定。専用設定UIなし。

<a id="tool-glyph-brush"></a>

### 文字模様の筆 — `glyph-brush`

入口: その他のツール。意図: 線に沿って文字や画像を並べる。

実装: 文字の送り幅または固定間隔で placeOneGlyph を配置し、接線へ回転する。文字描画と画像スタンプの分岐がある。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `24` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000000` | 描画色 |
| `alpha` | `1` | 合成アルファ |
| `rotateToTangent` | `true` | 接線方向へ文字・画像を回転するか |
| `kerningRatio` | `0` | 文字間の補正比 |
| `spacingMode` | `auto` | 文字送り幅または固定間隔 |
| `spacingPx` | `24` | 固定モードの間隔（px） |
| `scale` | `1` | 文字・画像スタンプの拡大率 |
| `minScale` | `0.6` | 拡大率の下限 |
| `glyphText` | `Sample` | 繰り返して配置する文字列 |
| `fontFamily` | `sans-serif` | 使用フォント |
| `fontWeight` | `normal` | フォントの太さ |
| `glyphImage` | `null` | 単一の画像スタンプ |
| `glyphImages` | `null` | 画像スタンプ配列 |
| `imageTint` | `null` | 画像に適用する着色 |
| `minSampleDist` | `0.5` | 点を追加する最小距離（px） |

コード: [src/tools/special/glyph_brush.js / makeGlyphBrush](../src/tools/special/glyph_brush.js#L33)、[値の変換・clamp: getState](../src/tools/special/glyph_brush.js#L343)。

注意点: 専用設定UIなし。既定文字列は Sample。任意文字や画像を指定する通常画面の入口はない。

<a id="tool-gpu-instanced-brush"></a>

### 連続スタンプ — `gpu-instanced-brush`

入口: その他のツール。意図: GPUで多数のスタンプをまとめて描く。

実装: makeGpuInstancedStamps に WebGL2 の実装があり、ツール側は注入された gpu の beginFrame / pushStamp / endFrame を呼ぶ。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `24` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `opacity` | `1` | 不透明度 |
| `atlasUv` | `{"u0":0,"v0":0,"u1":1,"v1":1}` | GPUテクスチャ内の領域（正規化UV） |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/gpu_instanced_stamps.js / makeGpuInstancedStampBrush](../src/tools/special/gpu_instanced_stamps.js#L375)、[値の変換・clamp: getState](../src/tools/special/gpu_instanced_stamps.js#L505)。

注意点: registry は factory(store) しか渡さず gpu が未注入。onPointerDown は即returnし、通常画面の連続スタンプは描画しないことを確認。

<a id="tool-granulation"></a>

### 粒状の筆 — `granulation`

入口: その他のツール。意図: 乾燥時に顔料の粒が沈着する表現を作る。

実装: 顔料・流れ・沈積用バッファを持ち、step で拡散、乾燥、沈積、粒状による減光を更新する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `18` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#2040ff` | 描画色 |
| `diffusion` | `0.1` | 顔料の拡散係数 |
| `evaporation` | `0.015` | 蒸発・乾燥速度。時間単位はツールのstep処理を参照 |
| `grainSize` | `1` | 顔料の粒径（px） |
| `depositRate` | `0.02` | 顔料の沈積率 |
| `flowTau` | `0.05` | 沈積判定に使う流速しきい値 |
| `grainStrength` | `0.35` | 粒状による色の減光強度 |
| `pad` | `3` | 処理範囲に足す余白（px） |

コード: [src/tools/special/granulation_brush.js / makeGranulationBrush](../src/tools/special/granulation_brush.js#L13)、[値の変換・clamp: getState](../src/tools/special/granulation_brush.js#L290)。

注意点: 専用設定UIなし。非同期処理の履歴・保存・レイヤー切替の整合性は未検証。

<a id="tool-halftone-dither"></a>

### 網点の筆 — `halftone-dither`

入口: その他のツール。意図: 濃淡を網点に変換して描く。

実装: 局所輝度、スクリーン角、しきい値行列から点の被覆を決めて合成する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `24` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000000` | 描画色 |
| `opacity` | `1` | 不透明度 |
| `dotDiameter` | `4` | 網点の直径（px） |
| `pitch` | `0` | 網点の間隔。0は直径の2倍に自動設定 |
| `angleDeg` | `15` | 網点スクリーンの角度（度） |
| `matrixKind` | `bayer` | しきい値行列の種類（bayer / blue） |
| `matrixSize` | `8` | 行列サイズ（8 / 16） |
| `useSourceLuma` | `true` | 元画像の輝度を網点密度に使うか |
| `jitter` | `0.15` | 網点位置の揺らぎ |

コード: [src/tools/special/halftone_dither_brush.js / makeHalftoneDitherBrush](../src/tools/special/halftone_dither_brush.js#L21)、[値の変換・clamp: getState](../src/tools/special/halftone_dither_brush.js#L305)。

注意点: 既定は useSourceLuma=true。元画像の濃淡に依存し、白紙では結果が目立たないことがある。専用設定UIなし。

<a id="tool-hdr-linear"></a>

### 光を重ねる筆 — `hdr-linear`

入口: その他のツール。意図: 線形色空間で塗布し、露光とトーン変換を加える。

実装: 画素をsRGBから線形化して合成し、toneMap で Reinhard / filmic 等を適用して8bitへ戻す。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `16` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `opacity` | `1` | 不透明度 |
| `dsRatio` | `0.5` | 線幅に対する基本サンプル間隔 |
| `toneCurve` | `reinhard` | トーン変換（reinhard / filmic / none） |
| `exposure` | `1` | 露光倍率 |
| `gamma` | `2.2` | 参考値。現実装のsRGB変換では未使用 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/hdr_linear_pipeline_brush.js / makeHdrLinearPipelineBrush](../src/tools/special/hdr_linear_pipeline_brush.js#L2)、[値の変換・clamp: getState](../src/tools/special/hdr_linear_pipeline_brush.js#L285)。

注意点: 浮動小数HDRレイヤーを継続保持する構造ではない。gamma は既定値・読取だけで、sRGB変換には使わない。専用設定UIなし。

<a id="tool-height-normal"></a>

### 凹凸表現 — `height-normal`

入口: その他のツール。意図: 凹凸や法線に応じた陰影を筆跡へ加える。

実装: normalMap または heightMap から法線を用意し、光方向との関係で塗布を変える。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `18` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |
| `opacity` | `1` | 不透明度 |
| `strength` | `0.25` | 効果の強度。各ツールの合成処理を参照 |
| `lightAzimuth` | `45` | 光源の方位角（度） |
| `lightElevation` | `60` | 光源の仰角（度） |
| `heightScale` | `1` | 高さから法線へ変換する倍率 |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `normalMap` | `null` | 法線を供給する画像 |
| `heightMap` | `null` | 高さを供給する画像 |

コード: [src/tools/special/height_normal_aware_brush.js / makeHeightNormalAwareBrush](../src/tools/special/height_normal_aware_brush.js#L27)、[値の変換・clamp: getState](../src/tools/special/height_normal_aware_brush.js#L307)。

注意点: マップを指定する画面はない。マップ未指定時の処理は平面の既定法線に依存する。

<a id="tool-mask-driven"></a>

### マスクに沿う筆 — `mask-driven`

入口: その他のツール。意図: 複数のマスクとぼかした境界に沿って塗る。

実装: composeMasksToCanvasSize でマスクを multiply / min / max 合成し、ぼかした値で stampMasked の透明度を制限する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `18` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000000` | 描画色 |
| `alpha` | `1` | 合成アルファ |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `featherPx` | `4` | マスク境界のぼかし（px） |
| `compose` | `multiply` | マスク合成方式（multiply / min / max） |
| `selectionMask` | `null` | 入力する選択マスク |
| `masks` | `null` | 入力マスク配列 |
| `maskVersion` | `0` | マスクキャッシュの更新番号 |

コード: [src/tools/special/mask_driven_brush.js / makeMaskDrivenBrush](../src/tools/special/mask_driven_brush.js#L25)、[値の変換・clamp: getState](../src/tools/special/mask_driven_brush.js#L384)。

注意点: selectionMask は独自の内部入力で、engine.selection の矩形を自動的にマスクへ変換する接続はない。専用設定UIなし。

<a id="tool-meta-brush"></a>

### 組み合わせブラシ — `meta-brush`

入口: その他のツール。意図: 速度・筆圧・曲率に応じて筆の種類を切り替える。

実装: decideMode がヒステリシスと最低滞在時間を使って callig / ink / ribbon を選び、各スタンプ処理へ分岐する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `alpha` — 透明度 | `1`；0.1〜1；刻み0.05 | スタンプ全体の不透明度を設定します（0.1〜1）。 |
| `spacingRatio` — スタンプ間隔 | `0.5`；0.1〜1；刻み0.05 | スタンプを打つ間隔をブラシ幅に対する倍率で指定します。 |
| `usePressure` — 筆圧を使用する | `true` | オンにするとペンの筆圧を検出してモード切替に利用します。 |
| `vLo` — 低速しきい値 (px/s) | `80`；10〜2000；刻み10 | この速度未満を「低速」とみなします。滑らかな描き出しに影響します。 |
| `vHi` — 高速しきい値 (px/s) | `450`；100〜4000；刻み10 | この速度を超えると高速モードへ移行します。 |
| `pLo` — 低筆圧しきい値 | `0.25`；0〜1；刻み0.05 | 筆圧がこの値未満のときに軽いタッチとして扱います。 |
| `pHi` — 高筆圧しきい値 | `0.7`；0〜1；刻み0.05 | 筆圧がこの値を超えると強いタッチとして扱います。 |
| `kHi` — 曲率しきい値 | `0.02`；0.001〜0.1；刻み0.001 | カーブの急さを判断する指標です。小さいほど曲線モードへ早く移行します。 |
| `hystRatio` — ヒステリシス比率 | `0.15`；0〜0.5；刻み0.01 | モード切替を安定させるための緩衝幅です。 |
| `minDwellMs` — 最小滞留時間 (ms) | `90`；0〜1000；刻み10 | 一度切り替えたモードを最低限維持する時間です。 |
| `initMode` — 初期モード | `callig`；候補 `callig`, `ink`, `ribbon` | 描き始めに使用するサブブラシを選択します。 |
| `emaV` — 速度平滑化 | `0.35`；0.05〜1；刻み0.05 | 速度の変化をどれだけ素早く追従するかを制御します。 |
| `emaP` — 筆圧平滑化 | `0.3`；0.05〜1；刻み0.05 | 筆圧のノイズをどれだけ平均化するかを決めます。 |
| `emaK` — 曲率平滑化 | `0.4`；0.05〜1；刻み0.05 | 曲率の変化を滑らかにする係数です。 |
| `penAngle` — ペン角度 | `45`；0〜180；刻み1 | カリグラフィモード時のペン先角度を指定します。 |
| `calligKappa` — カリグラフィ長短比 | `2`；1〜4；刻み0.1 | カリグラフィ楕円の長径と短径の比率です。 |
| `ribbonHardness` — リボン硬さ | `1`；0.2〜2；刻み0.1 | リボンモード時のエッジの鋭さを調整します。 |

コード: [src/tools/special/meta_brush.js / makeMetaBrush](../src/tools/special/meta_brush.js#L45)、[値の変換・clamp: getState](../src/tools/special/meta_brush.js#L356)。

注意点: 任意のブラシを自由に組み合わせる編集器ではなく、コードに定義された3種類の切替。

<a id="tool-on-image-warp"></a>

### 画像をゆがめる — `on-image-warp`

入口: その他のツール。意図: 画像を押す・膨らませる・ねじる。

実装: applyWarpStamp が半径内の逆写像を作り、双線形または双三次補間で元画素を再配置する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `radius` | `24` | 効果を与える半径（px） |
| `strength` | `0.5` | 効果の強度。各ツールの合成処理を参照 |
| `mode` | `move` | このツール内の処理方式。本文とgetStateの分岐を参照 |
| `swirlAngleDeg` | `120` | ねじり角度（度） |
| `ccw` | `true` | 反時計回りにするか |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `interp` | `bilinear` | 画素の補間方式（bilinear / bicubic） |

コード: [src/tools/special/on_image_warp.js / makeOnImageWarp](../src/tools/special/on_image_warp.js#L24)、[値の変換・clamp: getState](../src/tools/special/on_image_warp.js#L282)。

注意点: 既定は move。他モードや強さの専用設定UIなし。既存画素に作用する。

<a id="tool-palette-mapped"></a>

### パレット色に置換 — `palette-mapped`

入口: その他のツール。意図: 描画域の色を限定パレットへ寄せる。

実装: 線形色空間の最近傍パレット色へ量子化し、任意で誤差拡散とノイズを加える。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `18` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000000` | 描画色 |
| `opacity` | `1` | 不透明度 |
| `palette` | `null` | 量子化に使う色配列 |
| `paletteSize` | `16` | 既定パレットの色数 |
| `useDither` | `true` | 誤差拡散を使うか |
| `noise` | `0.03` | 量子化時のノイズ量 |

コード: [src/tools/special/palette_mapped_brush.js / makePaletteMappedBrush](../src/tools/special/palette_mapped_brush.js#L17)、[値の変換・clamp: getState](../src/tools/special/palette_mapped_brush.js#L316)。

注意点: 専用設定UIなし。共通パレットの値と、このツールが使う量子化パレットは同じ状態キー palette を使う。

<a id="tool-pattern-art-brush"></a>

### 模様の筆 — `pattern-art-brush`

入口: その他のツール。意図: 模様のタイルを線に沿って並べる。

実装: 弧長に沿ってタイルを配置し、接線に回転、必要なら着色と伸縮を行う。未指定時は ensureTile で生成する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `tileCanvas` | `null` | 模様を供給するcanvas・画像 |
| `tileLength` | `null` | 経路方向のタイル長。未指定ならタイルの幅 |
| `phase` | `0` | タイルの開始位相（px） |
| `stretchTol` | `0.1` | 伸縮を許す比率 |
| `tint` | `true` | 描画色でタイルを着色するか |
| `spacingScale` | `0.25` | タイル長に対する経路サンプル間隔 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/pattern_art_brush.js / makePatternArtBrush](../src/tools/special/pattern_art_brush.js#L2)、[値の変換・clamp: getState](../src/tools/special/pattern_art_brush.js#L291)。

注意点: 外部タイル指定の通常UIなし。単純な線幅で全体を拡縮する構造ではない。

<a id="curves"></a>

## 曲線ツール

<a id="tool-quad"></a>

### 2次ベジェ — `quad`

入口: その他のツール。意図: 3点で2次ベジェを描く。

実装: 始点→終点をクリックし、ポインタ移動で制御点を調整して3回目のクリックで quadraticCurveTo を確定描画する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |

コード: [src/tools/curves/quadratic.js / makeQuadratic](../src/tools/curves/quadratic.js#L4)。

注意点: 確定後はラスター。後編集用の制御点は残さない。

<a id="tool-cubic"></a>

### 3次ベジェ — `cubic`

入口: その他のツール。意図: 4点で3次ベジェを描く。

実装: 始点・制御点2個・終点のクリックで bezierCurveTo を確定描画する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |

コード: [src/tools/curves/cubic.js / makeCubic](../src/tools/curves/cubic.js#L4)。

注意点: 確定後はラスター。後編集は cubic-edit という別ツール。

<a id="tool-catmull"></a>

### Catmull — `catmull`

入口: その他のツール。意図: 指定した点を通る補間曲線を描く。

実装: catmullRomSpline で曲線化。4点以上を入力し、ダブルクリックで現在のレイヤーへ確定する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |

コード: [src/tools/curves/catmull.js / makeCatmull](../src/tools/curves/catmull.js#L7)。

注意点: 独自のEnterハンドラーはレイヤーでなく合成用 bctx に描くため、次の renderLayers で消える経路がある。共有 onEnter ではない。

<a id="tool-bspline"></a>

### Bスプライン — `bspline`

入口: その他のツール。意図: 制御点群から滑らかなBスプラインを描く。

実装: 4点以上で bspline によるサンプル列を作り、Enterまたはダブルクリックでラスター確定する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |

コード: [src/tools/curves/bspline.js / makeBSpline](../src/tools/curves/bspline.js#L6)。

注意点: 制御点を必ず通る曲線ではない。確定後に制御点は残さない。

<a id="tool-nurbs"></a>

### NURBS — `nurbs`

入口: その他のツール。意図: 重みを持つ制御点でNURBSを描く。

実装: 点を追加するごとに nurbsWeight を記録し、4点以上で nurbs を評価。ダブルクリックまたは独自Enterイベントで確定する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `nurbsWeight` — 制御点の重み | `1`；刻み0.1 | 制御点の影響度を調整します。値が大きいほどその点へカーブが引き寄せられます。 |

コード: [src/tools/curves/nurbs.js / makeNURBS](../src/tools/curves/nurbs.js#L6)。

注意点: 独自のグローバルEnterハンドラーはツールが非選択でも動く。未確定点の残留時の影響に注意。

<a id="tool-quad-edit"></a>

### 2次ベジェ編集 — `quad-edit`

入口: その他のツール。意図: 制御点を保持しながら2次ベジェを作成・調整する。

実装: createEditableCurveTool を共通基盤に3点以上の入力・修飾キーによる点のドラッグ・overlayプレビューを扱う。確定／焼き付けボタンが各ファイルの finalize を呼びラスター化する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `copyCurvesToVectorLayer` — ベクターレイヤーにコピー | 操作ボタン | 制御点のコピーをベクターレイヤーに渡し、ツール内の座標は保持します。 |
| `moveCurvesToVectorLayer` — ベクターレイヤーに移動 | 操作ボタン | 制御点をベクターレイヤーへ渡し、ツール内の座標を破棄します。 |
| `finalizeCurves` — 確定 | 操作ボタン | 保持している曲線を描画して確定し、制御点をクリアします。 |
| `burnCurves` — 焼き付け | 操作ボタン | 制御点を保持したまま現在の曲線をレイヤーに描画します。 |

コード: [src/tools/curves/quadratic_edit.js / makeEditableQuadratic](../src/tools/curves/quadratic_edit.js#L5)、[createEditableCurveTool](../src/tools/curves/editable_curve_base.js#L144)。

注意点: Enter は再表示だけで焼き付けない。ベクターレイヤーへのコピー／移動は制御データの転送で、常時描画とは未接続。種類を表すタグが保存されず、別の編集曲線ツールは同じ points を自分の種類として読む。取り消しも画素と制御データが分離している。

<a id="tool-cubic-edit"></a>

### 3次ベジェ編集 — `cubic-edit`

入口: その他のツール。意図: 制御点を保持しながら3次ベジェを作成・調整する。

実装: createEditableCurveTool を共通基盤に4点以上の入力・修飾キーによる点のドラッグ・overlayプレビューを扱う。確定／焼き付けボタンが各ファイルの finalize を呼びラスター化する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `copyCurvesToVectorLayer` — ベクターレイヤーにコピー | 操作ボタン | 制御点のコピーをベクターレイヤーに渡し、ツール内の座標は保持します。 |
| `moveCurvesToVectorLayer` — ベクターレイヤーに移動 | 操作ボタン | 制御点をベクターレイヤーへ渡し、ツール内の座標を破棄します。 |
| `finalizeCurves` — 確定 | 操作ボタン | 保持している曲線を描画して確定し、制御点をクリアします。 |
| `burnCurves` — 焼き付け | 操作ボタン | 制御点を保持したまま現在の曲線をレイヤーに描画します。 |

コード: [src/tools/curves/cubic_edit.js / makeEditableCubic](../src/tools/curves/cubic_edit.js#L5)、[createEditableCurveTool](../src/tools/curves/editable_curve_base.js#L144)。

注意点: Enter は再表示だけで焼き付けない。ベクターレイヤーへのコピー／移動は制御データの転送で、常時描画とは未接続。種類を表すタグが保存されず、別の編集曲線ツールは同じ points を自分の種類として読む。取り消しも画素と制御データが分離している。

<a id="tool-catmull-edit"></a>

### Catmull編集 — `catmull-edit`

入口: その他のツール。意図: 制御点を保持しながらCatmull–Romを作成・調整する。

実装: createEditableCurveTool を共通基盤に4点以上の入力・修飾キーによる点のドラッグ・overlayプレビューを扱う。確定／焼き付けボタンが各ファイルの finalize を呼びラスター化する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `copyCurvesToVectorLayer` — ベクターレイヤーにコピー | 操作ボタン | 制御点のコピーをベクターレイヤーに渡し、ツール内の座標は保持します。 |
| `moveCurvesToVectorLayer` — ベクターレイヤーに移動 | 操作ボタン | 制御点をベクターレイヤーへ渡し、ツール内の座標を破棄します。 |
| `finalizeCurves` — 確定 | 操作ボタン | 保持している曲線を描画して確定し、制御点をクリアします。 |
| `burnCurves` — 焼き付け | 操作ボタン | 制御点を保持したまま現在の曲線をレイヤーに描画します。 |

コード: [src/tools/curves/catmull_edit.js / makeEditableCatmull](../src/tools/curves/catmull_edit.js#L5)、[createEditableCurveTool](../src/tools/curves/editable_curve_base.js#L144)。

注意点: Enter は再表示だけで焼き付けない。ベクターレイヤーへのコピー／移動は制御データの転送で、常時描画とは未接続。種類を表すタグが保存されず、別の編集曲線ツールは同じ points を自分の種類として読む。取り消しも画素と制御データが分離している。

<a id="tool-bspline-edit"></a>

### Bスプライン編集 — `bspline-edit`

入口: その他のツール。意図: 制御点を保持しながらBスプラインを作成・調整する。

実装: createEditableCurveTool を共通基盤に4点以上の入力・修飾キーによる点のドラッグ・overlayプレビューを扱う。確定／焼き付けボタンが各ファイルの finalize を呼びラスター化する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `copyCurvesToVectorLayer` — ベクターレイヤーにコピー | 操作ボタン | 制御点のコピーをベクターレイヤーに渡し、ツール内の座標は保持します。 |
| `moveCurvesToVectorLayer` — ベクターレイヤーに移動 | 操作ボタン | 制御点をベクターレイヤーへ渡し、ツール内の座標を破棄します。 |
| `finalizeCurves` — 確定 | 操作ボタン | 保持している曲線を描画して確定し、制御点をクリアします。 |
| `burnCurves` — 焼き付け | 操作ボタン | 制御点を保持したまま現在の曲線をレイヤーに描画します。 |

コード: [src/tools/curves/bspline_edit.js / makeEditableBSpline](../src/tools/curves/bspline_edit.js#L10)、[createEditableCurveTool](../src/tools/curves/editable_curve_base.js#L144)。

注意点: Enter は再表示だけで焼き付けない。ベクターレイヤーへのコピー／移動は制御データの転送で、常時描画とは未接続。種類を表すタグが保存されず、別の編集曲線ツールは同じ points を自分の種類として読む。取り消しも画素と制御データが分離している。

<a id="tool-nurbs-edit"></a>

### NURBS編集 — `nurbs-edit`

入口: その他のツール。意図: 制御点を保持しながらNURBSを作成・調整する。

実装: createEditableCurveTool を共通基盤に4点以上の入力・修飾キーによる点のドラッグ・overlayプレビューを扱う。確定／焼き付けボタンが各ファイルの finalize を呼びラスター化する。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `nurbsWeight` — 制御点の重み | `1`；刻み0.1 | 制御点の影響度を調整します。値が大きいほどその点へカーブが引き寄せられます。 |
| `copyCurvesToVectorLayer` — ベクターレイヤーにコピー | 操作ボタン | 制御点のコピーをベクターレイヤーに渡し、ツール内の座標は保持します。 |
| `moveCurvesToVectorLayer` — ベクターレイヤーに移動 | 操作ボタン | 制御点をベクターレイヤーへ渡し、ツール内の座標を破棄します。 |
| `finalizeCurves` — 確定 | 操作ボタン | 保持している曲線を描画して確定し、制御点をクリアします。 |
| `burnCurves` — 焼き付け | 操作ボタン | 制御点を保持したまま現在の曲線をレイヤーに描画します。 |

コード: [src/tools/curves/nurbs_edit.js / makeEditableNURBS](../src/tools/curves/nurbs_edit.js#L13)、[createEditableCurveTool](../src/tools/curves/editable_curve_base.js#L144)。

注意点: Enter は再表示だけで焼き付けない。ベクターレイヤーへのコピー／移動は制御データの転送で、常時描画とは未接続。種類を表すタグが保存されず、別の編集曲線ツールは同じ points を自分の種類として読む。取り消しも画素と制御データが分離している。

<a id="shapes"></a>

## その他の図形

<a id="tool-arc"></a>

### 円弧 — `arc`

入口: その他のツール。意図: 円弧を配置する。

実装: 中心→半径と始角→終角の順に3クリック。第3クリック前のポインタ移動で終角を更新し、ctx.arc で描く。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |

コード: [src/tools/shapes/arc.js / makeArc](../src/tools/shapes/arc.js#L4)。

注意点: 一般的な図形ツールと違いドラッグ1回では完成しない。cancel がない。

<a id="tool-sector"></a>

### 扇形 — `sector`

入口: その他のツール。意図: 扇形を配置する。

実装: 円弧と同じ3段階の入力で中心と弧を閉じ、任意の塗りと輪郭を描く。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `secondaryColor` — 塗り色 | `#ffffff` | 矩形や楕円の塗りつぶしに使う色を選びます。 |
| `fillOn` — 塗りを有効にする | `true` | オンにすると図形を塗りつぶし、オフで輪郭のみ描画します。 |

コード: [src/tools/shapes/sector.js / makeSector](../src/tools/shapes/sector.js#L4)。

注意点: ドラッグ1回では完成せず、cancel がない。

<a id="tool-ellipse-2"></a>

### 楕円(回転) — `ellipse-2`

入口: その他のツール。意図: 回転した楕円を配置する。

実装: 中心→軸方向の半径→回転の3段階で ctx.ellipse を描く。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `dashPattern` — 破線パターン | 空文字（実線） | カンマ区切りで線分と隙間の長さ（px）を指定します。空欄で実線になります。 |
| `capStyle` — 線端スタイル | `butt`；候補 `butt`, `round`, `square` | 線の端の形を選びます。直角・丸端・突き出しから選択できます。 |
| `secondaryColor` — 塗り色 | `#ffffff` | 矩形や楕円の塗りつぶしに使う色を選びます。 |
| `fillOn` — 塗りを有効にする | `true` | オンにすると図形を塗りつぶし、オフで輪郭のみ描画します。 |
| `antialias` — アンチエイリアス | `false` | 定義はあるが描画には未接続。上記実装と注意点を参照。 |

コード: [src/tools/shapes/ellipse-2.js / makeEllipse2](../src/tools/shapes/ellipse-2.js#L4)。

注意点: antialias 設定は実際の描画処理と未接続。回転後の外接矩形を履歴領域の算出に使っておらず、取り消し範囲が不足する可能性がある。

<a id="vectors"></a>

## ベクター関連

<a id="tool-vector-keep"></a>

### 編集できる線 — `vector-keep`

入口: その他のツール。意図: 描いた線の点列を後から利用できる形で残す。

実装: 直線連結のラスター描画とともに points / color / width を tools[vector-keep].vectors に保存する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `未設定→実効0` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/vector/vector-keep.js / makeVectorKeep](../src/tools/vector/vector-keep.js#L2)。

注意点: 画面名は編集できる線だが編集UIも vector-edit との接続もない。既定 brushSize がなく初期状態では幅0となり、点列だけ残って画素は描かれない。layer.vectorData には入らない。

<a id="tool-vectorization"></a>

### ベクタ化 — `vectorization`

入口: その他のツール。意図: 手描きの点列をベジェ曲線に変換する。

実装: RDP単純化 → 短い区間の間引き → Catmull–Romから3次ベジェへの変換。ラスタ描画し、segments を tools[vectorization].vectors に保存する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `12` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |
| `epsilon` | `1.2` | 点列単純化・幾何比較の許容値。処理ごとに用途が異なる |
| `minSeg` | `1` | 単純化後に残す最小区間長（px） |
| `join` | `round` | 線の結合部（round / bevel / miter） |
| `cap` | `round` | 線端の形状 |

コード: [src/tools/vector/vectorization_brush.js / makeVectorizationBrush](../src/tools/vector/vectorization_brush.js#L8)、[値の変換・clamp: getState](../src/tools/vector/vectorization_brush.js#L247)。

注意点: 既存画像の輪郭抽出ではなく、新たに描いた線の変換。layer.vectorData とは別系統。画素を取り消しても vectors が残ることを確認。

<a id="tool-vector-edit"></a>

### ベクタ編集 — `vector-edit`

入口: その他のツール。意図: ベクタ化ツールが残したベジェの端点と制御点を動かす。

実装: SOURCE_TOOL_ID=vectorization の segments をヒットテストし、ドラッグ後に strokeVector でラスターへ描く。

画面パラメータ: 専用入力なし。共通パレットのみ。

コード: [src/tools/vector/vector_edit_brush.js / makeVectorEditBrush](../src/tools/vector/vector_edit_brush.js#L11)。

注意点: vector-keep / vector-tool / layer.vectorData を編集しない。元線を含む capturedRegion を戻してから新線を重ねるため、旧線の消去は正しく分離されていない。

<a id="tool-outline-stroke-fill"></a>

### 線を塗りの形に変換 — `outline-stroke-fill`

入口: その他のツール。意図: 線の中心線を塗りつぶし輪郭へ変える。

実装: 法線オフセットと join / cap を使って strokeToFillPolygon を作り、nonzero で塗り、fills に多角形を保持する。

画面パラメータ: 専用入力なし。共通パレットのみ。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `12` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `primaryColor` | `#000` | 描画色 |
| `join` | `miter` | 線の結合部（round / bevel / miter） |
| `cap` | `round` | 線端の形状 |
| `miterLimit` | `5` | マイター結合の長さの上限比 |
| `roundSegments` | `12` | 丸い端・結合の分割数 |
| `minSampleDist` | `0.25` | 点を追加する最小距離（px） |

コード: [src/tools/vector/outline_stroke_to_fill.js / makeOutlineStrokeToFill](../src/tools/vector/outline_stroke_to_fill.js#L13)、[値の変換・clamp: getState](../src/tools/vector/outline_stroke_to_fill.js#L357)。

注意点: 新しく引いた中心線に作用する。既存線を選んで変換するUI、layer.vectorData への接続、専用パラメータUIはない。

<a id="tool-vector-tool"></a>

### ベクターツール — `vector-tool`

入口: 登録あり・画面／検索に入口なし。意図: 点列の作成・アンカー編集・移動・SVG出力を行う。

実装: ツール固有の model.paths と tools[vector-tool].vectors に保持し、VectorRenderer がoverlay表示、VectorRasterizer が選択中canvasへ焼き付ける。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `brushSize` — 線幅 | `4`；1〜64；刻み1 | ストロークの太さを調整します（1〜64px）。 |
| `primaryColor` — 線色 | `#000000` | 線を描画するときに使用する色を選びます。 |
| `snapToGrid` — グリッドにスナップ | `false` | オンで最寄りのグリッド交点へ自動吸着します。 |
| `gridSize` — グリッド間隔 (px) | `8`；1〜256；刻み1 | グリッドスナップ有効時の格子間隔を設定します。 |
| `snapToExisting` — 既存アンカーにスナップ | `true` | オンにすると既存パスのアンカーへ吸着して整列できます。 |
| `snapRadius` — スナップ半径 (px) | `6`；1〜48；刻み1 | アンカーやセグメントを捕捉する半径を調整します。 |
| `simplifyTolerance` — 簡略化しきい値 | `0.75`；0〜5；刻み0.05 | ドラフト確定時に折れ線をどの程度間引くかを制御します。 |
| `rasterizeMode` — ラスタライズモード | `manual`；候補 `manual`, `onExport`, `auto` | パスをビットマップへ反映するタイミングを選びます。 |
| `showAnchors` — アンカーを表示 | `true` | オフにすると編集中のアンカー表示を隠します。 |

コード: [src/tools/vector/vector-tool.js / makeVectorTool](../src/tools/vector/vector-tool.js#L10)。

注意点: 登録はあるが通常UI／検索にボタンなし。layer.vectorData とは別系統。onExport 選択肢と通常の画像保存は未接続。編集・移動時は以前の焼き付け画素を消去しない。

<a id="tool-path-bool"></a>

### 経路ブーリアン — `path-bool`

入口: 登録あり・画面／検索に入口なし。意図: 閉じた形の和・差・積を合成する。

実装: 点列を paths に蓄積し、source-over / destination-out / destination-in のラスター合成で塗る。

画面パラメータ（非公開ツールの場合は定義のみ）:

| キー・表示名 | 既定値・範囲／操作 | UIの説明・実装との差 |
| --- | --- | --- |
| `primaryColor` — 塗り色 | `#000000` | 合成結果を塗りつぶす色を選びます。 |
| `alpha` — 塗り不透明度 | `1`；0.1〜1；刻み0.05 | 合成結果を描画する際の不透明度です。 |
| `op` — 新規パス演算子 | `union`；候補 `union`, `subtract`, `intersect` | 追加するパスに既定で適用するブーリアン演算を選びます。 |
| `epsilon` — 頂点結合許容 | `1e-06`；0〜1；刻み0.0001 | 頂点を自動的に結合する距離しきい値です。微小な隙間を吸収します。 |
| `fillRule` — 塗り判定ルール | `nonzero`；候補 `nonzero`, `evenodd` | 塗り領域の決定方法を選択します。 |
| `previewFill` — プレビュー塗り表示 | `true` | オンにすると編集中に合成結果の簡易プレビューを表示します。 |
| `minSampleDist` — サンプル間隔 | `0.5`；0.1〜5；刻み0.1 | 入力点を追加する最小距離（px）です。 |

コード: [src/tools/vector/path_booleans_v2.js / makePathBooleans](../src/tools/vector/path_booleans_v2.js#L35)、[値の変換・clamp: getState](../src/tools/vector/path_booleans_v2.js#L299)。

注意点: 通常UIなし。ベクター輪郭のブーリアン演算ではない。previewFill は厳密な演算結果ではなく全パスの概略塗り。

<a id="unavailable"></a>

## 互換登録・未登録・未実装

<a id="tool-select-free"></a>

### 自由選択（互換ID） — `select-free`

入口: 登録あり・画面／検索に入口なし。意図: 自由な輪郭の選択を想定した登録名。

実装: 実体は makeSelectRect()。独立した自由選択処理はない。

画面パラメータ: 専用入力なし。通常画面から選択できません。

コード: [src/tools/selection/select-rect.js / makeSelectRect](../src/tools/selection/select-rect.js#L2)。

注意点: 通常画面にボタンなし。PaintApp.selectTool と復元処理も select-rect に置き換える。

<a id="tool-rope-stabilizer"></a>

### ロープ補正 — `rope-stabilizer`

入口: 未登録・画面なし。意図: ロープで引いたように入力の揺れを抑える。

実装: ropeStep と effectiveK で描画位置を遅れて追従させ、平滑化後に帯を描く。

画面パラメータ: 専用入力なし。通常画面から選択できません。

内部設定（専用UIなし）:

| キー | コードの既定値／未設定時 | 用途 |
| --- | --- | --- |
| `brushSize` | `14` | 筆の大きさ。通常はpx。半径として使うツールは注意点に記載 |
| `ropeLength` | `12` | 入力と描画位置を結ぶロープの長さ（px） |
| `stiffness` | `0.4` | ロープの追従剛性 |
| `lagFrames` | `1` | 追従係数を調整する遅延フレーム相当値 |
| `spacingRatio` | `0.5` | 筆幅または半径に対するスタンプ間隔の比 |
| `primaryColor` | `#000` | 描画色 |

コード: [src/tools/special/rope_stabilizer.js / makeRopeStabilizer](../src/tools/special/rope_stabilizer.js#L2)、[値の変換・clamp: getState](../src/tools/special/rope_stabilizer.js#L221)。

注意点: 関数実装はあるがマニフェスト未登録・UIなし。通常アプリから使えない。

<a id="tool-clone-stamp"></a>

### 複写スタンプ（空ファイル） — `clone-stamp`

入口: 未登録・画面なし。意図: 画像の別位置を複写して塗る想定。

実装: clone_stamp.js は一般的なツール説明コメントだけで、関数本体が存在しない。

画面パラメータ: 専用入力なし。通常画面から選択できません。

コード: [src/tools/drawing/clone_stamp.js](../src/tools/drawing/clone_stamp.js)。

注意点: 未実装・未登録・UIなし。

## レイヤー・ファイル等の操作（ツールID外）

これらはマニフェスト内の描画ツールではなく、ツールバーやレイヤーパネルから呼ぶ操作です。

| 操作 | パラメータ・入力 | 実装 |
| --- | --- | --- |
| 新規 | 1280×720・白を初期値に生成 | [app.js](../src/app.js) `onNewDocument`、[document.js](../src/io/document.js) `createDocument` |
| 開く | 画像ファイル | [io/index.js](../src/io/index.js) `openImageFile` |
| 画像を保存 | PNG / JPEG / WebP。JPEGは白背景合成 | [document-dialogs.js](../src/gui/document-dialogs.js)、[export-actions.js](../src/io/export-actions.js) |
| 自動保存／前回復元 | 各レイヤー画像・メタデータ・store | [layered-snapshot.js](../src/io/layered-snapshot.js)、[session.js](../src/io/session.js) |
| 元に戻す／やり直す | 画素パッチ、構造変更時は文書スナップショット | [engine.js](../src/core/engine.js)、[document-state.js](../src/core/document-state.js) |
| コピー／切り取り／貼り付け | 選択範囲、クリップボード画像 | [clipboard-actions.js](../src/io/clipboard-actions.js)、[app.js](../src/app.js) |
| 選択範囲の切り抜き・反転 | 選択中レイヤー／画像全体、水平／垂直 | [app.js](../src/app.js) `cropSelection` / `affineSelection` |
| サイズ変更 | image / canvas、幅・高さ、縦横比固定 | [document-dialogs.js](../src/gui/document-dialogs.js)、[app.js](../src/app.js) `resizeCanvas` |
| 色・明るさの調整 | 明るさ・コントラスト・彩度・色相・反転 | [adjustment-manager.js](../src/managers/adjustment-manager.js)、[panels.js](../src/gui/panels.js) |
| 画像の反転・全クリア | 水平／垂直、全レイヤー | [app.js](../src/app.js) `flipCanvas` / `clearAllLayers` |
| レイヤー追加／＋V／削除／順序変更 | raster / vector、対象レイヤー | [layer.js](../src/core/layer.js) `addLayer` / `addVectorLayer` / `deleteLayer` / `moveLayer` |
| レイヤー表示・透明度・合成 | visible、opacity 0〜1、合成モード、下レイヤーへのclip | [layer.js](../src/core/layer.js) `flattenLayers` と `updateLayerList` |
| ベクターレイヤーのスタイル | color、width、dashPattern、capStyle。内部既定は黒・1px・実線・butt | [vector-layer-state.js](../src/core/vector-layer-state.js)、[app.js](../src/app.js) `updateVectorLayerStyle` / `applyVectorStyleToAll` |
| 表示倍率・パン | 画面に合わせる、100%、Ctrl＋ホイール、Spaceまたは中ボタンのドラッグ | [viewport.js](../src/core/viewport.js)、[engine.js](../src/core/engine.js) |

## 再現確認と検証範囲

静的確認では、登録78IDと画面75IDの照合、全80項目のコード／説明、パラメータ定義の既定値・範囲、内部設定のDEFAULTSとgetStateを確認しました。全75ツールの実ブラウザ操作・全設定の効果・GPU・ペン実機まで試験したという意味ではありません。

実行確認には、既存の [simple-workflow.test.mjs](../test/integration/simple-workflow.test.mjs) と同じJSDOM＋`@napi-rs/canvas`の実画素環境を使用しました。アプリ・ストア・エンジン・レイヤー・書き出し処理は実装を呼び出し、画面レイアウトの計測とアニメーションフレームは代替しています。この節は実行結果の記録であり、ブラウザの描画差やアニメーションの完了は判定対象外です。

96×64px、通常描画は点列 `(10,40) → (30,15) → (60,30) → (80,40)`、編集2次ベジェは `(10,40), (40,10), (70,40)` を使用しました。「着色画素」はalphaが正でRGBのいずれかが250未満の画素です。通常レイヤーは白、追加したベクターレイヤーは透明です。

| 確認 | 結果 |
| --- | --- |
| 鉛筆／ブラシの既定入力 | どちらも線幅4・黒・不透明度1。着色画素は356／351で、サブピクセル差を含む差がある |
| ベクターレイヤーで鉛筆描画 | 着色画素367、`vectorData.curves.length=0`。線はラスター |
| `vector-keep` の既定入力 | 着色画素0、点列4点をツールstoreに保持、レイヤー側曲線0 |
| `vectorization` | 着色画素1305、ツールstoreのvectorsは1件、レイヤー側曲線0 |
| `vectorization` をUndo | 着色画素0へ戻るが、ツールstoreのvectorsは1件のまま |
| 編集2次ベジェを入力 | レイヤー画素0、overlayの着色画素389、レイヤー側曲線0 |
| ベクターレイヤーへコピー | レイヤー側曲線1、レイヤー画素0、overlayには表示 |
| コピー後に鉛筆へ切替 | overlayの着色画素0、画像書出しの着色画素0、制御データは1件残る |
| 編集2次ベジェへ戻る | overlayの着色画素389として再表示 |
| `freehand` の確定 | `catmullRomSpline is not defined` を再現 |
| `sdf-stroke` の初期入力 | 例外なし・着色画素0 |
| `gpu-instanced-brush` の初期入力 | 例外なし・着色画素0。gpu未注入でreturn |

ブラウザでベクターレイヤーの不足を確認する場合は、`＋V` を追加して「2次ベジェ編集」で3点を入力し、「詳しい設定」の「ベクターレイヤーにコピー」を使ってから鉛筆へ切り替えます。表示の消失と、再び編集曲線へ戻した際の再表示を比較してください。未焼き付けのまま画像を保存すると、曲線プレビューは保存対象になりません。

通常の試験スイート `npm test` は、2026-09-13にNode.js 24.19.0で実行し187件成功・失敗0件でした。単体試験が通ることと、上記のデータ系統をまたぐ操作が完成していることは別です。

## シンプルさを維持するための修正順

最初に「画面にあるのに描けない」「設定を変えても効かない」「取り消した内容と保存データが食い違う」を直すべきです。該当するのは未定義の補間関数、GPU未注入、筆幅未設定、未使用パラメータ、ベクターの表示・保存・履歴の不統一です。

鉛筆とブラシは、違いを小さく明確に決めてから実装・表示名を揃える必要があります。ベクター機能はデータの所有先・種類タグ・常時描画・履歴・座標変換を統一し、通常操作が成立したものから公開する方針が必要です。この記録は新たな高度機能の追加を要求するものではありません。
