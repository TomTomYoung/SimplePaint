export function makeFreehand(store) {
        const id = 'freehand';
        let pts = [],
          drawing = false;
        return {
          id,
          cursor: 'crosshair',
          previewRect: null,
          onPointerDown(ctx, ev) {
            drawing = true;
            pts = [{ ...ev.img }];
          },
          onPointerMove(ctx, ev) {
            if (drawing) pts.push({ ...ev.img });
          },
          onPointerUp(ctx, ev, eng) {
            if (!drawing) return;
            drawing = false;
            pts.push({ ...ev.img });
            const s = store.getToolState(id);
            const sm = catmullRomSpline(pts, 8);
            ctx.save();
            ctx.lineWidth = s.brushSize;
            ctx.strokeStyle = s.primaryColor;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(sm[0].x + 0.5, sm[0].y + 0.5);
            for (let i = 1; i < sm.length; i++)
              ctx.lineTo(sm[i].x + 0.5, sm[i].y + 0.5);
            ctx.stroke();
            ctx.restore();
            let minX = sm[0].x,
              maxX = sm[0].x,
              minY = sm[0].y,
              maxY = sm[0].y;
            sm.forEach((p) => {
              minX = Math.min(minX, p.x);
              maxX = Math.max(maxX, p.x);
              minY = Math.min(minY, p.y);
              maxY = Math.max(maxY, p.y);
            });
            eng.expandPendingRectByRect(
              minX - s.brushSize,
              minY - s.brushSize,
              maxX - minX + s.brushSize * 2,
              maxY - minY + s.brushSize * 2
            );
            pts = [];
          },
          drawPreview(octx) {
            if (drawing && pts.length > 1) {
              const sm = catmullRomSpline(pts, 8);
              octx.save();
              octx.lineWidth = store.getToolState(id).brushSize;
              octx.strokeStyle = store.getToolState(id).primaryColor;
              octx.beginPath();
              octx.moveTo(sm[0].x + 0.5, sm[0].y + 0.5);
              for (let i = 1; i < sm.length; i++)
                octx.lineTo(sm[i].x + 0.5, sm[i].y + 0.5);
              octx.stroke();
              octx.restore();
            }
          },
        };
      }
