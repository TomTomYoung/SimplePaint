/*
 * ツール仕様
 * 概要: キャンバスから色を取得するスポイトツール。
 * 入力: ポインタクリック、必要に応じて修飾キー。
 * 出力: 取得した色のサンプリング結果。
 * 操作: クリックで対象ピクセルの色を取得し、現在の描画色に設定。長押し中にプレビュー更新。
 */
import { bmp, bctx } from '../../core/layer.js';
import { toHex } from '../../utils/color/index.js';

export function makeEyedropper(store) {
  return {
    id: 'eyedropper',
    cursor: 'copy',
    onPointerDown(ctx, ev) {
      const x = Math.floor(ev.img.x),
        y = Math.floor(ev.img.y);
      if (x < 0 || y < 0 || x >= bmp.width || y >= bmp.height) return;
      const { data } = bctx.getImageData(x, y, 1, 1);
      store.setToolState('eyedropper', { primaryColor: toHex(data[0], data[1], data[2]) });
    },
    onPointerMove() {},
    onPointerUp() {},
  };
}
