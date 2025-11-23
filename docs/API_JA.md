# SimplePaint API リファレンス

本ドキュメントは SimplePaint ランタイムが公開するパブリックモジュールについて説明します。サードパーティ製ツールや拡張機能がアプリケーションと統合する際に依存できるコントラクトに焦点を当てています。

## コアエンジン

### `src/core/engine.js`
- **`Engine` クラス** – キャンバスコンテキストスタック、アクティブツール、履歴統合を含む描画セッションのライフサイクルを調整します。
- **`engine.register(tool)`** – ファクトリから生成されたツールオブジェクトをインストールします。
- **`engine.setTool(toolId)`** – ID でアクティブツールを切り替えます。
- **`engine.beginStrokeSnapshot()` / `engine.finishStrokeToHistory()`** – 直接的なピクセル変更をラップし、履歴スタックに変更前後のスナップショットを記録します。
- **`engine.expandPendingRect(x, y, radius)`** – 塗られた領域をマークし、履歴スナップショットをクリップできるようにします。
- **`engine.clearSelection()`** – アクティブな選択範囲と関連するオーバーレイを解除します。
- **`engine.requestRepaint()`** – レイヤーとオーバーレイを合成し、ビューポートと同期します。

### `src/core/store.js`
- **`createStore(initialState?, eventBus?)`** – 共有 `EventBus` インスタンスに接続されたリアクティブストアを作成します。
- **`Store#getState()`** – 現在の状態スナップショットのディープクローンを返します。
- **`Store#set(updates, options?)`** – 更新を状態にマージし、サブスクライバーに通知します。
- **`Store#replaceState(nextState, options?)`** – 状態ツリー全体を置き換えます。
- **`Store#subscribe(handler)`** – 全状態変更をリッスンします。
- **`Store#watch(selector, callback, options?)`** – カスタム比較ロジックを使用して派生スライスをサブスクライブします。
- **`Store#getToolState(id, defaults?)`** – 共有デフォルトとマージされたツールごとの設定を読み取ります。
- **`Store#setToolState(id, updates, options?)`** – ツール固有の設定を永続化します。
- **`Store#resetToolState(id, options?)`** – デフォルトのツール設定を復元します。
- **`Store#clearToolState(id, options?)`** – ツールの保存された状態を削除します。
- **`defaultState` / `toolDefaults`** – ストアの初期化に使用されるフリーズされたベースラインオブジェクト。

## ツールレジストリ

### `src/tools/base/registry.js`
- **`createDefaultTools(store, manifest?)`** – マニフェストに記述されたすべてのツールファクトリをインスタンス化します。
- **`registerDefaultTools(engine, store, manifest?)`** – インスタンス化されたツールオブジェクトをエンジンに登録します。

### `src/tools/base/manifest.js`
- **`DEFAULT_TOOL_MANIFEST`** – UI 内のツールの標準的な順序を定義するカテゴリのフリーズされた配列。
- **`DEFAULT_TOOL_IDS`** – マニフェストから派生したツール識別子のフリーズされた配列。
- **`flattenToolManifest(manifest?)`** – カテゴリをツールエントリの単一の順序付き配列にフラット化します。
- **`collectToolIds(manifest?)`** – マニフェスト順のツール識別子の配列を返します。
- **`createToolIndex(manifest?)`** – 迅速な検索のためにツール ID でキー付けされた `Map` を構築します。
- **`getToolEntryById(id, manifest?)`** – 識別子でマニフェストエントリを解決します。
- **`getToolCategoryForId(id, manifest?)`** – ツールを含むカテゴリレコードを返します（存在する場合）。

## イベント

### `src/core/event-bus.js`
- **`EventBus` クラス** – ランタイム全体で使用される軽量な pub/sub 実装。
- **`EventBus#on(event, handler, options?)` / `EventBus#once(event, handler, options?)`** – オプションの abort シグナルと once セマンティクスでリスナーをアタッチします。
- **`EventBus#emit(event, payload)` / `EventBus#emitAsync(event, payload)`** – イベントを同期的または非同期的にブロードキャストします。
- **`EventBus#off(event, handler)`** – 以前に登録されたリスナーを削除します。
- **`EventBus#clear(event?)`** – グローバルまたは特定のイベントのリスナーを削除します。
- **`EventBus#listeners(event)`**, **`EventBus#listenerCount(event)`**, **`EventBus#has(event)`** – 計測用の検査ヘルパー。

## レイヤー

### `src/core/layer.js`
- **`layers` / `activeLayer`** – ドキュメントスタックを表す共有キャンバス要素とアクティブレイヤーのインデックス。
- **`flattenLayers(ctx)`** – 表示可能なレイヤーを指定されたコンテキストに合成します。
- **`renderLayers()`** – ビューポートを支える共有ビットマップを更新します。
- **`updateLayerList(engine)`** – レイヤーパネル UI バインディングを更新します。
- **`setActiveLayer(index, engine)`** – アクティブレイヤーを変更し、再描画をトリガーします。
- **`moveLayer(from, to, engine)`** – レイヤーを並べ替え、履歴エントリを更新します。
- **`addLayer(engine)` / `deleteLayer(engine)`** – キャンバスレイヤーのスタックを管理します。

## ユーティリティ

### `src/utils/canvas/`
- ラスターバッファ、オーバーレイの管理、ユーザー選択のエクスポート用のキャンバスヘルパー。

### `src/utils/geometry/`
- ツール間で共有されるベクトル計算ヘルパー、衝突検出、形状テッセレーションユーティリティ。

### `src/utils/color-space.js`
- RGB、HSV、L*a*b* カラースペース間の変換。

### `src/utils/math/`
- 補間、ノイズ、ランダム分布、スムージングカーネル。

### `src/utils/path.js`
- ベジェヘルパー、ポリライン簡略化、カーソルスナップロジック。

## ツールインターフェース

カスタムツールが満たすべきコントラクトについては [tool-interface_JA.md](./tool-interface_JA.md) を参照してください。

### `src/types/tool.js`
- **`ToolPointerEvent`** – ツールポインターハンドラに渡される正規化されたペイロード。
- **`Tool`** – エンジンに登録されるツールオブジェクトの構造的コントラクト。
- **`ToolFactory`** – マニフェストとレジストリヘルパーで使用されるファクトリシグネチャ。
- **`ToolManifest` / `ToolManifestEntry` / `ToolManifestCategory`** – マニフェストとカテゴリレイアウトを記述するデータ構造。

## 拡張性フック

- **ツール登録** – カスタムエントリを含むマニフェストで `registerDefaultTools(engine, store, manifest)` を呼び出すか、ファクトリが返すツールオブジェクトを手動で `engine.register` します。
- **ストアウォッチャー** – `store.watch` を使用して、状態を直接変更せずにビューポートやレイヤーの変更に反応します。
- **イベントバス** – グローバルジェスチャーやオーバーレイのために `pointer:*` イベントをサブスクライブします。

## バージョニング

API はセマンティックバージョニングに従います。破壊的変更は `docs/PROGRESS.md` チェンジログで発表されます。拡張機能は回帰を避けるために特定のマイナーバージョンに固定する必要があります。
