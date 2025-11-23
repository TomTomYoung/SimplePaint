# SimplePaint 仕様書

**バージョン**: 1.0
**最終更新日**: 2025年11月23日
**言語**: 日本語

---

## 目次

1. [概要](#1-概要)
2. [システム要件](#2-システム要件)
3. [アーキテクチャ](#3-アーキテクチャ)
4. [プロジェクト構造](#4-プロジェクト構造)
5. [コアシステム](#5-コアシステム)
6. [描画ツール](#6-描画ツール)
7. [レイヤーシステム](#7-レイヤーシステム)
8. [ユーザーインターフェース](#8-ユーザーインターフェース)
9. [入出力機能](#9-入出力機能)
10. [キーボードショートカット](#10-キーボードショートカット)
11. [状態管理](#11-状態管理)
12. [拡張機能](#12-拡張機能)
13. [技術仕様](#13-技術仕様)

---

## 1. 概要

### 1.1 製品概要

SimplePaintは、Webブラウザ上で動作する高機能ペイントアプリケーションです。フレームワークに依存しないピュアJavaScriptで実装されており、75種類以上の描画ツール、マルチレイヤーシステム、ベクター描画機能を備えています。

### 1.2 主要機能

| 機能カテゴリ | 説明 |
|-------------|------|
| 描画ツール | 鉛筆、ブラシ、消しゴム、エアブラシ等75種類以上 |
| 図形ツール | 直線、矩形、楕円、多角形、ベジェ曲線 |
| レイヤー管理 | ラスター/ベクター/テキストレイヤーのサポート |
| 選択ツール | 矩形選択、浮動選択、選択範囲の操作 |
| 色管理 | プライマリ/セカンダリカラー、カラーパレット |
| 画像調整 | 明るさ、コントラスト、彩度、色相、反転 |
| ファイル操作 | PNG/JPEG/WebP形式での保存・読み込み |
| 履歴管理 | 無制限のUndo/Redo機能 |
| オートセーブ | 15秒間隔での自動保存 |

### 1.3 設計思想

- **フレームワークレス**: 外部フレームワークに依存しない軽量設計
- **モジュラー設計**: 高い凝集度と低い結合度
- **拡張可能**: プラグインアーキテクチャによるツール追加
- **パフォーマンス重視**: ネイティブCanvas APIの直接利用

---

## 2. システム要件

### 2.1 対応ブラウザ

| ブラウザ | 最小バージョン | 推奨バージョン |
|---------|---------------|---------------|
| Google Chrome | 80以上 | 最新版 |
| Mozilla Firefox | 75以上 | 最新版 |
| Microsoft Edge | 80以上 | 最新版 |
| Safari | 13以上 | 最新版 |

### 2.2 必須機能

- ES6モジュールサポート
- Canvas API
- Pointer Events API
- Clipboard API
- LocalStorage / IndexedDB
- File API

### 2.3 推奨環境

- **画面解像度**: 1280x720以上
- **メモリ**: 4GB以上
- **入力デバイス**: マウス、タッチパッド、ペンタブレット

---

## 3. アーキテクチャ

### 3.1 4層アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                プレゼンテーション層                      │
│         (index.html, styles.css, src/gui/*)             │
│    ユーザーインターフェース、イベントハンドリング         │
├─────────────────────────────────────────────────────────┤
│               インタラクティブツール層                   │
│                   (src/tools/*)                         │
│      75種類以上の描画ツール、図形ツール、選択ツール       │
├─────────────────────────────────────────────────────────┤
│                共有ユーティリティ層                      │
│                   (src/utils/*)                         │
│    座標変換、描画ヘルパー、数学関数、バリデーション       │
├─────────────────────────────────────────────────────────┤
│                  レンダリングコア                        │
│          (src/core/*, src/managers/*)                   │
│  キャンバスエンジン、状態管理、レイヤー管理、履歴管理     │
└─────────────────────────────────────────────────────────┘
```

### 3.2 設計パターン

| パターン | 適用箇所 | 説明 |
|---------|---------|------|
| Observer | EventBus | イベント駆動型の疎結合通信 |
| Factory | ツール生成 | ツールインスタンスの動的生成 |
| Registry | ツール登録 | ツールの一元管理 |
| State | Store | リアクティブな状態管理 |
| Command | History | Undo/Redoのコマンドパターン |

### 3.3 データフロー

```
ユーザー入力 → EventBus → Engine → Tool → Canvas
                 ↓
              Store（状態更新）
                 ↓
              GUI（UI更新）
```

---

## 4. プロジェクト構造

### 4.1 ディレクトリ構成

```
SimplePaint/
├── index.html              # メインHTMLファイル
├── styles.css              # グローバルスタイルシート
├── package.json            # プロジェクト設定
├── src/                    # ソースコード
│   ├── main.js             # アプリケーションエントリーポイント
│   ├── app.js              # PaintAppメインクラス
│   ├── core/               # コアエンジン
│   │   ├── engine.js       # キャンバスエンジン
│   │   ├── store.js        # 状態管理ストア
│   │   ├── event-bus.js    # イベントバス
│   │   ├── layer.js        # レイヤー管理
│   │   ├── viewport.js     # ビューポート変換
│   │   └── vector-layer-state.js  # ベクターレイヤー状態
│   ├── gui/                # UIコンポーネント
│   │   ├── toolbar.js      # ツールバー
│   │   ├── tool-props.js   # ツールプロパティパネル
│   │   ├── panels.js       # レイヤーパネル
│   │   ├── tool-search-overlay.js  # ツール検索
│   │   ├── shortcuts-overlay.js    # ショートカット一覧
│   │   ├── panel-resize.js # パネルリサイズ
│   │   └── workspace-layout.js     # ワークスペースレイアウト
│   ├── io/                 # 入出力
│   │   ├── file-io.js      # ファイル読み込み
│   │   ├── export-actions.js  # ファイル保存
│   │   ├── clipboard-actions.js  # クリップボード
│   │   ├── autosave.js     # オートセーブ
│   │   └── session.js      # セッション管理
│   ├── managers/           # 機能マネージャー
│   │   ├── history-manager.js     # 履歴管理
│   │   ├── text-editor.js  # テキスト編集
│   │   ├── adjustment-manager.js  # 画像調整
│   │   └── dom-manager.js  # DOM管理
│   ├── tools/              # 描画ツール
│   │   ├── base/           # ツール基盤
│   │   ├── drawing/        # 描画ツール
│   │   ├── shapes/         # 図形ツール
│   │   ├── curves/         # 曲線ツール
│   │   ├── special/        # 特殊ブラシ
│   │   ├── selection/      # 選択ツール
│   │   ├── fill/           # 塗りつぶしツール
│   │   ├── text/           # テキストツール
│   │   └── vector/         # ベクターツール
│   ├── utils/              # ユーティリティ
│   └── types/              # 型定義（JSDoc）
├── test/                   # テストファイル
└── docs/                   # ドキュメント
```

### 4.2 主要ファイル

| ファイル | 行数（概算） | 役割 |
|---------|------------|------|
| src/app.js | 800 | アプリケーションメインクラス |
| src/core/engine.js | 600 | キャンバスエンジン |
| src/core/store.js | 200 | 状態管理 |
| src/core/layer.js | 400 | レイヤー管理 |
| src/gui/toolbar.js | 500 | ツールバーUI |
| src/tools/base/manifest.js | 300 | ツールマニフェスト |

---

## 5. コアシステム

### 5.1 キャンバスエンジン (engine.js)

#### 5.1.1 責務

- キャンバス要素の管理
- ポインターイベントの処理
- ツール実行パイプライン
- レンダリング制御
- 座標変換

#### 5.1.2 主要メソッド

```javascript
class Engine {
  // キャンバス初期化
  init(canvasElement, overlayElement)

  // ツール設定
  setTool(toolId)

  // レンダリング
  render()
  requestRender()

  // 座標変換
  screenToCanvas(screenX, screenY)
  canvasToScreen(canvasX, canvasY)

  // ズーム・パン
  setZoom(level)
  pan(dx, dy)
}
```

#### 5.1.3 イベント処理フロー

```
pointerdown → onPointerDown() → tool.onPointerDown()
pointermove → onPointerMove() → tool.onPointerMove()
pointerup   → onPointerUp()   → tool.onPointerUp()
```

### 5.2 状態管理 (store.js)

#### 5.2.1 設計

Zustand風のリアクティブ状態管理システムを採用。状態変更を購読し、UIを自動更新します。

#### 5.2.2 デフォルト状態

```javascript
const defaultState = {
  toolId: 'pencil',           // 現在選択中のツール
  tools: {},                  // ツール別の状態
  vectorLayer: {}             // ベクターレイヤー状態
};

const toolDefaults = {
  brushSize: 4,               // ブラシサイズ（px）
  smoothAlpha: 0.55,          // スムージング係数
  spacingRatio: 0.4,          // ストローク間隔比
  primaryColor: '#000000',    // プライマリカラー
  secondaryColor: '#ffffff',  // セカンダリカラー
  fillOn: true,               // 塗りつぶし有効
  alpha: 1,                   // アルファ値
  opacity: 1,                 // 不透明度
  fontSize: 24,               // フォントサイズ
  fontFamily: 'system-ui, sans-serif',  // フォントファミリー
  palette: [                  // デフォルトパレット（8色）
    '#000000', '#ffffff', '#ff0000', '#00ff00',
    '#0000ff', '#ffff00', '#ff00ff', '#00ffff'
  ]
};
```

#### 5.2.3 API

```javascript
// 状態取得（ディープクローン）
store.getState()

// 状態更新（マージ）
store.set({ brushSize: 10 })

// 状態置き換え
store.replaceState(newState)

// 全体購読
store.subscribe((state, prevState) => { /* ... */ })

// 選択的購読
store.watch(
  state => state.brushSize,
  (newSize, oldSize) => { /* ... */ }
)
```

### 5.3 イベントバス (event-bus.js)

#### 5.3.1 概要

軽量なPub/Subイベントシステム。コンポーネント間の疎結合通信を実現します。

#### 5.3.2 API

```javascript
// リスナー登録
eventBus.on('tool:changed', handler)

// 一度だけ実行
eventBus.once('canvas:ready', handler)

// リスナー削除
eventBus.off('tool:changed', handler)

// イベント発行（同期）
eventBus.emit('tool:changed', { toolId: 'brush' })

// イベント発行（非同期）
await eventBus.emitAsync('canvas:save')
```

#### 5.3.3 主要イベント

| イベント名 | 発行タイミング | ペイロード |
|-----------|--------------|-----------|
| `tool:changed` | ツール変更時 | `{ toolId, prevToolId }` |
| `layer:added` | レイヤー追加時 | `{ layer }` |
| `layer:removed` | レイヤー削除時 | `{ layerId }` |
| `history:push` | 履歴追加時 | `{ action }` |
| `history:undo` | Undo実行時 | `{ action }` |
| `history:redo` | Redo実行時 | `{ action }` |
| `canvas:render` | レンダリング時 | - |
| `selection:changed` | 選択範囲変更時 | `{ bounds }` |

### 5.4 ビューポート (viewport.js)

#### 5.4.1 概要

スクリーン座標とキャンバス座標の変換、ズーム・パン機能を管理します。

#### 5.4.2 座標系

```
スクリーン座標系           キャンバス座標系
(0,0)──────────→ X       (0,0)──────────→ X
  │                        │
  │  ブラウザウィンドウ      │  実際のキャンバス
  │                        │
  ↓                        ↓
  Y                        Y
```

#### 5.4.3 変換式

```javascript
// スクリーン → キャンバス
canvasX = (screenX - offsetX) / zoom
canvasY = (screenY - offsetY) / zoom

// キャンバス → スクリーン
screenX = canvasX * zoom + offsetX
screenY = canvasY * zoom + offsetY
```

#### 5.4.4 ズーム仕様

| 項目 | 値 |
|------|-----|
| 最小ズーム | 0.1 (10%) |
| 最大ズーム | 32.0 (3200%) |
| デフォルト | 1.0 (100%) |
| ズームステップ | 1.1倍 / 0.9倍 |

---

## 6. 描画ツール

### 6.1 ツールインターフェース

すべての描画ツールは以下のインターフェースを実装します：

```javascript
interface Tool {
  // 必須プロパティ
  id: string;                 // ユニークID

  // オプションプロパティ
  cursor?: string;            // カーソルスタイル

  // 必須メソッド
  onPointerDown(ctx, event, engine): void;
  onPointerMove(ctx, event, engine): void;
  onPointerUp(ctx, event, engine): void;

  // オプションメソッド
  drawPreview?(overlayCtx): void;
  cancel?(): void;
  onEnter?(ctx, engine): void;
  onModifiersChanged?(modifiers, engine): void;
}
```

### 6.2 ツールカテゴリ

#### 6.2.1 描画ツール (drawing/)

| ツールID | 名称 | 説明 | ショートカット |
|---------|------|------|--------------|
| pencil | 鉛筆 | 基本的な1pxの描画 | P |
| brush | ブラシ | 可変サイズのソフトブラシ | B |
| eraser | 消しゴム | 消去ツール | E |
| airbrush | エアブラシ | スプレー効果 | - |
| smooth | スムース | 滑らかな線 | - |
| minimal | ミニマル | 最小限の描画 | - |
| freehand | フリーハンド | 自由曲線 | - |
| antialiased | AA線 | アンチエイリアス線 | - |
| pixel-brush | ピクセル筆 | ピクセルアート向け | - |
| blur | ぼかし | ぼかし効果 | - |
| gradient | グラデーション | グラデーション描画 | - |
| hatching | ハッチング | 斜線パターン | - |
| predictive | 予測ブラシ | AI補助描画 | - |

#### 6.2.2 図形ツール (shapes/)

| ツールID | 名称 | 説明 | ショートカット |
|---------|------|------|--------------|
| line | 直線 | 直線描画 | L |
| rect | 矩形 | 長方形描画 | R |
| ellipse | 楕円 | 楕円描画 | O |
| rotated-ellipse | 回転楕円 | 回転可能な楕円 | Shift+E |
| sector | 扇形 | 扇形描画 | S |
| polygon | 多角形 | 正多角形描画 | - |

#### 6.2.3 曲線ツール (curves/)

| ツールID | 名称 | 説明 | ショートカット |
|---------|------|------|--------------|
| quadratic-bezier | 2次ベジェ | 2次ベジェ曲線 | Q |
| cubic-bezier | 3次ベジェ | 3次ベジェ曲線 | C |
| arc | 円弧 | 円弧描画 | A |
| catmull-rom | Catmull-Rom | スプライン曲線 | U |
| nurbs | NURBS | NURBS曲線 | N |
| b-spline | B-スプライン | B-スプライン曲線 | - |
| hermite | エルミート | エルミート曲線 | - |
| cardinal | カーディナル | カーディナルスプライン | - |
| lagrange | ラグランジュ | 補間曲線 | - |
| multi-point-bezier | マルチベジェ | 多点ベジェ | - |
| rational-bezier | 有理ベジェ | 有理ベジェ曲線 | - |

#### 6.2.4 特殊ブラシ (special/)

| ツールID | 名称 | 説明 |
|---------|------|------|
| bristle | 多毛筆 | 筆の質感を再現 |
| calligraphy | カリグラフィ | 書道風ブラシ |
| chalk | チョーク | チョーク風描画 |
| scatter | 散布 | パーティクル散布 |
| smudge | スマッジ | 色を混ぜる |
| drip | ドリップ | 滴れ効果 |
| flow | フロー | 流れ効果 |
| glyph | グリフ | 文字パターン |
| gpu-stamp | GPUスタンプ | GPU加速スタンプ |
| granulation | 粒状化 | 粒状テクスチャ |
| halftone | ハーフトーン | 網点効果 |
| ribbon | リボン | リボン状描画 |
| watercolor | 水彩 | 水彩画効果 |
| oil-paint | 油彩 | 油絵効果 |
| texture | テクスチャ | テクスチャブラシ |

#### 6.2.5 選択・塗りつぶしツール

| ツールID | 名称 | 説明 | ショートカット |
|---------|------|------|--------------|
| selection | 選択 | 矩形選択 | M |
| fill | バケツ | 塗りつぶし | F |
| eyedropper | スポイト | 色取得 | I |

#### 6.2.6 テキスト・ベクターツール

| ツールID | 名称 | 説明 | ショートカット |
|---------|------|------|--------------|
| text | テキスト | テキスト入力 | T |
| vectorize | ベクタ化 | ラスター→ベクター変換 | V |
| vector-edit | ベクタ編集 | パスの頂点編集 | Shift+V |
| vector-keep | ベクタ保持 | ベクター状態維持 | K |

### 6.3 ツールプロパティ

各ツールは以下のプロパティをサポートします：

| プロパティ | 型 | 範囲 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| brushSize | number | 1-500 | 4 | ブラシサイズ（px） |
| opacity | number | 0-1 | 1 | 不透明度 |
| smoothAlpha | number | 0-1 | 0.55 | スムージング係数 |
| spacingRatio | number | 0.1-2 | 0.4 | ストローク間隔比 |
| hardness | number | 0-1 | 0.8 | エッジの硬さ |
| flow | number | 0-1 | 1 | 塗料の流量 |

### 6.4 ツールマニフェスト

ツールはマニフェストファイルで宣言的に登録されます：

```javascript
// tools/base/manifest.js
const DEFAULT_TOOL_MANIFEST = [
  {
    id: 'drawing',
    label: '描画ツール',
    tools: [
      { id: 'pencil', label: '鉛筆', shortcut: 'P' },
      { id: 'brush', label: 'ブラシ', shortcut: 'B' },
      // ...
    ]
  },
  {
    id: 'shapes',
    label: '図形ツール',
    tools: [
      { id: 'line', label: '直線', shortcut: 'L' },
      // ...
    ]
  },
  // ...
];
```

---

## 7. レイヤーシステム

### 7.1 レイヤータイプ

| タイプ | 説明 | 編集方法 |
|--------|------|---------|
| raster | ビットマップレイヤー | ピクセル単位の描画 |
| vector | ベクターレイヤー | パス・図形の編集 |
| text | テキストレイヤー | テキスト入力・編集 |

### 7.2 レイヤープロパティ

```javascript
interface Layer {
  id: string;           // ユニークID
  name: string;         // 表示名
  type: LayerType;      // レイヤータイプ
  visible: boolean;     // 表示/非表示
  locked: boolean;      // ロック状態
  opacity: number;      // 不透明度（0-1）
  blendMode: string;    // ブレンドモード
  canvas: HTMLCanvasElement;  // キャンバス要素
}
```

### 7.3 ブレンドモード

| モード | 説明 |
|--------|------|
| normal | 通常 |
| multiply | 乗算 |
| screen | スクリーン |
| overlay | オーバーレイ |
| darken | 比較（暗） |
| lighten | 比較（明） |
| color-dodge | 覆い焼きカラー |
| color-burn | 焼き込みカラー |
| hard-light | ハードライト |
| soft-light | ソフトライト |
| difference | 差の絶対値 |
| exclusion | 除外 |

### 7.4 レイヤー操作

| 操作 | 説明 |
|------|------|
| 追加 | 新規レイヤーを作成 |
| 削除 | 選択レイヤーを削除 |
| 複製 | レイヤーをコピー |
| 結合 | 下のレイヤーと結合 |
| 順序変更 | ドラッグで順序を変更 |
| 名前変更 | ダブルクリックで編集 |

---

## 8. ユーザーインターフェース

### 8.1 レイアウト構成

```
┌────────────────────────────────────────────────────────────┐
│                      ヘッダー (Header)                      │
│  [ファイル] [編集] [表示] [ツール選択ボタン群]               │
├──────────┬─────────────────────────────────┬───────────────┤
│          │                                 │               │
│  左パネル │        キャンバスエリア          │   右パネル    │
│          │                                 │               │
│ ・ツール  │     (描画領域)                   │ ・レイヤー    │
│  プロパティ│                                 │  パネル       │
│          │                                 │               │
│ ・カラー  │                                 │ ・フィルター  │
│  パレット │                                 │               │
│          │                                 │               │
├──────────┴─────────────────────────────────┴───────────────┤
│                    フッター (Footer)                        │
│  [座標: X, Y] [ズーム: 100%] [色情報] [レイアウト選択]       │
└────────────────────────────────────────────────────────────┘
```

### 8.2 ヘッダー (toolbar.js)

#### 8.2.1 システムボタン

| ボタン | 機能 | ショートカット |
|--------|------|--------------|
| 新規 | 新規キャンバス作成 | Ctrl+N |
| 開く | ファイルを開く | Ctrl+O |
| 保存 | ファイルを保存 | Ctrl+S |
| 元に戻す | Undo | Ctrl+Z |
| やり直し | Redo | Ctrl+Y |
| コピー | 選択範囲をコピー | Ctrl+C |
| カット | 選択範囲をカット | Ctrl+X |
| ペースト | クリップボードから貼り付け | Ctrl+V |

#### 8.2.2 ツールドロップダウン

ツールはカテゴリ別にドロップダウンメニューで表示されます。

### 8.3 左パネル (tool-props.js)

#### 8.3.1 ツールプロパティ

選択中のツールに応じて動的にUIが生成されます：

- **スライダー**: ブラシサイズ、不透明度など
- **カラーピッカー**: プライマリ/セカンダリカラー
- **チェックボックス**: 塗りつぶし有効/無効
- **ドロップダウン**: ブレンドモード選択

#### 8.3.2 カラーパレット

- 8色のカスタマイズ可能なパレット
- 左クリック: プライマリカラーに設定
- 右クリック: セカンダリカラーに設定
- ダブルクリック: カラーピッカーを開く

### 8.4 右パネル (panels.js)

#### 8.4.1 レイヤーパネル

- レイヤー一覧（サムネイル付き）
- 表示/非表示トグル
- ロック/アンロックトグル
- 不透明度スライダー
- ブレンドモード選択
- 新規レイヤーボタン
- レイヤー削除ボタン

### 8.5 フッター

| 表示項目 | 説明 |
|---------|------|
| 座標表示 | マウスカーソル位置（キャンバス座標） |
| ズーム率 | 現在のズームレベル（%） |
| 色情報 | カーソル位置のRGB値 |
| オートセーブ状態 | 最終保存時刻 |
| レイアウト選択 | ワークスペースプリセット |

### 8.6 ワークスペースレイアウト

| プリセット | 説明 |
|-----------|------|
| 標準 | デフォルトレイアウト |
| ブラシ重視 | 左パネル拡大 |
| 資料表示 | 右パネル拡大 |
| キャンバス集中 | パネル最小化 |
| カスタム | ユーザー定義 |

### 8.7 オーバーレイ

#### 8.7.1 ツール検索 (tool-search-overlay.js)

- **起動**: Ctrl+K
- **機能**: ツール名、ショートカット、グループ名で検索
- **対応**: 日本語検索（Unicode正規化）

#### 8.7.2 ショートカット一覧 (shortcuts-overlay.js)

- **起動**: ? キー
- **表示**: 全ショートカットの一覧

---

## 9. 入出力機能

### 9.1 ファイル保存 (export-actions.js)

#### 9.1.1 対応形式

| 形式 | 拡張子 | 特徴 | 品質設定 |
|------|-------|------|---------|
| PNG | .png | ロスレス圧縮、透明度対応 | - |
| JPEG | .jpg | 非可逆圧縮、背景白色 | 92% |
| WebP | .webp | 高圧縮率、透明度対応 | 92% |

#### 9.1.2 保存フロー

```
1. renderDocumentCanvas() - 全レイヤーを統合してレンダリング
2. canvasToBlob() - Canvas → Blob変換
3. downloadBlob() - ブラウザダウンロードダイアログ表示
```

### 9.2 ファイル読み込み (file-io.js)

#### 9.2.1 対応形式

- PNG, JPEG, GIF, WebP, BMP
- SVG（ラスタライズ）

#### 9.2.2 読み込みフロー

```
1. File API でファイル選択
2. FileReader で読み込み
3. Image オブジェクトに変換
4. Canvas に描画
5. 新規レイヤーとして追加
```

### 9.3 クリップボード (clipboard-actions.js)

#### 9.3.1 コピー

```javascript
// 選択範囲をクリップボードにコピー
copySelection()
// → 選択範囲のピクセルデータをPNG形式でクリップボードに書き込み
```

#### 9.3.2 カット

```javascript
// 選択範囲をカット
cutSelection()
// → コピー後、選択範囲を透明に
```

#### 9.3.3 ペースト

```javascript
// クリップボードから貼り付け
handleClipboardItems()
// → 画像データを新規浮動選択として貼り付け
```

### 9.4 オートセーブ (autosave.js)

#### 9.4.1 仕様

| 項目 | 値 |
|------|-----|
| 保存間隔 | 15秒 |
| 保存先 | LocalStorage + IndexedDB |
| 保存内容 | キャンバス状態、レイヤー情報、ツール設定 |

#### 9.4.2 データ構造

```javascript
{
  version: '1.0',
  timestamp: Date.now(),
  canvas: {
    width: number,
    height: number,
    layers: [
      {
        id: string,
        name: string,
        type: string,
        imageData: string,  // Base64エンコード
        // ...
      }
    ]
  },
  state: {
    toolId: string,
    tools: { /* ツール別設定 */ }
  }
}
```

### 9.5 セッション管理 (session.js)

- ページリロード時の自動復元
- 復元確認ダイアログ
- 復元ボタンの表示制御

---

## 10. キーボードショートカット

### 10.1 ツール選択

| キー | ツール | キー | ツール |
|------|--------|------|--------|
| P | 鉛筆 | L | 直線 |
| B | ブラシ | R | 矩形 |
| E | 消しゴム | O | 楕円 |
| T | テキスト | Q | 2次ベジェ |
| M | 選択 | C | 3次ベジェ |
| I | スポイト | A | 円弧 |
| F | バケツ | S | 扇形 |
| D | 散布 | U | Catmull-Rom |
| G | スマッジ | N | NURBS |
| K | ベクタ保持 | H | 補間描画 |
| V | ベクタ化 | - | - |

### 10.2 Shift + キー

| キー | ツール |
|------|--------|
| Shift+P | 鉛筆（オフドラッグ） |
| Shift+E | 消しゴム（オフドラッグ） |
| Shift+H | 補間描画（オフドラッグ） |
| Shift+V | ベクタ編集 |

### 10.3 ファイル操作

| キー | 機能 |
|------|------|
| Ctrl+N | 新規キャンバス |
| Ctrl+O | ファイルを開く |
| Ctrl+S | 保存 |
| Ctrl+Shift+S | 名前を付けて保存 |

### 10.4 編集操作

| キー | 機能 |
|------|------|
| Ctrl+Z | 元に戻す (Undo) |
| Ctrl+Y | やり直し (Redo) |
| Ctrl+Shift+Z | やり直し (Redo) |
| Ctrl+C | コピー |
| Ctrl+X | カット |
| Ctrl+V | ペースト |
| Ctrl+A | 全選択 |
| Ctrl+D | 選択解除 |
| Delete | 選択範囲を削除 |

### 10.5 表示操作

| キー | 機能 |
|------|------|
| Ctrl+K | ツール検索を開く |
| ? | ショートカット一覧を表示 |
| Ctrl++ | ズームイン |
| Ctrl+- | ズームアウト |
| Ctrl+0 | ズームリセット (100%) |
| Ctrl+1 | フィットイン |

### 10.6 キャンバス操作

| 操作 | 機能 |
|------|------|
| Space + ドラッグ | キャンバスをパン |
| 中ボタンドラッグ | キャンバスをパン |
| Ctrl + ホイール | ズーム |
| Shift + 描画 | 角度/形状を拘束 |
| Esc | 操作をキャンセル / 選択解除 |

---

## 11. 状態管理

### 11.1 履歴管理 (history-manager.js)

#### 11.1.1 概要

Undo/Redoを実現するためのコマンドパターン実装。

#### 11.1.2 履歴スタック構造

```javascript
{
  undoStack: [Action, Action, ...],  // Undo用スタック
  redoStack: [Action, Action, ...],  // Redo用スタック
  maxSize: 100                        // 最大履歴数
}
```

#### 11.1.3 アクション構造

```javascript
interface Action {
  type: string;           // アクションタイプ
  layerId: string;        // 対象レイヤーID
  before: ImageData;      // 変更前のデータ
  after: ImageData;       // 変更後のデータ
  timestamp: number;      // タイムスタンプ
}
```

#### 11.1.4 API

```javascript
// 履歴追加
historyManager.push(action)

// Undo
historyManager.undo()

// Redo
historyManager.redo()

// 履歴クリア
historyManager.clear()

// 変更監視
historyManager.subscribe(handler)
```

### 11.2 ベクターレイヤー状態 (vector-layer-state.js)

```javascript
interface VectorLayerState {
  paths: Path[];          // パスの配列
  selectedPath: number;   // 選択中のパスインデックス
  selectedPoints: number[]; // 選択中の頂点
  editMode: 'select' | 'add' | 'edit';
}

interface Path {
  id: string;
  type: 'bezier' | 'line' | 'polygon';
  points: Point[];
  closed: boolean;
  style: PathStyle;
}
```

---

## 12. 拡張機能

### 12.1 カスタムツールの作成

#### 12.1.1 基本構造

```javascript
// tools/custom/my-tool.js
export const myTool = {
  id: 'my-tool',
  cursor: 'crosshair',

  onPointerDown(ctx, event, engine) {
    // マウス押下時の処理
  },

  onPointerMove(ctx, event, engine) {
    // マウス移動時の処理
  },

  onPointerUp(ctx, event, engine) {
    // マウス解放時の処理
  },

  drawPreview(overlayCtx) {
    // プレビュー描画（オプション）
  }
};
```

#### 12.1.2 登録方法

```javascript
// マニフェストに追加
{
  id: 'custom',
  label: 'カスタムツール',
  tools: [
    { id: 'my-tool', label: 'マイツール', shortcut: 'X' }
  ]
}
```

### 12.2 カスタムフィルターの作成

```javascript
// filters/my-filter.js
export const myFilter = {
  id: 'my-filter',
  label: 'マイフィルター',

  apply(imageData, options) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // ピクセル操作
      data[i] = /* R */;
      data[i + 1] = /* G */;
      data[i + 2] = /* B */;
      data[i + 3] = /* A */;
    }
    return imageData;
  }
};
```

---

## 13. 技術仕様

### 13.1 パフォーマンス最適化

| 技術 | 適用箇所 | 効果 |
|------|---------|------|
| requestAnimationFrame | レンダリング | 滑らかな描画 |
| オフスクリーンCanvas | レイヤー | メモリ効率化 |
| デバウンス | オートセーブ | CPU負荷軽減 |
| イベントプーリング | ポインター | GC負荷軽減 |

### 13.2 メモリ管理

| 項目 | 制限値 |
|------|-------|
| 最大キャンバスサイズ | 16384 x 16384 px |
| 最大レイヤー数 | 100 |
| 履歴最大数 | 100 |
| オートセーブサイズ | 50MB |

### 13.3 セキュリティ

- XSS対策: ユーザー入力のエスケープ
- CSP対応: インラインスクリプトなし
- Same-Origin: クリップボード操作の制限

### 13.4 アクセシビリティ

- キーボードナビゲーション
- ARIA属性
- フォーカス管理
- 高コントラストモード対応

### 13.5 ファイルサイズ

| ファイル種別 | サイズ（概算） |
|-------------|--------------|
| JavaScript (合計) | ~300KB (非圧縮) |
| CSS | ~15KB |
| HTML | ~5KB |

---

## 付録

### A. 用語集

| 用語 | 説明 |
|------|------|
| ラスター | ピクセルベースの画像形式 |
| ベクター | パス・図形ベースの画像形式 |
| レイヤー | 重ね合わせ可能な描画面 |
| ブレンドモード | レイヤー合成方式 |
| スポイト | 色を取得するツール |
| パン | キャンバスの表示位置移動 |

### B. エラーコード

| コード | 説明 | 対処法 |
|--------|------|--------|
| E001 | キャンバス初期化エラー | ブラウザを更新 |
| E002 | ファイル読み込みエラー | ファイル形式を確認 |
| E003 | メモリ不足 | レイヤー数を削減 |
| E004 | オートセーブエラー | ストレージ空き容量を確認 |

### C. 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 1.0 | 2025-11-23 | 初版作成 |

---

**著作権**: SimplePaint Project
**ライセンス**: MIT License
