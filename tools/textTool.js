      function makeTextTool(store) {
        return {
          id: "text",
          cursor: "text",
          onPointerDown(ctx, ev, eng) {
            cancelTextEditing(true);
            createTextEditor(ev.img.x, ev.img.y, store);
          },
          onPointerMove() {},
          onPointerUp() {},
        };
      }
