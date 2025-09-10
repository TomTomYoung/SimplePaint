import { cancelTextEditing, createTextEditor } from '../main.js';

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
