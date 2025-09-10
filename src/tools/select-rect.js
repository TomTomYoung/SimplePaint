      function makeSelectRect() {
        let dragging = false,
          moving = false,
          start = null,
          grabOffset = null;
        return {
          id: "select-rect",
          cursor: "crosshair",
          previewRect: null,
          onPointerDown(ctx, ev, eng) {
            const sel = eng.selection;
            if (sel && eng.pointInRect(ev.img, sel.rect)) {
              if (!sel.floatCanvas) {
                const { x, y, w, h } = sel.rect;
                const img = ctx.getImageData(x, y, w, h);
                const fc = document.createElement("canvas");
                fc.width = w;
                fc.height = h;
                fc.getContext("2d").putImageData(img, 0, 0);
                ctx.clearRect(x, y, w, h);
                eng.expandPendingRectByRect(x, y, w, h);
                sel.floatCanvas = fc;
                sel.pos = { x, y };
              }
              moving = true;
              grabOffset = {
                dx: ev.img.x - sel.pos.x,
                dy: ev.img.y - sel.pos.y,
              };
              start = ev.img;
              return;
            }
            eng.clearSelection();
            dragging = true;
            start = ev.img;
            this.previewRect = { x: start.x, y: start.y, w: 0, h: 0 };
          },
          onPointerMove(ctx, ev, eng) {
            if (dragging) {
              const x1 = Math.min(start.x, ev.img.x),
                y1 = Math.min(start.y, ev.img.y),
                x2 = Math.max(start.x, ev.img.x),
                y2 = Math.max(start.y, ev.img.y);
              this.previewRect = {
                x: Math.floor(x1),
                y: Math.floor(y1),
                w: Math.max(1, Math.floor(x2 - x1)),
                h: Math.max(1, Math.floor(y2 - y1)),
              };
            } else if (moving && eng.selection) {
              eng.selection.pos = {
                x: Math.floor(ev.img.x - grabOffset.dx),
                y: Math.floor(ev.img.y - grabOffset.dy),
              };
            }
          },
          onPointerUp(ctx, ev, eng) {
            if (dragging) {
              dragging = false;
              const r = this.previewRect;
              if (r && r.w > 0 && r.h > 0)
                eng.selection = {
                  rect: r,
                  floatCanvas: null,
                  pos: { x: r.x, y: r.y },
                };
              this.previewRect = null;
            } else if (moving && eng.selection) {
              moving = false;
              const sel = eng.selection;
              const old = sel.rect,
                neu = { x: sel.pos.x, y: sel.pos.y, w: old.w, h: old.h };
              eng.expandPendingRectByRect(old.x, old.y, old.w, old.h);
              eng.expandPendingRectByRect(neu.x, neu.y, neu.w, neu.h);
              ctx.drawImage(sel.floatCanvas, neu.x, neu.y);
              sel.rect = neu;
              sel.floatCanvas = null;
            } else {
              const sel = eng.selection;
              if (sel && !eng.pointInRect(ev.img, sel.rect))
                eng.clearSelection();
            }
          },
        };
      }
