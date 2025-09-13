function makeVectorKeep(store) {
  const id = 'vector-keep';
  let drawing = false,
    last = null,
    path = [];
  return {
    id,
    cursor: 'crosshair',
    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      eng.beginStrokeSnapshot?.();
      drawing = true;
      last = null;
      path = [];
      eng.expandPendingRect(ev.img.x, ev.img.y, store.getToolState(id).brushSize);
      stroke(ctx, ev.img);
    },
    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      eng.expandPendingRect(ev.img.x, ev.img.y, store.getToolState(id).brushSize);
      stroke(ctx, ev.img);
    },
    onPointerUp(ctx) {
      if (!drawing) return;
      drawing = false;
      last = null;
      const s = store.getToolState(id);
      const vectors = s.vectors || [];
      vectors.push({
        points: path.map(p => ({ x: p.x, y: p.y })),
        color: s.primaryColor,
        width: s.brushSize,
      });
      store.setToolState(id, { vectors });
      path = [];
    },
  };
  function stroke(ctx, img) {
    const s = store.getToolState(id);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.primaryColor;
    ctx.lineWidth = s.brushSize;
    ctx.beginPath();
    if (last) ctx.moveTo(last.x + 0.01, last.y + 0.01);
    else ctx.moveTo(img.x + 0.01, img.y + 0.01);
    ctx.lineTo(img.x + 0.01, img.y + 0.01);
    ctx.stroke();
    ctx.restore();
    last = { x: img.x, y: img.y };
    path.push({ x: img.x, y: img.y });
  }
}
