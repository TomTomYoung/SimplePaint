export function makeEllipse2(store) {
        const id = 'ellipse-2';
        let stage = 0,
          cx = 0,
          cy = 0,
          rx = 0,
          ry = 0,
          rot = 0;
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
              rx = Math.abs(ev.img.x - cx);
              ry = Math.abs(ev.img.y - cy);
              rot = 0;
              stage = 2;
            } else if (stage === 2) {
              const s = store.getToolState(id);
              ctx.save();
              ctx.lineWidth = s.brushSize;
              ctx.strokeStyle = s.primaryColor;
              if (store.getToolState(id).fillOn) ctx.fillStyle = s.secondaryColor;
              ctx.beginPath();
              ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
              if (store.getToolState(id).fillOn) ctx.fill();
              ctx.stroke();
              ctx.restore();
              eng.expandPendingRectByRect(
                cx - rx - s.brushSize,
                cy - ry - s.brushSize,
                rx * 2 + s.brushSize * 2,
                ry * 2 + s.brushSize * 2
              );
              stage = 0;
            }
          },
          onPointerMove(ctx, ev) {
            if (stage === 1) {
              rx = Math.abs(ev.img.x - cx);
              ry = Math.abs(ev.img.y - cy);
            } else if (stage === 2) {
              rot = Math.atan2(ev.img.y - cy, ev.img.x - cx);
            }
          },
          onPointerUp() {},
          drawPreview(octx) {
            if (stage > 0) {
              const s = store.getToolState(id);
              octx.save();
              octx.lineWidth = s.brushSize;
              octx.strokeStyle = s.primaryColor;
              octx.beginPath();
              octx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
              octx.stroke();
              octx.restore();
            }
          },
        };
      }
