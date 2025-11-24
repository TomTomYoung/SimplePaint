/*
 * ツール仕様
 * 概要: 幾何図形を配置する形状ツール。
 * 入力: ポインタドラッグ、Shift/Altなどの修飾キー。
 * 出力: 確定した図形のパスまたは描画。
 * 操作: ドラッグで図形のサイズや角度を決め、離して確定。必要に応じてShiftで比率固定。
 */
import { applyStrokeStyle } from '../../utils/stroke-style.js';

export function makeEllipse2(store) {
        const id = 'ellipse-2';
        let stage = 0,
          cx = 0,
          cy = 0,
          rx = 0,
          ry = 0,
          rot = 0;
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
              rx = Math.abs(ev.img.x - cx);
              ry = Math.abs(ev.img.y - cy);
              rot = 0;
              stage = 2;
            } else if (stage === 2) {
              const s = store.getToolState(id);
              ctx.save();
              ctx.lineWidth = s.brushSize;
              ctx.strokeStyle = s.primaryColor;
              ctx.fillStyle = s.secondaryColor;
              applyStrokeStyle(ctx, s);
              ctx.beginPath();
              ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
              if (s.fillOn) ctx.fill();
              ctx.stroke();
              ctx.restore();
              eng.expandPendingRectByRect(
                cx - rx - s.brushSize,
                cy - ry - s.brushSize,
                rx * 2 + s.brushSize * 2,
                ry * 2 + s.brushSize * 2
              );
              stage = 0;
            }
          },
          onPointerMove(ctx, ev) {
            if (stage === 1) {
              rx = Math.abs(ev.img.x - cx);
              ry = Math.abs(ev.img.y - cy);
            } else if (stage === 2) {
              rot = Math.atan2(ev.img.y - cy, ev.img.x - cx);
            }
          },
          onPointerUp() {},
          drawPreview(octx) {
            if (stage > 0) {
              const s = store.getToolState(id);
              octx.save();
              octx.lineWidth = s.brushSize;
              octx.strokeStyle = s.primaryColor;
              applyStrokeStyle(octx, s);
              octx.beginPath();
              octx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
              if (s.fillOn) {
                octx.save();
                octx.globalAlpha = 0.2;
                octx.fillStyle = s.secondaryColor;
                octx.fill();
                octx.restore();
              }
              octx.stroke();
              octx.restore();
            }
          },
        };
      }
