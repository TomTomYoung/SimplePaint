// ツール仕様: 概要=幾何図形を配置する形状ツール。 入力=ポインタドラッグ、Shift/Altなどの修飾キー。 出力=確定した図形のパスまたは描画。 操作=ドラッグで図形のサイズや角度を決め、離して確定。必要に応じてShiftで比率固定。
import { drawEllipsePath } from '../../utils/drawing.js';
import { applyStrokeStyle } from '../../utils/stroke-style.js';

const clampCornerRadius = (value, width, height) => {
  const maxRadius = Math.max(0, Math.min(width, height) / 2);
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(numeric, maxRadius);
};

const beginRoundedRectPath = (ctx, x, y, w, h, radius) => {
  if (radius <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  const r = Math.min(radius, Math.min(w, h) / 2);
  const x2 = x + w;
  const y2 = y + h;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x2 - r, y);
  ctx.quadraticCurveTo(x2, y, x2, y + r);
  ctx.lineTo(x2, y2 - r);
  ctx.quadraticCurveTo(x2, y2, x2 - r, y2);
  ctx.lineTo(x + r, y2);
  ctx.quadraticCurveTo(x, y2, x, y2 - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
};

export function makeShape(kind, store) {
  let drawing = false,
    start = null,
    lastPreview = null;
  return {
    id: kind,
    cursor: 'crosshair',
    previewRect: null,
    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      drawing = true;
      start = { ...ev.img };
      lastPreview = null;
    },
    onPointerMove(ctx, ev, eng) {
      if (!drawing) return;
      const cur = { ...ev.img };
      const s = store.getToolState(kind);
      const x1 = Math.min(start.x, cur.x),
        y1 = Math.min(start.y, cur.y);
      let w = Math.max(1, Math.abs(cur.x - start.x)),
        h = Math.max(1, Math.abs(cur.y - start.y));
      if (ev.shift) {
        if (kind === 'line') {
          const dx = cur.x - start.x,
            dy = cur.y - start.y;
          const a = Math.atan2(dy, dx);
          const ang = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          cur.x = start.x + Math.cos(ang) * len;
          cur.y = start.y + Math.sin(ang) * len;
        } else {
          const m = Math.max(w, h);
          w = h = m;
        }
      }
      this.previewRect =
        kind === 'line'
          ? {
              x: Math.min(start.x, cur.x),
              y: Math.min(start.y, cur.y),
              w: Math.abs(cur.x - start.x),
              h: Math.abs(cur.y - start.y),
            }
          : {
              x: Math.floor(x1),
              y: Math.floor(y1),
              w: Math.floor(w),
              h: Math.floor(h),
            };
      lastPreview = { start, cur, shift: ev.shift, state: { ...s } };
    },
    onPointerUp(ctx, ev, eng) {
      if (!drawing) return;
      drawing = false;
      if (!lastPreview) {
        this.previewRect = null;
        return;
      }
      const { start: s, cur, state } = lastPreview;
      const strokeColor = state.primaryColor,
        fillColor = state.secondaryColor;
      const lineWidth = state.brushSize,
        fillOn = state.fillOn;
      const dashPattern = state.dashPattern;
      const capStyle = state.capStyle;
      ctx.save();
      ctx.imageSmoothingEnabled = !!state.antialias;
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeColor;
      applyStrokeStyle(ctx, { dashPattern, capStyle });
      ctx.fillStyle = fillColor;
      if (kind === 'line') {
        ctx.beginPath();
        ctx.moveTo(s.x + 0.5, s.y + 0.5);
        ctx.lineTo(cur.x + 0.5, cur.y + 0.5);
        ctx.stroke();
        eng.expandPendingRectByRect(
          Math.min(s.x, cur.x) - lineWidth,
          Math.min(s.y, cur.y) - lineWidth,
          Math.abs(cur.x - s.x) + lineWidth * 2,
          Math.abs(cur.y - s.y) + lineWidth * 2,
        );
      } else if (kind === 'rect') {
        const x = Math.min(s.x, cur.x),
          y = Math.min(s.y, cur.y),
          w = Math.abs(cur.x - s.x),
          h = Math.abs(cur.y - s.y);
        const radius = clampCornerRadius(state.cornerRadius, w, h);
        if (fillOn) {
          ctx.beginPath();
          beginRoundedRectPath(ctx, x, y, w, h, radius);
          ctx.fill();
        }
        ctx.beginPath();
        beginRoundedRectPath(ctx, x + 0.5, y + 0.5, w, h, radius);
        ctx.stroke();
        eng.expandPendingRectByRect(
          x - lineWidth,
          y - lineWidth,
          w + lineWidth * 2,
          h + lineWidth * 2,
        );
      } else if (kind === 'ellipse') {
        const cx = (s.x + cur.x) / 2,
          cy = (s.y + cur.y) / 2,
          rx = Math.abs(cur.x - s.x) / 2,
          ry = Math.abs(cur.y - s.y) / 2;
        ctx.beginPath();
        drawEllipsePath(ctx, cx, cy, rx, ry);
        if (fillOn) ctx.fill();
        ctx.stroke();
        eng.expandPendingRectByRect(
          cx - rx - lineWidth,
          cy - ry - lineWidth,
          rx * 2 + lineWidth * 2,
          ry * 2 + lineWidth * 2,
        );
      }
      ctx.restore();
      this.previewRect = null;
    },
  };
}
