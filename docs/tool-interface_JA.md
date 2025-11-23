# ツールインターフェースガイド

本ドキュメントは、ツールキットがカテゴリフォルダに再編成された後の SimplePaint におけるペイントツールの構造を要約します。

ランタイムは [`src/types/tool.js`](../src/types/tool.js) に共有の JSDoc typedef を提供するようになりました。これらの定義をモジュールにインポートすることで、一貫した IntelliSense が確保され、エディターがマニフェストとツールハンドラの形状を検証できるようになります。

```js
/** @typedef {import('../types/tool.js').ToolFactory} ToolFactory */
/** @typedef {import('../types/tool.js').ToolPointerEvent} ToolPointerEvent */
```

## ファクトリパターン

すべてのツールモジュールは、共有の [`Store`](../src/core/store.js) インスタンスを受け取る `make*` ファクトリをエクスポートします。ファクトリはツールの動作を記述するプレーンオブジェクトを返します。ツールは [`registerDefaultTools`](../src/tools/base/registry.js) から登録され、各ファクトリをストアで呼び出し、結果を [`Engine.register`](../src/core/engine.js) に渡します。

```js
// src/tools/drawing/pencil.js
export function makePencil(store) {
  const id = 'pencil';
  return {
    id,
    cursor: 'crosshair',
    onPointerDown(ctx, event, engine) {
      // ...
    },
    onPointerMove(ctx, event, engine) {
      // ...
    },
    onPointerUp(ctx, event, engine) {
      // ...
    },
  };
}
```

ファクトリはヘルパー関数やキャッシュをクロージャーで囲むことができます。異なるツール間で可変状態を再利用すべきではありません。ファクトリ本体内で新しい状態を作成してください。

### ツールマニフェストとカテゴリ

[`src/tools/base/manifest.js`](../src/tools/base/manifest.js) は、カテゴリごとにグループ化された組み込みツールの正規リストを宣言します。各エントリはツール識別子とインスタンス化に使用されるファクトリを格納します。マニフェストはロード時にフリーズされるため、テストやエディターパネルは安定した構造に依存できます。マニフェストと一緒にエクスポートされるヘルパーユーティリティには以下が含まれます：

- `flattenToolManifest(manifest)` — カテゴリメンバーシップメタデータを保持しながら、ツールエントリのフラット配列を返します。
- `collectToolIds(manifest)` — 一意性チェックに便利な識別子の配列を返します。
- `DEFAULT_TOOL_IDS` — 出荷されたすべてのツール ID のフリーズされた配列。
- `createToolIndex(manifest)` — ツール ID でキー付けされた `Map` を返し、重複がある場合はスローします。
- `getToolEntryById(id, manifest)` — 指定された ID のマニフェストエントリを取得するか、存在しない場合は `null` を返します。
- `getToolCategoryForId(id, manifest)` — ツールを含むカテゴリレコードを返し、UI ウィジェットのグループ化に便利です。

[`registerDefaultTools`](../src/tools/base/registry.js) は単にマニフェストをフラット化し、各ファクトリをインスタンス化し、結果のツールオブジェクトをエンジンに渡します。インスタンス化されたツールオブジェクトのみが必要な場合（例：パネルでツールメタデータをプレビューする場合）、`createDefaultTools(store)` を呼び出すことで、エンジンインスタンスに登録せずに同じ配列を取得できます。

## 必須プロパティ

すべてのツールオブジェクトは以下のメンバーを定義する**必要があります**：

- `id` — ストアとエンジンの検索に使用される一意の識別子文字列。
- `onPointerDown(ctx, event, engine)` — キャンバス上でプライマリポインターが押されたときに呼び出されます。
- `onPointerMove(ctx, event, engine)` — ツールがアクティブな間のポインター移動時に呼び出されます。ツールがプレビューを更新できるように、ポインターが現在押されていなくてもハンドラは呼び出されます。
- `onPointerUp(ctx, event, engine)` — ポインターリリース時に呼び出されます。エンジンは後で影響を受けたピクセルを自動的にスナップショットし、履歴パッチをプッシュします。

最初の引数はアクティブレイヤー用の `CanvasRenderingContext2D` です。`event` 引数は以下を含む正規化されたポインターペイロードです：

| プロパティ | 説明 |
| --- | --- |
| `sx`, `sy` | キャンバス要素に対するスクリーン空間座標。 |
| `img` | ビューポートを介してイメージ空間にマップされた座標。 |
| `button` | ポインターボタンインデックス。 |
| `detail` | プライマリボタンイベントのクリックカウント。 |
| `shift`, `ctrl`, `alt` | モディファイアフラグ（`ctrl` は macOS では `meta` を含む）。 |
| `pressure` | ポインター圧力（0–1）。 |
| `pointerId` | キャプチャロジック用の DOM ポインター識別子。 |
| `type` | DOM イベントタイプ（例：`pointermove`）。 |

`engine` 引数は、履歴追跡、選択制御、ビューポート状態、再描画リクエスト用のヘルパーを公開します。よく使用されるメソッドには以下が含まれます：

- `engine.clearSelection()` — アクティブなマーキーまたはフローティング選択を解除します。
- `engine.beginStrokeSnapshot()` / `engine.finishStrokeToHistory()` — 直接的なピクセル変更をラップし、履歴パッチに変更前後の画像データを含めます。
- `engine.expandPendingRect(x, y, radius)` — スナップショットをその領域に制限できるように、ストロークが触れた領域をエンジンに通知します。
- `engine.requestRepaint()` — すべてのレイヤーとオーバーレイの合成をスケジュールします。

## オプションプロパティ

ツールは追加のエンジン機能と統合するために以下のメンバーも定義できます：

| プロパティ | 目的 |
| --- | --- |
| `cursor` | ツールがアクティブなときに適用される CSS カーソル文字列。 |
| `previewRect` | 現在のプレビュー境界を記述する矩形。定義されている場合、エンジンは矩形の周りにマーチングアンツを描画します。 |
| `drawPreview(overlayCtx)` | 各フレームでオーバーレイキャンバス上にカスタムオーバーレイ（例：ガイド）をレンダリングします。 |
| `cancel()` | ユーザーが Escape を押すか右クリックしたときに内部状態をリセットします。 |
| `onEnter(ctx, engine)` | ユーザーが Enter を押したときに現在のプレビューをコミットします。 |

ツールが独自の状態を管理する限り、追加のヘルパーを追加できます。

## ツール状態の操作

ツールごとの設定は共有 `Store` インスタンスを通じて保存されます。ストアは以下を公開します：

- `store.getToolState(id, defaults?)` — [`toolDefaults`](../src/core/store.js) とマージされた現在の設定の浅いコピーを取得します。ツールが独自のスキーマを管理する場合、共有デフォルトをスキップするには `defaults = null` を渡します。
- `store.setToolState(id, updates, options?)` — 変更を永続化します。状態オブジェクト全体を書き込む場合は `{ replace: true }` を使用し、ツールが UI リフレッシュをトリガーせずに内部キャッシュを更新する場合は `{ silent: true }` を使用します。
- `store.resetToolState(id, options?)` — デフォルトを復元します。フィルター適用後やツール切り替え時によく使用されます。

オートセーブと履歴検査が正しく動作し続けるように、すべての状態オブジェクトはシリアライズ可能である必要があります。

## 登録フロー

1. `src/tools/` の適切なカテゴリフォルダにファクトリを実装します。
2. モジュールからファクトリをエクスポートします。
3. [`src/tools/base/registry.js`](../src/tools/base/registry.js) 内の関連配列にファクトリを追加します。レジストリは登録順序を制御し、起動時に選択されるプライマリツールも決定します。
4. アプリが起動すると、[`PaintApp.registerTools`](../src/app.js) が `registerDefaultTools` を呼び出し、新しいツールが GUI で利用可能になります。ツールボタンは、ストアを介してアクティブ化するために一致する `data-tool` 属性が必要です。

## 例：軽量プレビューツール

以下のパターンは、ピクセルをコミットする前にジオメトリをプレビューするシェイプツールで一般的です：

```js
export function makeArc(store) {
  const id = 'arc';
  let start = null;
  return {
    id,
    cursor: 'crosshair',
    previewRect: null,
    onPointerDown(ctx, event, engine) {
      start = event.img;
      engine.beginStrokeSnapshot();
    },
    onPointerMove(ctx, event) {
      if (!start) return;
      this.previewRect = computeArcRect(start, event.img);
      drawGhostArc(ctx, start, event.img);
    },
    onPointerUp(ctx, event, engine) {
      if (!start) return;
      commitArc(ctx, start, event.img, store.getToolState(id));
      this.previewRect = null;
      start = null;
      engine.finishStrokeToHistory();
    },
    cancel() {
      this.previewRect = null;
      start = null;
    }
  };
}
```

このコントラクトに従うことで、新しいツールは追加の配線なしに履歴、オーバーレイ、キーボードショートカット、オートセーブにプラグインできます。
