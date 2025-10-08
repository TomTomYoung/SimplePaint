import { applyStrokeStyle } from '../../utils/stroke-style.js';

export function makeSector(store) {
        const id = 'sector';
        let stage = 0,
          cx = 0,
          cy = 0,
          r = 0,
          start = 0,
          end = 0;
        return {
          id,
          cursor: 'crosshair',
          previewRect: null,
          onPointerDown(ctx, ev, eng) {
            if (stage === 0) {
              cx = ev.img.x;
              cy = ev.img.y;
              stage = 1;
            } else if (stage === 1) {
              r = Math.hypot(ev.img.x - cx, ev.img.y - cy);
              start = Math.atan2(ev.img.y - cy, ev.img.x - cx);
              end = start;
              stage = 2;
            } else if (stage === 2) {
              const s = store.getToolState(id);
              ctx.save();
              ctx.lineWidth = s.brushSize;
              ctx.fillStyle = s.secondaryColor;
              ctx.strokeStyle = s.primaryColor;
              applyStrokeStyle(ctx, s);
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.arc(cx, cy, r, start, end);
              ctx.closePath();
              if (s.fillOn) ctx.fill();
              ctx.stroke();
              ctx.restore();
              eng.expandPendingRectByRect(
                cx - r - s.brushSize,
                cy - r - s.brushSize,
                r * 2 + s.brushSize * 2,
                r * 2 + s.brushSize * 2
              );
              stage = 0;
            }
          },
          onPointerMove(ctx, ev) {
            if (stage === 2) {
              end = Math.atan2(ev.img.y - cy, ev.img.x - cx);
            }
          },
          onPointerUp() {},
          drawPreview(octx) {
            if (stage === 2) {
              const s = store.getToolState(id);
              octx.save();
              octx.lineWidth = s.brushSize;
              octx.strokeStyle = s.primaryColor;
              applyStrokeStyle(octx, s);
              octx.beginPath();
              octx.moveTo(cx, cy);
              octx.arc(cx, cy, r, start, end);
              octx.closePath();
              if (s.fillOn) {
                octx.save();
                octx.globalAlpha = 0.2;
                octx.fillStyle = s.secondaryColor;
                octx.fill();
                octx.restore();
              }
              octx.stroke();
              octx.restore();
            }
          },
        };
      }
