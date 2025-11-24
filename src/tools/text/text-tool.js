// ツール仕様: 概要=テキストを配置・編集するツール。 入力=クリック、キーボード入力、確定/キャンセルキー。 出力=キャンバス上のテキスト要素。 操作=クリックでカーソルを配置し入力、Enterで確定、Escでキャンセル。
import { cancelTextEditing, createTextEditor } from '../../main.js';

export function makeTextTool(store) {
  return {
    id: 'text',
    cursor: 'text',
    onPointerDown(ctx, ev) {
      cancelTextEditing(true);
      createTextEditor(ev.img.x, ev.img.y, store);
    },
    onPointerMove() {},
    onPointerUp() {},
  };
}
