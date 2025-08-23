      function makeArc(store) {
        let stage = 0,
          cx = 0,
          cy = 0,
          r = 0,
          start = 0,
          end = 0;
        return {
          id: "arc",
          cursor: "crosshair",
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
              const s = store.getState();
              ctx.save();
              ctx.lineWidth = s.brushSize;
              ctx.strokeStyle = s.primaryColor;
              ctx.beginPath();
              ctx.arc(cx, cy, r, start, end);
              ctx.stroke();
              ctx.restore();
              const minX = cx - r,
                minY = cy - r;
              eng.expandPendingRectByRect(
                minX - s.brushSize,
                minY - s.brushSize,
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
              const s = store.getState();
              octx.save();
              octx.lineWidth = s.brushSize;
              octx.strokeStyle = s.primaryColor;
              octx.beginPath();
              octx.arc(cx, cy, r, start, end);
              octx.stroke();
              octx.restore();
            }
          },
        };
      }
