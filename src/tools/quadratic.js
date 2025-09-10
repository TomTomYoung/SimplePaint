      function makeQuadratic(store) {
        const id = 'quad';
        let stage = 0,
          p0 = null,
          p1 = null,
          p2 = null;
        return {
          id,
          cursor: 'crosshair',
          previewRect: null,
          onPointerDown(ctx, ev, eng) {
            if (stage === 0) {
              p0 = { ...ev.img };
              stage = 1;
            } else if (stage === 1) {
              p2 = { ...ev.img };
              p1 = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
              stage = 2;
            } else if (stage === 2) {
              const s = store.getToolState(id);
              ctx.save();
              ctx.lineWidth = s.brushSize;
              ctx.strokeStyle = s.primaryColor;
              ctx.beginPath();
              ctx.moveTo(p0.x + 0.5, p0.y + 0.5);
              ctx.quadraticCurveTo(
                p1.x + 0.5,
                p1.y + 0.5,
                p2.x + 0.5,
                p2.y + 0.5
              );
              ctx.stroke();
              ctx.restore();
              const minX = Math.min(p0.x, p1.x, p2.x),
                minY = Math.min(p0.y, p1.y, p2.y),
                maxX = Math.max(p0.x, p1.x, p2.x),
                maxY = Math.max(p0.y, p1.y, p2.y);
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
            if (stage === 2) {
              p1 = { ...ev.img };
            }
          },
          onPointerUp() {},
          drawPreview(octx) {
            if (stage === 2) {
            const s = store.getToolState(id);
              octx.save();
              octx.lineWidth = s.brushSize;
              octx.strokeStyle = s.primaryColor;
              octx.beginPath();
              octx.moveTo(p0.x + 0.5, p0.y + 0.5);
              octx.quadraticCurveTo(
                p1.x + 0.5,
                p1.y + 0.5,
                p2.x + 0.5,
                p2.y + 0.5
              );
              octx.stroke();
              octx.restore();
            }
          },
        };
      }
