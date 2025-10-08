export function makeMinimal(store) {
  const id = 'minimal';
  let drawing = false;
  let prev = null;
  return {
    id,
    cursor: 'crosshair',
    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;
      prev = { ...ev.img };
    },
    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      drawSegment(prev, ev.img, ctx, eng);
      prev = { ...ev.img };
    },
    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawSegment(prev, ev.img, ctx, eng);
      drawing = false;
      prev = null;
    },
    drawPreview() {},
  };
  function drawSegment(p1, p2, ctx, eng) {
    const s = store.getToolState(id);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.primaryColor;
    ctx.lineWidth = s.brushSize;
    ctx.beginPath();
    ctx.moveTo(p1.x + 0.5, p1.y + 0.5);
    ctx.lineTo(p2.x + 0.5, p2.y + 0.5);
    ctx.stroke();
    ctx.restore();
    const minX = Math.min(p1.x, p2.x) - s.brushSize / 2;
    const minY = Math.min(p1.y, p2.y) - s.brushSize / 2;
    const maxX = Math.max(p1.x, p2.x) + s.brushSize / 2;
    const maxY = Math.max(p1.y, p2.y) + s.brushSize / 2;
    eng.expandPendingRectByRect(minX, minY, maxX - minX, maxY - minY);
  }
}
