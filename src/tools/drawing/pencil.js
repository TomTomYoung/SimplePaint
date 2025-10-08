export function makePencil(store) {
        const id = 'pencil';
        let drawing = false,
          last = null;
        return {
          id,
          cursor: 'crosshair',
          onPointerDown(ctx, ev, eng) {
            eng.clearSelection();
            drawing = true;
            last = ev.img;
            eng.expandPendingRect(
              ev.img.x,
              ev.img.y,
              store.getToolState(id).brushSize
            );
            stroke(ctx, ev.img);
          },
          onPointerMove(ctx, ev, eng) {
            if (!drawing) return;
            eng.expandPendingRect(
              ev.img.x,
              ev.img.y,
              store.getToolState(id).brushSize
            );
            stroke(ctx, ev.img);
          },
          onPointerUp() {
            drawing = false;
            last = null;
          },
        };
        function stroke(ctx, img) {
          const s = store.getToolState(id);
          const opacity = Number.isFinite(s.opacity)
            ? Math.min(Math.max(s.opacity, 0), 1)
            : 1;
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = s.primaryColor;
          ctx.lineWidth = s.brushSize;
          ctx.beginPath();
          if (last) ctx.moveTo(last.x + 0.01, last.y + 0.01);
          else ctx.moveTo(img.x + 0.01, img.y + 0.01);
          ctx.lineTo(img.x + 0.01, img.y + 0.01);
          ctx.stroke();
          ctx.restore();
          last = img;
        }
      }
