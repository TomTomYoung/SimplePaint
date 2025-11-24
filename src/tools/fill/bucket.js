// ツール仕様: 概要=領域を塗りつぶすバケツツール。 入力=ポインタクリック、必要に応じて修飾キー。 出力=塗りつぶされたラスターピクセル。 操作=クリックした領域を指定色で塗りつぶし、隣接ピクセルの閾値を考慮。
import { floodFill } from '../../utils/drawing.js';
import { bmp, activeLayer } from '../../core/layer.js';

export function makeBucket(store) {
  return {
    id: 'bucket',
    cursor: 'pointer',
    onPointerDown(ctx, ev, eng) {
      const h = store.getToolState('bucket').primaryColor;
      const r = parseInt(h.slice(1, 3), 16),
        g = parseInt(h.slice(3, 5), 16),
        b = parseInt(h.slice(5, 7), 16);
      const p = floodFill(
        ctx,
        bmp,
        Math.floor(ev.img.x),
        Math.floor(ev.img.y),
        [r, g, b, 255],
        16,
      );
      if (p) {
        if (typeof p.layer !== 'number') {
          p.layer = activeLayer;
        }
        eng.history.pushPatch(p);
        eng.requestRepaint();
      }

    },
    onPointerMove() {},
    onPointerUp() {},
  };
}
