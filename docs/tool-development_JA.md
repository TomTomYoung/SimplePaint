# ツール開発ガイド

本ガイドは、マニフェストとレジストリのインフラストラクチャを使用して SimplePaint 用のカスタムツールを構築する方法を説明します。

## 1. プロジェクトセットアップ

1. `src/tools/` 配下の正しいカテゴリ内に新しいファイルを作成します。例：`src/tools/drawing/spray.js`。
2. 共有 `Store` インスタンスを受け取り、ツールライフサイクルハンドラを返すファクトリ関数をエクスポートします。

```javascript
// src/tools/drawing/spray.js
import { sampleGaussian } from '../../utils/math/random.js';

/** @typedef {import('../../types/tool.js').ToolFactory} ToolFactory */
/** @typedef {import('../../types/tool.js').ToolPointerEvent} ToolPointerEvent */

/** @type {ToolFactory} */
export function makeSpray(store) {
  const id = 'spray';
  let drawing = false;

  function stamp(ctx, x, y) {
    const settings = store.getToolState(id);
    const radius = settings.brushSize ?? 12;
    for (let i = 0; i < 24; i += 1) {
      const [dx, dy] = sampleGaussian(0, radius);
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }

  return {
    id,
    cursor: 'crosshair',
    /** @param {ToolPointerEvent} event */
    onPointerDown(ctx, event, engine) {
      drawing = true;
      engine.clearSelection();
      const settings = store.getToolState(id);
      engine.expandPendingRect(event.img.x, event.img.y, settings.brushSize ?? 12);
      stamp(ctx, event.img.x, event.img.y);
    },
    /** @param {ToolPointerEvent} event */
    onPointerMove(ctx, event, engine) {
      if (!drawing) return;
      const settings = store.getToolState(id);
      engine.expandPendingRect(event.img.x, event.img.y, settings.brushSize ?? 12);
      stamp(ctx, event.img.x, event.img.y);
    },
    onPointerUp() {
      drawing = false;
    },
    drawPreview() {},
  };
}
```

## 2. ツールの登録

レジストリに渡されるマニフェストにツールを追加します。デフォルトのマニフェストはフリーズされているため、エントリを含む新しいマニフェストを作成し、起動時に `registerDefaultTools` に提供します。

```javascript
// src/app.js（またはブートストラップを構成する場所）
import { DEFAULT_TOOL_MANIFEST } from './tools/base/manifest.js';
import { registerDefaultTools } from './tools/base/registry.js';
import { makeSpray } from './tools/drawing/spray.js';

const sprayEntry = Object.freeze({
  id: 'spray',
  factory: makeSpray,
  categoryId: 'drawing',
});

const manifestWithSpray = Object.freeze(
  DEFAULT_TOOL_MANIFEST.map((category) =>
    category.id === 'drawing'
      ? Object.freeze({
          ...category,
          tools: Object.freeze([...category.tools, sprayEntry]),
        })
      : category,
  ),
);

registerDefaultTools(engine, store, manifestWithSpray);
```

## 3. ツールコンテキスト

ファクトリは共有 `Store` インスタンスを受け取ります。ストアを使用して設定を読み書きし、すべてのライフサイクルハンドラに提供される `Engine` インスタンスのメソッドを呼び出します。

ポインターハンドラは DOM ポインターイベントを正規化した [`ToolPointerEvent`](../src/types/tool.js) を受け取ります：

- `event.sx` / `event.sy` – キャンバス要素に対するスクリーン空間座標。
- `event.img` – ビューポートを介してイメージ空間にマップされた `{ x, y }` 座標。
- `event.button` / `event.detail` – ポインターボタンインデックスとクリックカウント。
- `event.shift`, `event.ctrl`, `event.alt` – モディファイア状態フラグ（`ctrl` は macOS では `meta` を含む）。
- `event.pressure` – `[0, 1]` 範囲のスタイラス圧力値。
- `event.pointerId` – ポインターキャプチャロジック用の安定した識別子。
- `event.type` – 元の DOM ポインターイベントタイプ。

## 4. 状態管理

- `store.getState()` を使用してリアクティブデータを読み取ります。
- `store.set(updates)` を使用してスライスを更新します。冗長なレンダリングを避けるために関連する変更をグループ化します。
- `store.watch(selector, callback)` を使用して、レイヤーの不透明度やビューポートズームなどの派生状態に対応します。

## 5. 描画戦略

- 複雑なブラシの場合はオフスクリーンバッファに描画し、その後メインキャンバスに合成することを推奨します。
- 直接描画する場合は、`engine.beginStrokeSnapshot()` / `engine.finishStrokeToHistory()` で操作をラップし、正しい履歴スナップショットを確保します。
- ホバーアウトラインやオーバーレイのために `drawPreview` 関数を提供します。

## 6. パフォーマンスのヒント

- ポインターイベント間で高コストな計算をキャッシュします。
- ヘルパーを再実装する代わりに、`src/utils/`（geometry、math、image）のユーティリティを使用します。
- ツールが長時間のストロークを発行する場合は、履歴エントリをデバウンスします。

## 7. テスト

`test/tools/` の下にユニットテストまたは統合テストを追加し、ポインターイベントをシミュレートしてキャンバスの変更をアサートします。既存の pencil テストをテンプレートとして使用してください。

## 8. 配布

サードパーティのツールバンドルは、エンジンコンテキストを受け取り、`engine.register` を呼び出すか、`registerDefaultTools` にマニフェストを提供してツールを登録する関数をエクスポートする必要があります。必要なアセットと設定を README に文書化してください。

ランタイムの詳細については、[アーキテクチャ概要](./architecture_JA.md)と [API リファレンス](./API_JA.md)を参照してください。
