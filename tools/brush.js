      // function makeBrush(store) {
      //   let pts = [],
      //     drawing = false;
      //   return {
      //     id: "brush",
      //     cursor: "crosshair",
      //     previewRect: null,
      //     onPointerDown(ctx, ev, eng) {
      //       eng.clearSelection();
      //       drawing = true;
      //       pts = [{ ...ev.img }];
      //     },
      //     onPointerMove(ctx, ev, eng) {
      //       if (!drawing) return;
      //       pts.push({ ...ev.img });
      //       const s = store.getState();
      //       if (pts.length < 4) {
      //         const p1 = pts[pts.length - 2];
      //         const p2 = pts[pts.length - 1];
      //         ctx.save();
      //         ctx.lineCap = "round";
      //         ctx.lineJoin = "round";
      //         ctx.strokeStyle = s.primaryColor;
      //         ctx.lineWidth = s.brushSize;
      //         ctx.beginPath();
      //         ctx.moveTo(p1.x + 0.5, p1.y + 0.5);
      //         ctx.lineTo(p2.x + 0.5, p2.y + 0.5);
      //         ctx.stroke();
      //         ctx.restore();
      //         eng.expandPendingRectByRect(
      //           Math.min(p1.x, p2.x) - s.brushSize,
      //           Math.min(p1.y, p2.y) - s.brushSize,
      //           Math.abs(p2.x - p1.x) + s.brushSize * 2,
      //           Math.abs(p2.y - p1.y) + s.brushSize * 2
      //         );
      //         return;
      //       }
      //       const [p0, p1, p2, p3] = pts.slice(-4);
      //       const cr = [];
      //       for (let j = 0; j <= 8; j++)
      //         cr.push(catmullRom(p0, p1, p2, p3, j / 8));
      //       ctx.save();
      //       ctx.lineCap = "round";
      //       ctx.lineJoin = "round";
      //       ctx.strokeStyle = s.primaryColor;
      //       ctx.lineWidth = s.brushSize;
      //       ctx.beginPath();
      //       ctx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
      //       for (let i = 1; i < cr.length; i++)
      //         ctx.lineTo(cr[i].x + 0.5, cr[i].y + 0.5);
      //       ctx.stroke();
      //       ctx.restore();
      //       let minX = cr[0].x,
      //         maxX = cr[0].x,
      //         minY = cr[0].y,
      //         maxY = cr[0].y;
      //       cr.forEach((p) => {
      //         minX = Math.min(minX, p.x);
      //         maxX = Math.max(maxX, p.x);
      //         minY = Math.min(minY, p.y);
      //         maxY = Math.max(maxY, p.y);
      //       });
      //       eng.expandPendingRectByRect(
      //         minX - s.brushSize,
      //         minY - s.brushSize,
      //         maxX - minX + s.brushSize * 2,
      //         maxY - minY + s.brushSize * 2
      //       );
      //     },
      //     onPointerUp(ctx, ev, eng) {
      //       if (!drawing) return;
      //       drawing = false;
      //       pts.push({ ...ev.img });
      //       if (pts.length >= 4) {
      //         const [p0, p1, p2, p3] = pts.slice(-4);
      //         const cr = [];
      //         for (let j = 0; j <= 8; j++)
      //           cr.push(catmullRom(p0, p1, p2, p3, j / 8));
      //         const s = store.getState();
      //         ctx.save();
      //         ctx.lineCap = "round";
      //         ctx.lineJoin = "round";
      //         ctx.strokeStyle = s.primaryColor;
      //         ctx.lineWidth = s.brushSize;
      //         ctx.beginPath();
      //         ctx.moveTo(cr[0].x + 0.5, cr[0].y + 0.5);
      //         for (let i = 1; i < cr.length; i++)
      //           ctx.lineTo(cr[i].x + 0.5, cr[i].y + 0.5);
      //         ctx.stroke();
      //         ctx.restore();
      //         let minX = cr[0].x,
      //           maxX = cr[0].x,
      //           minY = cr[0].y,
      //           maxY = cr[0].y;
      //         cr.forEach((p) => {
      //           minX = Math.min(minX, p.x);
      //           maxX = Math.max(maxX, p.x);
      //           minY = Math.min(minY, p.y);
      //           maxY = Math.max(maxY, p.y);
      //         });
      //         eng.expandPendingRectByRect(
      //           minX - s.brushSize,
      //           minY - s.brushSize,
      //           maxX - minX + s.brushSize * 2,
      //           maxY - minY + s.brushSize * 2
      //         );
      //       }
      //       pts = [];
      //     },
      //     drawPreview() {},
      //   };
      // }
