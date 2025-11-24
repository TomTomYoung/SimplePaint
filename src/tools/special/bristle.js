// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
// Simple bristle brush: draws multiple thin strokes with random offsets
export function makeBristle(store) {
  const id = 'bristle';
  let drawing = false;
  let last = null;
  let hairs = [];

  function randn() {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;
      last = { ...ev.img };

      const s = store.getToolState(id);
      const n = s.count || 8;
      const sigma = s.brushSize * 0.3;
      hairs = [];
      for (let i = 0; i < n; i++) {
        const offx = randn() * sigma;
        const offy = randn() * sigma;
        const w = s.brushSize * (0.5 + Math.random() * 0.3);
        hairs.push({ offx, offy, w });
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = s.primaryColor;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(last.x + offx + 0.5, last.y + offy + 0.5);
        ctx.lineTo(last.x + offx + 0.5, last.y + offy + 0.5);
        ctx.stroke();
        ctx.restore();
        eng.expandPendingRectByRect(
          last.x + offx - w,
          last.y + offy - w,
          w * 2,
          w * 2
        );
      }
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing || !last) return;
      const p = { ...ev.img };
      const s = store.getToolState(id);
      hairs.forEach(h => {
        const sx = last.x + h.offx;
        const sy = last.y + h.offy;
        const ex = p.x + h.offx;
        const ey = p.y + h.offy;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = s.primaryColor;
        ctx.lineWidth = h.w;
        ctx.beginPath();
        ctx.moveTo(sx + 0.5, sy + 0.5);
        ctx.lineTo(ex + 0.5, ey + 0.5);
        ctx.stroke();
        ctx.restore();
        const minX = Math.min(sx, ex);
        const minY = Math.min(sy, ey);
        const segW = Math.abs(ex - sx);
        const segH = Math.abs(ey - sy);
        eng.expandPendingRectByRect(
          minX - h.w,
          minY - h.w,
          segW + h.w * 2,
          segH + h.w * 2
        );
      });
      last = p;
    },

    onPointerUp() {
      drawing = false;
      last = null;
      hairs = [];
    },

    drawPreview() {},
  };
}
