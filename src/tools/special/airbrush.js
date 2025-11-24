// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
export function makeAirbrush(store) {
  const id = 'airbrush';
  let drawing = false;
  let last = null;
  const spacing = 4; // Δs: spacing between sprays in pixels
  const rate = 50; // λ: particles per step

  function spray(ctx, p, eng) {
    const s = store.getToolState(id);
    const radius = s.brushSize;
    ctx.save();
    ctx.fillStyle = s.primaryColor;
    for (let i = 0; i < rate; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const x = p.x + Math.cos(theta) * r;
      const y = p.y + Math.sin(theta) * r;
      const size = 1 + Math.random() * 2; // 粒径1〜3px
      const alpha = 1 - r / radius; // 線形減衰
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // 通知: エアブラシ半径のAABBを拡張
    eng.expandPendingRectByRect(
      p.x - radius - 3,
      p.y - radius - 3,
      (radius + 3) * 2,
      (radius + 3) * 2,
    );
  }

  return {
    id,
    cursor: 'crosshair',
    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      eng.beginStrokeSnapshot?.();
      drawing = true;
      last = { ...ev.img };
      spray(ctx, last, eng);
    },
    onPointerMove(ctx, ev, eng) {
      if (!drawing || !last) return;
      const p = { ...ev.img };
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.floor(dist / spacing);
      if (steps === 0) {
        spray(ctx, p, eng);
      } else {
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const cx = last.x + dx * t;
          const cy = last.y + dy * t;
          spray(ctx, { x: cx, y: cy }, eng);
        }
      }
      last = p;
    },
    onPointerUp() {
      drawing = false;
      last = null;
    },
  };
}
