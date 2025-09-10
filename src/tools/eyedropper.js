import { bmp, bctx } from '../layer.js';
import { toHex } from '../utils/helpers.js';

export function makeEyedropper(store) {
  return {
    id: 'eyedropper',
    cursor: 'copy',
    onPointerDown(ctx, ev) {
      const x = Math.floor(ev.img.x),
        y = Math.floor(ev.img.y);
      if (x < 0 || y < 0 || x >= bmp.width || y >= bmp.height) return;
      const { data } = bctx.getImageData(x, y, 1, 1);
      store.set({ primaryColor: toHex(data[0], data[1], data[2]) });
    },
    onPointerMove() {},
    onPointerUp() {},
  };
}
