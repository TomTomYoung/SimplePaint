import { makePencil } from '../tools/drawing/pencil.js';
import { makeBrush } from '../tools/drawing/brush.js';
import { makeEraser } from '../tools/drawing/eraser.js';

const factories = { pencil: makePencil, brush: makeBrush, eraser: makeEraser };
export function drawBrushSample(canvas, store, id) {
  const factory = factories[id];
  canvas.hidden = !factory;
  if (!factory) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (id === 'eraser') {
    ctx.fillStyle = '#7b879b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const tool = factory(store);
  const engine = { clearSelection() {}, expandPendingRect() {}, expandPendingRectByRect() {} };
  for (let i = 0; i <= 48; i++) {
    const event = { img: { x: 34 + i * 3, y: 41 + Math.sin(i / 48 * Math.PI * 2) * 7 }, pressure: 1 };
    if (i === 0) tool.onPointerDown(ctx, event, engine);
    else tool.onPointerMove(ctx, event, engine);
  }
  tool.onPointerUp(ctx, {}, engine);
}
