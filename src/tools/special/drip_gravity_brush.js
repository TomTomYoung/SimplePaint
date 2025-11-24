/*
 * ツール仕様
 * 概要: 表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。
 * 入力: ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。
 * 出力: 質感や模様を含むストロークやスタンプ。
 * 操作: 左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
 */
/**
 * Drip / Gravity（滴り）
 * - 重力方向へ顔料が落ち、雫/筋を形成する粒子ベースの簡易液膜モデル
 * - 入力点から「滴（粒子）」を生成し、rAFで重力・粘性・蒸発を時間積分
 * - 滴の移動区間を太ストローク＋終端スタンプで描画（帯AABBを逐次通知）
 *
 * 主要パラメータ（store.getToolState(id)）
 *   brushSize:   雫径の基準（px）               [既定 16]
 *   primaryColor:描画色                         [既定 '#000']
 *   gravity:     g（m/s^2）                     [既定 9.8]
 *   pixelsPerMeter: px/m 変換                   [既定 100]
 *   viscosity:   粘性 μ（1/s, 減衰係数）        [既定 0.25]
 *   evaporation: 蒸発 E（1/s, α減衰）           [既定 0.02]
 *   directionDeg:重力方向（deg, 90=下）         [既定 90]
 *   spacingRatio:入力距離あたり生成間隔（w比）  [既定 0.5]
 *   opacity:     基本不透明度（0..1）          [既定 1.0]
 *
 * 再描画通知：移動セグメントごとに expandPendingRectByRect を呼ぶ（帯AABB）
 * 注意：時間積分は半陰的（速度の指数減衰 + 限界dt分割）で安定化
 */
export function makeDripGravityBrush(store) {
  const id = 'drip-gravity';

  let drawing = false;
  let ctxRef = null, engRef = null;
  let lastTime = 0;
  let running = false;

  // 入力による滴の生成管理
  let lastSpawn = null;
  let acc = 0;

  // 滴（粒子）配列
  /** @type {{x:number,y:number,vx:number,vy:number,r:number,alpha:number,color:string,alive:boolean}[]} */
  let drops = [];

  const DEFAULTS = {
    brushSize: 16,
    primaryColor: '#000',
    gravity: 9.8,            // m/s^2
    pixelsPerMeter: 100,     // px/m
    viscosity: 0.25,         // 1/s
    evaporation: 0.02,       // 1/s
    directionDeg: 90,        // +Y（下）
    spacingRatio: 0.5,       // Δs ≈ w/2
    opacity: 1.0,
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      ctxRef = ctx;
      engRef = eng;
      drawing = true;

      const s = getState(store, id, DEFAULTS);
      lastSpawn = { x: ev.img.x, y: ev.img.y };
      acc = 0;

      spawnDrop(ev.img.x, ev.img.y, s);

      if (!running) {
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(step);
      }
    },

    onPointerMove(_ctx, ev) {
      if (!drawing || !lastSpawn) return;
      const s = getState(store, id, DEFAULTS);

      const spacing = Math.max(1, s.spacingRatio * s.brushSize);
      let px = lastSpawn.x, py = lastSpawn.y;
      const qx = ev.img.x, qy = ev.img.y;
      let dx = qx - px, dy = qy - py;
      let dist = Math.hypot(dx, dy);
      if (dist === 0) return;

      while (acc + dist >= spacing) {
        const t = (spacing - acc) / dist;
        const nx = px + dx * t, ny = py + dy * t;
        spawnDrop(nx, ny, s);
        px = nx; py = ny;
        dx = qx - px; dy = qy - py;
        dist = Math.hypot(dx, dy);
        acc = 0;
      }
      acc += dist;
      lastSpawn = { x: qx, y: qy };
    },

    onPointerUp() {
      drawing = false;
      lastSpawn = null;
      acc = 0;
      // 滴が尽きるまで step は継続
    },

    drawPreview() {}, // rAFで本描画が進むためプレビュー不要
  };

  // ===== 滴の生成 =====
  function spawnDrop(x, y, s) {
    const r = Math.max(0.5, (s.brushSize / 2) * (0.9 + Math.random() * 0.2)); // 若干のばらつき
    const alpha = s.opacity;
    drops.push({ x, y, vx: 0, vy: 0, r, alpha, color: s.primaryColor, alive: true });
  }

  // ===== rAF: シミュレーションと描画 =====
  function step(now) {
    if (!ctxRef) { running = false; return; }

    // dt（秒）と安定化のための分割
    let dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.05)); // 最大 50ms
    lastTime = now;
    const maxSubDt = 1 / 120;                       // 120Hz 相当
    const steps = Math.max(1, Math.min(8, Math.ceil(dt / maxSubDt)));
    const h = dt / steps;

    const s = getState(store, id, DEFAULTS);
    const g = s.gravity * s.pixelsPerMeter;         // px/s^2
    const theta = (s.directionDeg * Math.PI) / 180; // 重力方向
    const gx = g * Math.cos(theta), gy = g * Math.sin(theta);

    const W = ctxRef.canvas.width, H = ctxRef.canvas.height;

    for (let si = 0; si < steps; si++) {
      // 各滴を更新
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (!d.alive) continue;

        // 半陰的：速度へ重力、指数粘性減衰
        d.vx += gx * h;
        d.vy += gy * h;
        const damp = Math.exp(-s.viscosity * h);
        d.vx *= damp;
        d.vy *= damp;

        const nx = d.x + d.vx * h;
        const ny = d.y + d.vy * h;

        // セグメント描画（太線 + 終端円）
        drawSegment(ctxRef, d.x, d.y, nx, ny, d.r, d.alpha, d.color);

        // 帯AABBを逐次通知
        notifyBand(engRef, d.x, d.y, nx, ny, d.r);

        // 状態更新
        d.x = nx; d.y = ny;

        // 蒸発（α減衰）
        d.alpha *= Math.exp(-s.evaporation * h);

        // 端の境界処理：画面外 or α消失で停止
        const pad = d.r + 2;
        if (d.alpha < 0.02 || nx < -pad || nx > W + pad || ny < -pad || ny > H + pad) {
          d.alive = false;
        } else {
          // 底面で溜まり：速度を大きく減衰（にじみの簡易近似）
          if (ny >= H - d.r) {
            d.vx *= 0.3;
            d.vy *= -0.1; // わずかに跳ね返ってすぐ止まる
            d.y = Math.min(ny, H - d.r);
            d.alpha *= 0.9;
          }
        }
      }
      // ゴミ掃除を小まめに
      if (si === steps - 1) drops = drops.filter(d => d.alive);
    }

    const active = drawing || drops.length > 0;
    if (active) {
      requestAnimationFrame(step);
    } else {
      running = false;
      engRef?.commitStrokeSnapshot?.();
    }
  }

  // ===== 1セグメントの描画 =====
  function drawSegment(ctx, x0, y0, x1, y1, r, alpha, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;

    // 軌跡（丸キャップのストローク）
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, r * 2);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // 終端に小さな雫スタンプ
    ctx.beginPath();
    ctx.arc(x1, y1, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ===== 帯AABB（セグメント矩形 + 余白） =====
  function notifyBand(eng, x0, y0, x1, y1, r) {
    if (!eng?.expandPendingRectByRect) return;
    const pad = Math.ceil(r + 2);
    const minX = Math.min(x0, x1) - pad;
    const minY = Math.min(y0, y1) - pad;
    const maxX = Math.max(x0, x1) + pad;
    const maxY = Math.max(y0, y1) + pad;
    eng.expandPendingRectByRect(
      Math.floor(minX),
      Math.floor(minY),
      Math.ceil(maxX - minX),
      Math.ceil(maxY - minY)
    );
  }

  // ===== パラメータ取得 =====
  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize: clampNum(s.brushSize ?? defs.brushSize, 1, 256),
      primaryColor: s.primaryColor || defs.primaryColor,
      gravity: clampNum(s.gravity ?? defs.gravity, 0.1, 98.0),
      pixelsPerMeter: clampNum(s.pixelsPerMeter ?? defs.pixelsPerMeter, 10, 2000),
      viscosity: clampNum(s.viscosity ?? defs.viscosity, 0.05, 2.0),
      evaporation: clampNum(s.evaporation ?? defs.evaporation, 0.001, 0.2),
      directionDeg: clampNum(s.directionDeg ?? defs.directionDeg, -360, 360),
      spacingRatio: clampNum(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),
      opacity: clampNum(s.opacity ?? defs.opacity, 0, 1),
    };
  }

  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
