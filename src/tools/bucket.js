import { floodFill } from '../utils/drawing.js';
import { bmp } from '../core/layer.js';

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
      if (p) eng.history.pushPatch(p);

    },
    onPointerMove() {},
    onPointerUp() {},
  };
}
