import { floodFill } from '../utils/drawing.js';

export function makeBucket(store) {
  return {
    id: 'bucket',
    cursor: 'pointer',
    onPointerDown(ctx, ev, eng) {
      const h = store.getState().primaryColor;
      const r = parseInt(h.slice(1, 3), 16),
        g = parseInt(h.slice(3, 5), 16),
        b = parseInt(h.slice(5, 7), 16);
      const p = floodFill(
        ctx,
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
