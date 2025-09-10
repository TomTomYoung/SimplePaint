      function makePencilClick(store) {
        let drawing = false,
          last = null;
        return {
          id: "pencilClick",
          cursor: "crosshair",
          onPointerDown(ctx, ev, eng) {
            eng.clearSelection();
            if (!drawing) {
              drawing = true;
              last = ev.img;
              eng.expandPendingRect(
                ev.img.x,
                ev.img.y,
                store.getState().brushSize
              );
              stroke(ctx, ev.img, store);
            } else {
              eng.expandPendingRect(
                ev.img.x,
                ev.img.y,
                store.getState().brushSize
              );
              stroke(ctx, ev.img, store);
              drawing = false;
              last = null;
            }
          },
          onPointerMove(ctx, ev, eng) {
            if (!drawing) return;
            eng.expandPendingRect(
              ev.img.x,
              ev.img.y,
              store.getState().brushSize
            );
            stroke(ctx, ev.img, store);
          },
          onPointerUp() {},
        };
        function stroke(ctx, img, store) {
          const s = store.getState();
          ctx.save();
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
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
