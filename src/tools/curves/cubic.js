export function makeCubic(store) {
        const id = 'cubic';
        let stage = 0,
          p0 = null,
          p1 = null,
          p2 = null,
          p3 = null;
        return {
          id,
          cursor: 'crosshair',
          previewRect: null,
          onPointerDown(ctx, ev, eng) {
            if (stage === 0) {
              p0 = { ...ev.img };
              stage = 1;
            } else if (stage === 1) {
              p1 = { ...ev.img };
              stage = 2;
            } else if (stage === 2) {
              p2 = { ...ev.img };
              stage = 3;
            } else if (stage === 3) {
              p3 = { ...ev.img };
              const s = store.getToolState(id);
              ctx.save();
              ctx.lineWidth = s.brushSize;
              ctx.strokeStyle = s.primaryColor;
              ctx.beginPath();
              ctx.moveTo(p0.x + 0.5, p0.y + 0.5);
              ctx.bezierCurveTo(
                p1.x + 0.5,
                p1.y + 0.5,
                p2.x + 0.5,
                p2.y + 0.5,
                p3.x + 0.5,
                p3.y + 0.5
              );
              ctx.stroke();
              ctx.restore();
              const minX = Math.min(p0.x, p1.x, p2.x, p3.x),
                minY = Math.min(p0.y, p1.y, p2.y, p3.y),
                maxX = Math.max(p0.x, p1.x, p2.x, p3.x),
                maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
              eng.expandPendingRectByRect(
                minX - s.brushSize,
                minY - s.brushSize,
                maxX - minX + s.brushSize * 2,
                maxY - minY + s.brushSize * 2
              );
              stage = 0;
              this.previewRect = null;
            }
          },
          onPointerMove(ctx, ev) {
            if (stage === 1) {
              p1 = { ...ev.img };
            } else if (stage === 2) {
              p2 = { ...ev.img };
            } else if (stage === 3) {
              p3 = { ...ev.img };
            }
          },
          onPointerUp() {},
          drawPreview(octx) {
            const s = store.getToolState(id);
            octx.save();
            octx.lineWidth = s.brushSize;
            octx.strokeStyle = s.primaryColor;
            if (stage === 1 && p0 && p1) {
              octx.beginPath();
              octx.moveTo(p0.x + 0.5, p0.y + 0.5);
              octx.lineTo(p1.x + 0.5, p1.y + 0.5);
              octx.stroke();
            } else if (stage === 2 && p0 && p1 && p2) {
              octx.beginPath();
              octx.moveTo(p0.x + 0.5, p0.y + 0.5);
              octx.lineTo(p1.x + 0.5, p1.y + 0.5);
              octx.lineTo(p2.x + 0.5, p2.y + 0.5);
              octx.stroke();
            } else if (stage === 3 && p0 && p1 && p2 && p3) {
              octx.beginPath();
              octx.moveTo(p0.x + 0.5, p0.y + 0.5);
              octx.bezierCurveTo(
                p1.x + 0.5,
                p1.y + 0.5,
                p2.x + 0.5,
                p2.y + 0.5,
                p3.x + 0.5,
                p3.y + 0.5
              );
              octx.stroke();
            }
            octx.restore();
          },
        };
      }
