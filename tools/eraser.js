      function makeEraser(store) {
        let drawing = false,
          last = null;
        return {
          id: "eraser",
          cursor: "cell",
          onPointerDown(ctx, ev, eng) {
            eng.clearSelection();
            drawing = true;
            last = ev.img;
            eng.expandPendingRect(
              ev.img.x,
              ev.img.y,
              store.getState().brushSize
            );
            erase(ctx, ev.img, store);
          },
          onPointerMove(ctx, ev, eng) {
            if (!drawing) return;
            eng.expandPendingRect(
              ev.img.x,
              ev.img.y,
              store.getState().brushSize
            );
            erase(ctx, ev.img, store);
          },
          onPointerUp() {
            drawing = false;
            last = null;
          },
        };
        function erase(ctx, img, store) {
          const s = store.getState();
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = "rgba(0,0,0,1)";
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
