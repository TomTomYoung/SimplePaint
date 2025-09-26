import { floodFill } from '../utils/drawing.js';
import { bmp } from '../layer.js';

export function makeBucket(store) {
  return {
    id: 'bucket',
    cursor: 'pointer',
    onPointerDown(ctx, ev, eng) {
      const h = store.getToolState('bucket').primaryColor;
      const r = parseInt(h.slice(1, 3), 16),
        g = parseInt(h.slice(3, 5), 16),
        b = parseInt(h.slice(5, 7), 16);
      const patch = floodFill(
        ctx,
        bmp,
        Math.floor(ev.img.x),
        Math.floor(ev.img.y),
        [r, g, b, 255],
        16,
      );
      if (!patch) return;

      if (eng.editMode === 'cell' && eng.selection?.rect) {
        const sel = eng.selection.rect;
        const { rect, before, after } = patch;
        const beforeData = before.data;
        const afterData = after.data;
        let modifiedOutside = false;
        let modifiedInside = false;
        for (let y = 0; y < rect.h; y++) {
          for (let x = 0; x < rect.w; x++) {
            const gx = rect.x + x;
            const gy = rect.y + y;
            const idx = (y * rect.w + x) * 4;
            const inside = eng.pointInRect({ x: gx, y: gy }, sel);
            if (!inside) {
              if (
                afterData[idx] !== beforeData[idx] ||
                afterData[idx + 1] !== beforeData[idx + 1] ||
                afterData[idx + 2] !== beforeData[idx + 2] ||
                afterData[idx + 3] !== beforeData[idx + 3]
              ) {
                afterData[idx] = beforeData[idx];
                afterData[idx + 1] = beforeData[idx + 1];
                afterData[idx + 2] = beforeData[idx + 2];
                afterData[idx + 3] = beforeData[idx + 3];
                modifiedOutside = true;
              }
            } else if (
              !modifiedInside &&
              (afterData[idx] !== beforeData[idx] ||
                afterData[idx + 1] !== beforeData[idx + 1] ||
                afterData[idx + 2] !== beforeData[idx + 2] ||
                afterData[idx + 3] !== beforeData[idx + 3])
            ) {
              modifiedInside = true;
            }
          }
        }
        if (modifiedOutside) {
          ctx.putImageData(after, rect.x, rect.y);
        }
        if (!modifiedInside) {
          return;
        }
      }

      eng.history.pushPatch(patch);
    },
    onPointerMove() {},
    onPointerUp() {},
  };
}
