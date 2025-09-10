      function makeShape(kind, store) {
        let drawing = false,
          start = null,
          lastPreview = null;
        return {
          id: kind,
          cursor: "crosshair",
          previewRect: null,
          onPointerDown(ctx, ev, eng) {
            eng.clearSelection();
            drawing = true;
            start = { ...ev.img };
            lastPreview = null;
          },
          onPointerMove(ctx, ev, eng) {
            if (!drawing) return;
            const cur = { ...ev.img };
            const s = store.getState();
            const x1 = Math.min(start.x, cur.x),
              y1 = Math.min(start.y, cur.y);
            let w = Math.max(1, Math.abs(cur.x - start.x)),
              h = Math.max(1, Math.abs(cur.y - start.y));
            if (ev.shift) {
              if (kind === "line") {
                const dx = cur.x - start.x,
                  dy = cur.y - start.y;
                const a = Math.atan2(dy, dx);
                const ang = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
                const len = Math.hypot(dx, dy);
                cur.x = start.x + Math.cos(ang) * len;
                cur.y = start.y + Math.sin(ang) * len;
              } else {
                const m = Math.max(w, h);
                w = h = m;
              }
            }
            this.previewRect =
              kind === "line"
                ? {
                    x: Math.min(start.x, cur.x),
                    y: Math.min(start.y, cur.y),
                    w: Math.abs(cur.x - start.x),
                    h: Math.abs(cur.y - start.y),
                  }
                : {
                    x: Math.floor(x1),
                    y: Math.floor(y1),
                    w: Math.floor(w),
                    h: Math.floor(h),
                  };
            lastPreview = { start, cur, shift: ev.shift, state: { ...s } };
          },
          onPointerUp(ctx, ev, eng) {
            if (!drawing) return;
            drawing = false;
            if (!lastPreview) {
              this.previewRect = null;
              return;
            }
            const { start: s, cur, state } = lastPreview;
            const strokeColor = state.primaryColor,
              fillColor = state.secondaryColor;
            const lineWidth = state.brushSize,
              fillOn = state.fillOn;
            ctx.save();
            ctx.imageSmoothingEnabled = store.getState().antialias;
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = strokeColor;
            ctx.fillStyle = fillColor;
            if (kind === "line") {
              ctx.beginPath();
              ctx.moveTo(s.x + 0.5, s.y + 0.5);
              ctx.lineTo(cur.x + 0.5, cur.y + 0.5);
              ctx.stroke();
              eng.expandPendingRectByRect(
                Math.min(s.x, cur.x) - lineWidth,
                Math.min(s.y, cur.y) - lineWidth,
                Math.abs(cur.x - s.x) + lineWidth * 2,
                Math.abs(cur.y - s.y) + lineWidth * 2
              );
            } else if (kind === "rect") {
              const x = Math.min(s.x, cur.x),
                y = Math.min(s.y, cur.y),
                w = Math.abs(cur.x - s.x),
                h = Math.abs(cur.y - s.y);
              if (fillOn) ctx.fillRect(x, y, w, h);
              ctx.strokeRect(x + 0.5, y + 0.5, w, h);
              eng.expandPendingRectByRect(
                x - lineWidth,
                y - lineWidth,
                w + lineWidth * 2,
                h + lineWidth * 2
              );
            } else if (kind === "ellipse") {
              const cx = (s.x + cur.x) / 2,
                cy = (s.y + cur.y) / 2,
                rx = Math.abs(cur.x - s.x) / 2,
                ry = Math.abs(cur.y - s.y) / 2;
              ctx.beginPath();
              drawEllipsePath(ctx, cx, cy, rx, ry);
              if (fillOn) ctx.fill();
              ctx.stroke();
              eng.expandPendingRectByRect(
                cx - rx - lineWidth,
                cy - ry - lineWidth,
                rx * 2 + lineWidth * 2,
                ry * 2 + lineWidth * 2
              );
            }
            ctx.restore();
            this.previewRect = null;
          },
        };
      }
