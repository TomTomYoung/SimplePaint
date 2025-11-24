/*
 * ツール仕様
 * 概要: 幾何図形を配置する形状ツール。
 * 入力: ポインタドラッグ、Shift/Altなどの修飾キー。
 * 出力: 確定した図形のパスまたは描画。
 * 操作: ドラッグで図形のサイズや角度を決め、離して確定。必要に応じてShiftで比率固定。
 */
import { applyStrokeStyle } from '../../utils/stroke-style.js';

export function makeArc(store) {
        const id = 'arc';
        let stage = 0,
          cx = 0,
          cy = 0,
          r = 0,
          start = 0,
          end = 0;
        return {
          id,
          cursor: 'crosshair',
          previewRect: null,
          onPointerDown(ctx, ev, eng) {
            if (stage === 0) {
              cx = ev.img.x;
              cy = ev.img.y;
              stage = 1;
            } else if (stage === 1) {
              r = Math.hypot(ev.img.x - cx, ev.img.y - cy);
              start = Math.atan2(ev.img.y - cy, ev.img.x - cx);
              end = start;
              stage = 2;
            } else if (stage === 2) {
              const s = store.getToolState(id);
              ctx.save();
              ctx.lineWidth = s.brushSize;
              ctx.strokeStyle = s.primaryColor;
              applyStrokeStyle(ctx, s);
              ctx.beginPath();
              ctx.arc(cx, cy, r, start, end);
              ctx.stroke();
              ctx.restore();
              const minX = cx - r,
                minY = cy - r;
              eng.expandPendingRectByRect(
                minX - s.brushSize,
                minY - s.brushSize,
                r * 2 + s.brushSize * 2,
                r * 2 + s.brushSize * 2
              );
              stage = 0;
            }
          },
          onPointerMove(ctx, ev) {
            if (stage === 2) {
              end = Math.atan2(ev.img.y - cy, ev.img.x - cx);
            }
          },
          onPointerUp() {},
          drawPreview(octx) {
            if (stage === 2) {
              const s = store.getToolState(id);
              octx.save();
              octx.lineWidth = s.brushSize;
              octx.strokeStyle = s.primaryColor;
              applyStrokeStyle(octx, s);
              octx.beginPath();
              octx.arc(cx, cy, r, start, end);
              octx.stroke();
              octx.restore();
            }
          },
        };
      }
