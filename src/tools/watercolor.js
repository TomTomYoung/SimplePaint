function makeWatercolor(store) {
  const id = 'watercolor';
  let drawing = false;
  let ctxRef = null;
  let engRef = null;
  const wetCanvas = document.createElement('canvas');
  let wetCtx = wetCanvas.getContext('2d');
  let running = false;
  let hasWet = false;

  function ensureCanvas(ctx) {
    if (wetCanvas.width !== ctx.canvas.width || wetCanvas.height !== ctx.canvas.height) {
      wetCanvas.width = ctx.canvas.width;
      wetCanvas.height = ctx.canvas.height;
      wetCtx = wetCanvas.getContext('2d');
    }
  }

  function stamp(x, y, size, color) {
    wetCtx.save();
    wetCtx.fillStyle = color;
    wetCtx.beginPath();
    wetCtx.arc(x, y, size / 2, 0, Math.PI * 2);
    wetCtx.fill();
    wetCtx.restore();
    hasWet = true;
  }

  function step() {
    if (!ctxRef || !hasWet) { running = false; return; }
    const { diffusion = 0.1, evaporation = 0.02 } = store.getToolState(id);
    const D = parseFloat(diffusion);
    const E = parseFloat(evaporation);
    const absorption = 0.05;
    const w = wetCanvas.width;
    const h = wetCanvas.height;
    const img = wetCtx.getImageData(0, 0, w, h);
    const src = img.data;
    const dst = new Uint8ClampedArray(src.length);
    let maxA = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 4; c++) {
          const center = src[idx + c];
          const up = src[idx + (y > 0 ? -w * 4 : 0) + c];
          const down = src[idx + (y < h - 1 ? w * 4 : 0) + c];
          const left = src[idx + (x > 0 ? -4 : 0) + c];
          const right = src[idx + (x < w - 1 ? 4 : 0) + c];
          let val = center + D * (up + down + left + right - 4 * center);
          if (c === 3) {
            val *= 1 - E;
            maxA = Math.max(maxA, val);
          }
          dst[idx + c] = Math.max(0, Math.min(255, val));
        }
      }
    }

    img.data.set(dst);
    wetCtx.putImageData(img, 0, 0);

    ctxRef.save();
    ctxRef.globalAlpha = absorption;
    ctxRef.drawImage(wetCanvas, 0, 0);
    ctxRef.restore();

    wetCtx.save();
    wetCtx.globalCompositeOperation = 'destination-out';
    wetCtx.globalAlpha = absorption;
    wetCtx.drawImage(wetCanvas, 0, 0);
    wetCtx.restore();

    engRef?.expandPendingRectByRect(0, 0, w, h);

    if (maxA > 0) {
      requestAnimationFrame(step);
    } else {
      hasWet = false;
      running = false;
      engRef?.finishStrokeToHistory();
    }
  }

  return {
    id,
    cursor: 'crosshair',
    previewRect: null,
    onPointerDown(ctx, ev, eng) {
      eng.clearSelection();
      eng.beginStrokeSnapshot?.();
      ensureCanvas(ctx);
      ctxRef = ctx;
      engRef = eng;
      drawing = true;
      const s = store.getToolState(id);
      stamp(ev.img.x, ev.img.y, s.brushSize, s.primaryColor);
      if (!running) {
        running = true;
        requestAnimationFrame(step);
      }
    },
    onPointerMove(ctx, ev) {
      if (!drawing) return;
      const s = store.getToolState(id);
      stamp(ev.img.x, ev.img.y, s.brushSize, s.primaryColor);
    },
    onPointerUp() {
      drawing = false;
    },
    drawPreview() {},
  };
}
