      function makeBSpline(store) {
        let pts = [],
          fresh = true,
          hover = null;
        const reset = () => {
          pts = [];
          fresh = true;
          hover = null;
        };

        function finalize(ctx, eng) {
          if (pts.length < 4) {
            reset();
            eng.requestRepaint();
            return;
          }
          const s = store.getState();
          const cr = bspline(pts);
          ctx.save();
          ctx.lineWidth = s.brushSize;
          ctx.strokeStyle = s.primaryColor;
          ctx.beginPath();
          ctx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
          for (let i = 1; i < cr.length; i++) {
            ctx.lineTo(cr[i].x + 0.5, cr[i].y + 0.5);
          }
          ctx.stroke();
          ctx.restore();

          let minX = cr[0].x,
            maxX = cr[0].x,
            minY = cr[0].y,
            maxY = cr[0].y;
          cr.forEach((p) => {
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
          eng.finishStrokeToHistory();
          eng.requestRepaint();
          reset();
        }

        return {
          id: "bspline",
          cursor: "crosshair",
          previewRect: null,
          onEnter(ctx, eng) {
            finalize(ctx, eng);
          },
          cancel() {
            reset();
            engine.requestRepaint();
          },
          onPointerDown(ctx, ev, eng) {
            if (ev.button === 0 && ev.detail === 2) {
              if (pts.length === 0) eng.beginStrokeSnapshot();
              pts.push({ ...ev.img });
              finalize(ctx, eng);
              return;
            }
            if (fresh) {
              pts = [];
              fresh = false;
            }
            pts.push({ ...ev.img });
          },
          onPointerMove(ctx, ev) {
            hover = { ...ev.img };
          },
          onPointerUp() {},
          drawPreview(octx) {
            const s = store.getState();
            octx.save();
            octx.lineWidth = s.brushSize;
            octx.strokeStyle = s.primaryColor;

            const need = 4;
            if (pts.length >= need) {
              const src = hover ? [...pts, hover] : pts;
              const cr = bspline(src);
              if (cr.length >= 2) {
                octx.beginPath();
                octx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
                for (let i = 1; i < cr.length; i++) {
                  octx.lineTo(cr[i].x + 0.5, cr[i].y + 0.5);
                }
                octx.stroke();
              }
            } else if (pts.length >= 1) {
              const poly = hover ? [...pts, hover] : pts;
              if (poly.length >= 2) {
                octx.beginPath();
                octx.moveTo(poly[0].x + 0.5, poly[0].y + 0.5);
                for (let i = 1; i < poly.length; i++) {
                  octx.lineTo(poly[i].x + 0.5, poly[i].y + 0.5);
                }
                octx.stroke();
              } else if (poly.length === 1 && hover) {
                octx.beginPath();
                octx.moveTo(poly[0].x + 0.5, poly[0].y + 0.5);
                octx.lineTo(hover.x + 0.5, hover.y + 0.5);
                octx.stroke();
              }
            }
            octx.restore();
          },
        };
      }
