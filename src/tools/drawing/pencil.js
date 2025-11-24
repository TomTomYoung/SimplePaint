

// ツール仕様: 概要=ストローク系の描画ツール群。筆圧や速度に応じてピクセルを塗布し、
// 形状や質感を変化させます。
// 入力=ペン/マウスのポインタイベント、筆圧や速度、Shiftなどの修飾キー。 
// 出力=ラスターレイヤー上の筆跡や効果付きストローク。 
// 操作=左ドラッグで描画開始→移動でストローク更新→離して確定。
// 右クリックやスポイト機能がある場合は色取得に使用。
export function makePencil(store) {
        const id = 'pencil';
        let drawing = false,
          last = null;
        return {
          id,
          cursor: 'crosshair',
          onPointerDown(ctx, ev, eng) {
            eng.clearSelection();
            drawing = true;
            last = ev.img;
            eng.expandPendingRect(
              ev.img.x,
              ev.img.y,
              store.getToolState(id).brushSize
            );
            stroke(ctx, ev.img);
          },
          onPointerMove(ctx, ev, eng) {
            if (!drawing) return;
            eng.expandPendingRect(
              ev.img.x,
              ev.img.y,
              store.getToolState(id).brushSize
            );
            stroke(ctx, ev.img);
          },
          onPointerUp() {
            drawing = false;
            last = null;
          },
        };
        function stroke(ctx, img) {
          const s = store.getToolState(id);
          const opacity = Number.isFinite(s.opacity)
            ? Math.min(Math.max(s.opacity, 0), 1)
            : 1;
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = opacity;
          ctx.strokeStyle = s.primaryColor;
          ctx.lineWidth = s.brushSize;
          ctx.beginPath();
          if (last) ctx.moveTo(last.x + 0.01, last.y + 0.01);
          else ctx.moveTo(img.x + 0.01, img.y + 0.01);
          ctx.lineTo(img.x + 0.01, img.y + 0.01);
          ctx.stroke();
          ctx.restore();
          last = img;
        }
      }
