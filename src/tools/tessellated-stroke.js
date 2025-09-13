function makeTessellatedStroke(store) {
  const id = 'tess-stroke';
  let drawing = false;
  const pts = [];
  const EPS = 1e-6;

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;
      pts.length = 0;
      pts.push({ ...ev.img });

      const s = store.getToolState(id);
      const w = Math.max(s.brushSize || 0, 0);
      if (w > 0) {
        // 開始点の無効領域
        if (eng.expandPendingRectByRect) {
          eng.expandPendingRectByRect(ev.img.x - w / 2, ev.img.y - w / 2, w, w);
        } else {
          eng.expandPendingRect(ev.img.x, ev.img.y, w);
        }
      }
    },

    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      const p = { ...ev.img };
      const p0 = pts[pts.length - 1];
      const dx = p.x - p0.x, dy = p.y - p0.y;
      const dist = Math.hypot(dx, dy);
      const s = store.getToolState(id);
      const w = Math.max(s.brushSize || 0, 0);

      // 微小移動は描画・記録をスキップして安定化
      if (dist < EPS) return;

      // プレビューは本来 overlay に出すべきだが、ここでは品質劣化を避けるために
      // 進行中の stroke は描かず、確定時のみポリゴンで塗る（二重描画防止）
      // tessSegment(ctx, p0, p, { ...s, brushSize: w }); // ←描かない

      pts.push(p);

      // 無効領域（点ごとに円で近似）
      if (w > 0) {
        if (eng.expandPendingRectByRect) {
          eng.expandPendingRectByRect(p.x - w / 2, p.y - w / 2, w, w);
        } else {
          eng.expandPendingRect(p.x, p.y, w);
        }
      }
    },

    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;

      const p = { ...ev.img };
      // 終点が最後の onMove と異なる場合に備えて追加
      const last = pts[pts.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) pts.push(p);

      const s = store.getToolState(id);
      const w = Math.max(s.brushSize || 0, 0);
      if (pts.length >= 2 && w > 0) {
        tessellateStroke(ctx, pts, { ...s, brushSize: w });

        // ストローク全体のバウンドで最終的に無効領域を一括拡張
        let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
        for (const q of pts) {
          if (q.x < minX) minX = q.x;
          if (q.x > maxX) maxX = q.x;
          if (q.y < minY) minY = q.y;
          if (q.y > maxY) maxY = q.y;
        }
        const pad = w / 2;
        if (eng.expandPendingRectByRect) {
          eng.expandPendingRectByRect(minX - pad, minY - pad, (maxX - minX) + w, (maxY - minY) + w);
        } else {
          // フォールバック：四隅をラスタ近似で拡張
          const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
          const rx = (maxX - minX) / 2 + pad, ry = (maxY - minY) / 2 + pad;
          eng.expandPendingRect(cx - rx, cy - ry, Math.max(rx, ry) * 2);
        }
      }

      pts.length = 0;
    },
  };

  // （プレビュー用の線分描画は使わない。必要なら overlay ctx でのみ使用）
  function tessSegment(ctx, p0, p1, s) {
    if (!s || (s.brushSize || 0) <= 0) return;
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len < EPS) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.primaryColor;
    ctx.lineWidth = s.brushSize;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }

  // オフセットポリゴンによる簡易テッセレーション（端は丸キャップ）
  function tessellateStroke(ctx, points, s) {
    if (!points || points.length < 2) return;
    const half = Math.max((s.brushSize || 0) / 2, 0);
    if (half <= 0) return;

    const left = [];
    const right = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len < EPS) continue;

      const nx = (-dy / len) * half;
      const ny = (dx / len) * half;

      left.push({ x: p0.x + nx, y: p0.y + ny });
      right.push({ x: p0.x - nx, y: p0.y - ny });

      if (i === points.length - 2) {
        left.push({ x: p1.x + nx, y: p1.y + ny });
        right.push({ x: p1.x - nx, y: p1.y - ny });
      }
    }

    if (!left.length) return;

    ctx.save();
    ctx.fillStyle = s.primaryColor;
    ctx.beginPath();

    // サイドポリゴン
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();

    // 両端の丸キャップ
    const start = points[0];
    const end = points[points.length - 1];
    ctx.moveTo(start.x + half, start.y);
    ctx.arc(start.x, start.y, half, 0, Math.PI * 2);
    ctx.moveTo(end.x + half, end.y);
    ctx.arc(end.x, end.y, half, 0, Math.PI * 2);

    ctx.fill();
    ctx.restore();
  }
}

window.makeTessellatedStroke = makeTessellatedStroke;
