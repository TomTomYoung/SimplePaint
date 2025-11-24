// ツール仕様: 概要=表現効果を追加する特殊ブラシ群。スタンプや粒状感、物理風の挙動を備えます。 入力=ペン/マウスのポインタイベント、筆圧/速度、必要に応じて修飾キー。 出力=質感や模様を含むストロークやスタンプ。 操作=左ドラッグで効果を適用し、移動でパラメータが更新、離して確定。
/**
 * Meta-Brush（条件分岐ブラシ）
 * 速度・圧力・曲率に応じてサブブラシ（描き方）を自動切替え。
 *
 * 方式（単一ツール内で下位スタンプを切替）：
 *  - 入力ストリームから v[px/s]・p[0..1]・κ[1/px] を推定し、EMA で平滑
 *  - 閾値＋ヒステリシス＋最小滞留時間でモード決定
 *  - モードごとにラスタライズ手法を切替（ink: 円スタンプ, callig: 楕円, ribbon: カプセル）
 *
 * store.getToolState('meta-brush') パラメータ（初期値は getState 参照）:
 *  // 共通
 *  brushSize       : 基準幅 w（px, 既定 16）
 *  primaryColor    : '#rrggbb'
 *  alpha           : 0..1（既定 1）
 *  spacingRatio    : Δs = spacingRatio * w（既定 0.5）
 *  usePressure     : true/false（p を ev.pressure から使用, 既定 true）
 *  // モード切替
 *  vLo             : 80    （px/s 未満は低速） 
 *  vHi             : 450   （px/s 超は高速）
 *  pLo             : 0.25  （圧の低い域）
 *  pHi             : 0.7   （圧の高い域）
 *  kHi             : 0.02  （曲率高い域 ~ 急カーブ）
 *  hystRatio       : 0.15  （10〜20% 目安）
 *  minDwellMs      : 90    （最小滞留時間）
 *  initMode        : 'ink' | 'callig' | 'ribbon'（既定 'callig'）
 *  // 平滑
 *  emaV            : 0.35  （速度 EMA α）
 *  emaP            : 0.3   （圧力 EMA α）
 *  emaK            : 0.4   （曲率 EMA α）
 *  // サブブラシ特性
 *  penAngle        : 45    （callig のペン角, deg）
 *  calligKappa     : 2.0   （長短半径比）
 *  ribbonHardness  : 1.0   （カプセル線の硬さ: lineWidth スケール）
 *
 * 再描画通知：
 *  - スタンプごとにローカル AABB を統合し、pointerup で一括 expandPendingRectByRect
 *  - 切替点は余白を広めに（w/2 + 2px）
 *
 * 注意：
 *  - 乱数は不使用（種の一貫性要件を満たす）／必要なら将来 seed を追加
 *  - 圧力値が無い環境では p=0 として扱う
 */

export function makeMetaBrush(store) {
  const id = 'meta-brush';

  // 状態
  let drawing = false;
  let last = null;              // 直近の生ポインタ
  let lastTime = 0;             // ms
  let sampPrev = null;          // 直近の配置点（スタンプ基準）
  let acc = 0;                  // 距離繰越
  let unionRect = null;         // AABB 統合
  let mode = 'callig';          // 現在モード
  let lastSwitchT = 0;          // 切替時刻（ms）

  // メトリクス（EMA）
  let vE = 0, pE = 0, kE = 0;

  // 曲率計算用履歴
  const hist = []; // [{x,y,t}]

  const DEFAULTS = {
    brushSize: 16,
    primaryColor: '#000000',
    alpha: 1.0,
    spacingRatio: 0.5,
    usePressure: true,

    vLo: 80, vHi: 450,
    pLo: 0.25, pHi: 0.7,
    kHi: 0.02,
    hystRatio: 0.15,
    minDwellMs: 90,
    initMode: 'callig',

    emaV: 0.35,
    emaP: 0.3,
    emaK: 0.4,

    penAngle: 45,
    calligKappa: 2.0,
    ribbonHardness: 1.0,
  };

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      const s = getState(store, id, DEFAULTS);

      drawing = true;
      last = { ...ev.img };
      lastTime = eventTimeMs(ev);
      hist.length = 0;
      hist.push({ x: last.x, y: last.y, t: lastTime });

      // 初期メトリクス
      vE = 0;
      pE = clamp01(s.usePressure ? (ev.pressure ?? 0) : 0);
      kE = 0;

      mode = (s.initMode === 'ink' || s.initMode === 'ribbon') ? s.initMode : 'callig';
      lastSwitchT = lastTime;

      acc = 0;
      unionRect = null;
      sampPrev = { x: last.x, y: last.y };

      // 初回スタンプ
      placeStamp(ctx, sampPrev, sampPrev, mode, s);
    },

    onPointerMove(ctx, ev) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);

      const now = eventTimeMs(ev);
      const p = { ...ev.img };

      const dt = Math.max(1, now - lastTime); // ms
      const dx = p.x - last.x, dy = p.y - last.y;
      const dist = Math.hypot(dx, dy);

      // 速度・圧力・曲率更新
      const vInst = (dist / dt) * 1000; // px/s
      vE = lerp(vE, vInst, s.emaV);
      const pInst = clamp01(s.usePressure ? (ev.pressure ?? 0) : 0);
      pE = lerp(pE, pInst, s.emaP);
      const kInst = estimateCurvature(p.x, p.y, now);
      kE = lerp(kE, kInst, s.emaK);

      // モード決定（ヒステリシス＋滞留）
      const target = decideMode(vE, pE, kE, mode, s);
      if (target !== mode && (now - lastSwitchT) >= s.minDwellMs) {
        mode = target;
        lastSwitchT = now;
      }

      // 距離主導の配置
      const spacing = Math.max(1, s.spacingRatio * s.brushSize);
      let px = last.x, py = last.y;
      let rem = dist, vx = dx, vy = dy;

      while (acc + rem >= spacing) {
        const t = (spacing - acc) / rem;
        const nx = px + vx * t;
        const ny = py + vy * t;

        const curr = { x: nx, y: ny };
        placeStamp(ctx, sampPrev, curr, mode, s);
        sampPrev = curr;

        px = nx; py = ny;
        vx = p.x - px; vy = p.y - py;
        rem = Math.hypot(vx, vy);
        acc = 0;
      }
      acc += rem;

      last = p;
      lastTime = now;
    },

    onPointerUp(_ctx, _ev, eng) {
      if (!drawing) return;
      drawing = false;
      last = null;
      sampPrev = null;
      hist.length = 0;

      if (unionRect) {
        eng.expandPendingRectByRect?.(unionRect.x, unionRect.y, unionRect.w, unionRect.h);
      }
      (eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.());
    },

    // 軽量プレビュー：ブラシ円＋モードラベル
    drawPreview(octx) {
      if (!drawing || !last) return;
      const s = getState(store, id, DEFAULTS);
      octx.save();
      octx.lineWidth = 1;
      octx.setLineDash([4, 4]);
      octx.strokeStyle = '#00000044';
      octx.beginPath();
      octx.arc(last.x + 0.5, last.y + 0.5, Math.max(2, s.brushSize / 2), 0, Math.PI * 2);
      octx.stroke();

      // モード表示
      octx.setLineDash([]);
      octx.font = '12px sans-serif';
      octx.fillStyle = '#00000066';
      octx.fillText(mode, last.x + 8, last.y - 8);
      octx.restore();
    },
  };

  // ========================= Stampers（下位ブラシ） =========================

  // 1) ink: 円スタンプ
  function stampInk(ctx, c, s) {
    const r = s.brushSize / 2;
    ctx.save();
    ctx.fillStyle = s.primaryColor;
    ctx.globalAlpha = s.alpha;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    growDamage(c.x - r, c.y - r, r * 2, r * 2);
  }

  // 2) callig: 楕円（ペン角）
  function stampCallig(ctx, c, s) {
    const shortR = Math.max(0.5, s.brushSize / 2);
    const longR = shortR * s.calligKappa;
    const ang = (s.penAngle * Math.PI) / 180;

    // AABB 半径
    const cos = Math.abs(Math.cos(ang));
    const sin = Math.abs(Math.sin(ang));
    const rx = longR * cos + shortR * sin;
    const ry = longR * sin + shortR * cos;

    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(ang);
    ctx.fillStyle = s.primaryColor;
    ctx.globalAlpha = s.alpha;
    ctx.beginPath();
    ctx.ellipse(0, 0, longR, shortR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    growDamage(c.x - rx, c.y - ry, rx * 2, ry * 2);
  }

  // 3) ribbon: カプセル（前回配置点→今回配置点を太線で接続）
  function stampRibbonCapsule(ctx, a, b, s) {
    const w = Math.max(0.5, s.brushSize * s.ribbonHardness);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = s.primaryColor;
    ctx.globalAlpha = s.alpha;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x + 0.01, a.y + 0.01);
    ctx.lineTo(b.x + 0.01, b.y + 0.01);
    ctx.stroke();
    ctx.restore();

    // AABB 近似（線分の外接矩形）
    const minX = Math.min(a.x, b.x) - w / 2;
    const minY = Math.min(a.y, b.y) - w / 2;
    const maxX = Math.max(a.x, b.x) + w / 2;
    const maxY = Math.max(a.y, b.y) + w / 2;
    growDamage(minX, minY, maxX - minX, maxY - minY);
  }

  // 現モードで 1 スタンプ
  function placeStamp(ctx, prev, curr, m, s) {
    if (m === 'ink') {
      stampInk(ctx, curr, s);
    } else if (m === 'ribbon') {
      // prev==curr の初回は点 → 円で埋める
      if (!prev || (prev.x === curr.x && prev.y === curr.y)) {
        stampInk(ctx, curr, s);
      } else {
        stampRibbonCapsule(ctx, prev, curr, s);
      }
    } else {
      stampCallig(ctx, curr, s);
    }
  }

  // ========================= Mode Decision ================================

  function decideMode(v, p, k, current, s) {
    // 閾値にヒステリシスを適用（現在モードに有利な方向へ広げる）
    const vRange = Math.max(1, s.vHi - s.vLo);
    const h = clamp01(s.hystRatio);
    let vLo = s.vLo, vHi = s.vHi, pHi = s.pHi, kHi = s.kHi;

    if (current === 'ink') {
      vLo += h * vRange * 0.6;         // 低速域を広げる
      pHi += h * (1 - s.pHi) * 0.6;    // 高圧域を広げる
    } else if (current === 'ribbon') {
      vHi -= h * vRange * 0.6;         // 高速条件に入りやすい
    } else if (current === 'callig') {
      kHi += h * s.kHi * 0.6;          // 曲率高条件に入りやすい
    }

    const slow  = v < vLo;
    const fast  = v > vHi;
    const firm  = p > pHi;
    const bendy = k > kHi;

    // 優先順位: slow/firm → ink, bendy → callig, fast → ribbon, それ以外は現状維持 or callig
    if (slow || firm) return 'ink';
    if (bendy)        return 'callig';
    if (fast)         return 'ribbon';
    return current || 'callig';
  }

  // ========================= Metrics ======================================

  function estimateCurvature(x, y, t) {
    hist.push({ x, y, t });
    if (hist.length > 5) hist.shift();
    if (hist.length < 3) return 0;

    const A = hist[hist.length - 3];
    const B = hist[hist.length - 2];
    const C = hist[hist.length - 1];

    const v1x = B.x - A.x, v1y = B.y - A.y;
    const v2x = C.x - B.x, v2y = C.y - B.y;
    const L1 = Math.hypot(v1x, v1y) || 1;
    const L2 = Math.hypot(v2x, v2y) || 1;

    // 角度差の絶対値 / 平均弧長（近似）
    const dot = (v1x * v2x + v1y * v2y) / (L1 * L2);
    const ang = Math.acos(clamp(dot, -1, 1));  // 0..π
    const sLen = 0.5 * (L1 + L2);
    return (sLen > 0.0001) ? (ang / sLen) : 0;
  }

  // ========================= Damage / Utils ================================

  function growDamage(x, y, w, h) {
    const r = { x: Math.floor(x), y: Math.floor(y), w: Math.ceil(w), h: Math.ceil(h) };
    if (!unionRect) { unionRect = r; return; }
    const x1 = Math.min(unionRect.x, r.x);
    const y1 = Math.min(unionRect.y, r.y);
    const x2 = Math.max(unionRect.x + unionRect.w, r.x + r.w);
    const y2 = Math.max(unionRect.y + unionRect.h, r.y + r.h);
    unionRect = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function eventTimeMs(ev) {
    return (ev?.time || ev?.timestamp || ev?.t || performance.now());
  }

  function lerp(a, b, t) { return a + (b - a) * clamp01(t); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function getState(store, id, defs) {
    const s = store.getToolState(id) || {};
    return {
      brushSize:     clampNum(s.brushSize ?? defs.brushSize, 1, 512),
      primaryColor:  s.primaryColor || defs.primaryColor,
      alpha:         clamp01(s.alpha ?? defs.alpha),
      spacingRatio:  clampNum(s.spacingRatio ?? defs.spacingRatio, 0.1, 2.0),
      usePressure:   s.usePressure !== undefined ? !!s.usePressure : defs.usePressure,

      vLo:           clampNum(s.vLo ?? defs.vLo, 1, 5000),
      vHi:           clampNum(s.vHi ?? defs.vHi, 1, 5000),
      pLo:           clamp01(s.pLo ?? defs.pLo),
      pHi:           clamp01(s.pHi ?? defs.pHi),
      kHi:           clampNum(s.kHi ?? defs.kHi, 0, 1),

      hystRatio:     clamp01(s.hystRatio ?? defs.hystRatio),
      minDwellMs:    clampNum(s.minDwellMs ?? defs.minDwellMs, 0, 1000),
      initMode:      (s.initMode === 'ink' || s.initMode === 'ribbon') ? s.initMode : 'callig',

      emaV:          clamp01(s.emaV ?? defs.emaV),
      emaP:          clamp01(s.emaP ?? defs.emaP),
      emaK:          clamp01(s.emaK ?? defs.emaK),

      penAngle:      clampNum(s.penAngle ?? defs.penAngle, -180, 180),
      calligKappa:   clampNum(s.calligKappa ?? defs.calligKappa, 1.0, 6.0),
      ribbonHardness:clampNum(s.ribbonHardness ?? defs.ribbonHardness, 0.2, 2.0),
    };
  }
  function clampNum(v, lo, hi) { v = +v; if (!Number.isFinite(v)) v = lo; return v < lo ? lo : (v > hi ? hi : v); }
}
