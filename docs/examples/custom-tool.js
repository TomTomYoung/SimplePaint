import { registerTool } from '../../src/tools/_base/registry.js';
import { createToolEntry } from '../../src/tools/_base/manifest.js';

function createStarBrush(context) {
  const stamp = new Path2D('M12 2 L15 9 H22 L17 13 L19 20 L12 16 L5 20 L7 13 L2 9 H9 Z');

  return {
    id: 'star-brush',
    cursor: 'pointer',
    onPointerDown(event, engine) {
      this.onPointerMove(event, engine);
    },
    onPointerMove(event, engine) {
      const { canvasCtx } = engine.getContexts();
      canvasCtx.save();
      canvasCtx.translate(event.x, event.y);
      canvasCtx.scale(context.brush.size / 24, context.brush.size / 24);
      canvasCtx.fill(stamp);
      canvasCtx.restore();
    },
    onPointerUp() {},
    drawPreview(overlayCtx) {
      overlayCtx.strokeStyle = 'rgba(255,255,255,0.5)';
      overlayCtx.beginPath();
      overlayCtx.arc(context.pointer.x, context.pointer.y, context.brush.size / 2, 0, Math.PI * 2);
      overlayCtx.stroke();
    },
  };
}

export function registerStarBrush(manifest) {
  registerTool('star-brush', createStarBrush);
  manifest.push(createToolEntry('star-brush'));
  return manifest;
}
