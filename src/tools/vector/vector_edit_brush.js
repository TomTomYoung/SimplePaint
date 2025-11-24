// ツール仕様: 概要=ベクターパスの作成・編集ツール。 入力=ポインタクリック/ドラッグ、修飾キー、必要に応じてキーボード確定操作。 出力=ベクターレイヤー上のパスやアウトライン操作結果。 操作=クリックで点やパスを追加、ドラッグで制御点調整、Enterで確定、Escでキャンセル。
const TOOL_ID = 'vector-edit';
const SOURCE_TOOL_ID = 'vectorization';
const HANDLE_RADIUS = 6;
const SNAP_THRESHOLD = 10;

/**
 * ベクタ化ツールで作成したベジェパスの編集ツール。
 * @param {import('../../core/store.js').Store} store
 */
export function makeVectorEditBrush(store) {
  let cachedState = store.getToolState(SOURCE_TOOL_ID) || {};
  let cachedVectors = extractVectors(cachedState);

  /** @type {PointRef|null} */
  let hoverPoint = null;
  /** @type {PointRef|null} */
  let selectedPoint = null;
  /** @type {PointRef|null} */
  let draggingPoint = null;
  let pointerId = null;
  /** @type {{rect: DOMRectLike, data: ImageData}|null} */
  let capturedRegion = null;
  /** @type {DOMRectLike|null} */
  let originalRect = null;

  const tool = {
    id: TOOL_ID,
    cursor: 'default',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      refreshVectors();
      const hit = findNearestPoint(cachedVectors, ev.img.x, ev.img.y);
      if (!hit) {
        selectedPoint = null;
        hoverPoint = null;
        draggingPoint = null;
        pointerId = null;
        tool.previewRect = null;
        eng.requestRepaint?.();
        return;
      }

      selectedPoint = { ...hit };
      hoverPoint = { ...hit };
      draggingPoint = { ...hit };
      pointerId = ev.pointerId;

      const vector = cachedVectors[hit.vecIdx];
      originalRect = computeStrokeRect(vector);
      capturedRegion = captureRegion(ctx, originalRect);

      eng.beginStrokeSnapshot?.();
      tool.previewRect = originalRect;
      eng.requestRepaint?.();
    },

    onPointerMove(_ctx, ev, eng) {
      if (draggingPoint && ev.pointerId === pointerId) {
        const vector = cachedVectors[draggingPoint.vecIdx];
        if (!vector) return;
        applyPointPosition(vector, draggingPoint, ev.img.x, ev.img.y);
        const updatedRect = computeStrokeRect(vector);
        tool.previewRect = unionRects(originalRect, updatedRect);
        eng.requestRepaint?.();
        return;
      }

      const hit = findNearestPoint(cachedVectors, ev.img.x, ev.img.y);
      const nextHover = hit ? { ...hit } : null;
      if (!pointsEqual(hoverPoint, nextHover)) {
        hoverPoint = nextHover;
        eng.requestRepaint?.();
      }
    },

    onPointerUp(ctx, ev, eng) {
      if (!draggingPoint || ev.pointerId !== pointerId) {
        draggingPoint = null;
        pointerId = null;
        return;
      }

      const vector = cachedVectors[draggingPoint.vecIdx];
      if (!vector) {
        draggingPoint = null;
        pointerId = null;
        return;
      }

      applyPointPosition(vector, draggingPoint, ev.img.x, ev.img.y);
      const updatedRect = computeStrokeRect(vector);
      const affectedRect = unionRects(originalRect, updatedRect);

      if (capturedRegion) {
        ctx.putImageData(capturedRegion.data, capturedRegion.rect.x, capturedRegion.rect.y);
      }

      strokeVector(ctx, vector);

      if (affectedRect) {
        eng.expandPendingRectByRect?.(affectedRect.x, affectedRect.y, affectedRect.w, affectedRect.h);
      }

      store.setToolState(SOURCE_TOOL_ID, { vectors: cloneVectors(cachedVectors) });
      cachedState = store.getToolState(SOURCE_TOOL_ID) || {};
      cachedVectors = extractVectors(cachedState);
      selectedPoint = validatePoint(selectedPoint, cachedVectors);
      hoverPoint = validatePoint(hoverPoint, cachedVectors);

      eng.finishStrokeToHistory?.();

      tool.previewRect = affectedRect;
      pointerId = null;
      draggingPoint = null;
      capturedRegion = null;
      originalRect = null;

      eng.requestRepaint?.();
    },

    drawPreview(octx) {
      if (!pointerId) {
        refreshVectors();
      }
      octx.save();
      octx.lineWidth = 1;
      octx.lineCap = 'round';
      octx.lineJoin = 'round';
      octx.strokeStyle = 'rgba(70, 128, 255, 0.8)';
      octx.fillStyle = '#fff';

      cachedVectors.forEach((vector, vecIdx) => {
        const segments = vector.segments || [];
        if (!segments.length) return;

        octx.save();
        octx.globalAlpha = 0.85;
        octx.beginPath();
        octx.moveTo(segments[0].p0.x, segments[0].p0.y);
        segments.forEach((seg) => {
          octx.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p3.x, seg.p3.y);
        });
        octx.stroke();
        octx.restore();

        octx.save();
        octx.strokeStyle = 'rgba(110, 160, 255, 0.7)';
        octx.setLineDash([4, 4]);
        segments.forEach((seg) => {
          octx.beginPath();
          octx.moveTo(seg.p0.x, seg.p0.y);
          octx.lineTo(seg.c1.x, seg.c1.y);
          octx.moveTo(seg.p3.x, seg.p3.y);
          octx.lineTo(seg.c2.x, seg.c2.y);
          octx.stroke();
        });
        octx.restore();

        segments.forEach((seg, segIdx) => {
          if (segIdx === 0) {
            drawAnchor(octx, seg.p0, isSelected(vecIdx, segIdx, 'p0'), isHover(vecIdx, segIdx, 'p0'));
          }
          drawHandle(octx, seg.c1, isSelected(vecIdx, segIdx, 'c1'), isHover(vecIdx, segIdx, 'c1'));
          drawHandle(octx, seg.c2, isSelected(vecIdx, segIdx, 'c2'), isHover(vecIdx, segIdx, 'c2'));
          drawAnchor(octx, seg.p3, isSelected(vecIdx, segIdx, 'p3'), isHover(vecIdx, segIdx, 'p3'));
        });
      });

      octx.restore();
    },

    cancel() {
      pointerId = null;
      draggingPoint = null;
      capturedRegion = null;
      originalRect = null;
      tool.previewRect = null;
    },
  };

  return tool;

  function refreshVectors() {
    cachedState = store.getToolState(SOURCE_TOOL_ID) || {};
    cachedVectors = extractVectors(cachedState);
    selectedPoint = validatePoint(selectedPoint, cachedVectors);
    hoverPoint = validatePoint(hoverPoint, cachedVectors);
  }

  function isSelected(vecIdx, segIdx, key) {
    return !!selectedPoint &&
      selectedPoint.vecIdx === vecIdx &&
      selectedPoint.segIdx === segIdx &&
      selectedPoint.pointKey === key;
  }

  function isHover(vecIdx, segIdx, key) {
    return !!hoverPoint &&
      hoverPoint.vecIdx === vecIdx &&
      hoverPoint.segIdx === segIdx &&
      hoverPoint.pointKey === key;
  }
}

function findNearestPoint(vectors, x, y) {
  let best = null;
  let bestDist = SNAP_THRESHOLD * SNAP_THRESHOLD;
  vectors.forEach((vector, vecIdx) => {
    const segments = vector.segments || [];
    segments.forEach((seg, segIdx) => {
      if (segIdx === 0) {
        best = comparePoint(best, bestDist, vecIdx, segIdx, 'p0', seg.p0, x, y);
        if (best && best.distanceSq < bestDist) {
          bestDist = best.distanceSq;
        }
      }
      best = comparePoint(best, bestDist, vecIdx, segIdx, 'c1', seg.c1, x, y);
      if (best && best.distanceSq < bestDist) {
        bestDist = best.distanceSq;
      }
      best = comparePoint(best, bestDist, vecIdx, segIdx, 'c2', seg.c2, x, y);
      if (best && best.distanceSq < bestDist) {
        bestDist = best.distanceSq;
      }
      best = comparePoint(best, bestDist, vecIdx, segIdx, 'p3', seg.p3, x, y);
      if (best && best.distanceSq < bestDist) {
        bestDist = best.distanceSq;
      }
    });
  });
  return best ? { vecIdx: best.vecIdx, segIdx: best.segIdx, pointKey: best.pointKey } : null;
}

function comparePoint(currentBest, currentDist, vecIdx, segIdx, key, point, x, y) {
  if (!point) return currentBest;
  const dx = point.x - x;
  const dy = point.y - y;
  const distSq = dx * dx + dy * dy;
  if (distSq > currentDist) return currentBest;
  if (!currentBest || distSq < currentBest.distanceSq) {
    return { vecIdx, segIdx, pointKey: key, distanceSq: distSq };
  }
  return currentBest;
}

function applyPointPosition(vector, ref, x, y) {
  const segments = vector?.segments;
  if (!segments) return;
  const seg = segments[ref.segIdx];
  if (!seg || !seg[ref.pointKey]) return;
  seg[ref.pointKey].x = x;
  seg[ref.pointKey].y = y;
  if (ref.pointKey === 'p0' && ref.segIdx > 0) {
    const prev = segments[ref.segIdx - 1];
    if (prev && prev.p3) {
      prev.p3.x = x;
      prev.p3.y = y;
    }
  }
  if (ref.pointKey === 'p3' && ref.segIdx + 1 < segments.length) {
    const next = segments[ref.segIdx + 1];
    if (next && next.p0) {
      next.p0.x = x;
      next.p0.y = y;
    }
  }
}

function computeStrokeRect(vector) {
  if (!vector) return null;
  const segments = vector.segments || [];
  if (!segments.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  segments.forEach((seg) => {
    [seg.p0, seg.c1, seg.c2, seg.p3].forEach((pt) => {
      if (!pt) return;
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  const pad = Math.ceil(Math.max(1, Number(vector.width) || 1) / 2 + 2);
  const x = Math.floor(minX - pad);
  const y = Math.floor(minY - pad);
  const w = Math.ceil(maxX - minX + pad * 2);
  const h = Math.ceil(maxY - minY + pad * 2);
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) };
}

function unionRects(a, b) {
  if (!a) return b;
  if (!b) return a;
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return {
    x: Math.floor(minX),
    y: Math.floor(minY),
    w: Math.ceil(maxX - minX),
    h: Math.ceil(maxY - minY),
  };
}

function captureRegion(ctx, rect) {
  if (!rect) return null;
  const rx = Math.max(0, Math.floor(rect.x));
  const ry = Math.max(0, Math.floor(rect.y));
  const rMaxX = Math.min(ctx.canvas.width, Math.ceil(rect.x + rect.w));
  const rMaxY = Math.min(ctx.canvas.height, Math.ceil(rect.y + rect.h));
  const rw = Math.max(0, rMaxX - rx);
  const rh = Math.max(0, rMaxY - ry);
  if (rw <= 0 || rh <= 0) return null;
  try {
    const data = ctx.getImageData(rx, ry, rw, rh);
    return { rect: { x: rx, y: ry, w: rw, h: rh }, data };
  } catch {
    return null;
  }
}

function strokeVector(ctx, vector) {
  const segments = vector.segments || [];
  if (!segments.length) return;
  const width = Math.max(1, Number(vector.width) || 1);
  const color = vector.color || '#000';
  const join = vector.join || 'round';
  const cap = vector.cap || 'round';
  const off = width <= 1 ? 0.5 : 0;

  ctx.save();
  ctx.lineWidth = width;
  ctx.lineJoin = join;
  ctx.lineCap = cap;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(segments[0].p0.x + off, segments[0].p0.y + off);
  segments.forEach((seg) => {
    ctx.bezierCurveTo(
      seg.c1.x + off,
      seg.c1.y + off,
      seg.c2.x + off,
      seg.c2.y + off,
      seg.p3.x + off,
      seg.p3.y + off,
    );
  });
  ctx.stroke();
  ctx.restore();
}

function drawAnchor(ctx, point, selected, hover) {
  if (!point) return;
  const radius = HANDLE_RADIUS;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = selected ? '#cc4400' : '#3366ff';
  ctx.fillStyle = selected ? '#ff8800' : hover ? '#66aaff' : '#ffffff';
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHandle(ctx, point, selected, hover) {
  if (!point) return;
  const size = HANDLE_RADIUS * 1.6;
  ctx.save();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = selected ? '#cc4400' : '#5c85ff';
  ctx.fillStyle = selected ? '#ffb347' : hover ? '#8ec5ff' : '#ffffff';
  const half = size / 2;
  ctx.beginPath();
  ctx.rect(point.x - half, point.y - half, size, size);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function extractVectors(state) {
  const vectors = Array.isArray(state?.vectors) ? state.vectors : [];
  return vectors.map(cloneVector);
}

function cloneVector(vector) {
  const segments = Array.isArray(vector?.segments) ? vector.segments.map(cloneSegment) : [];
  return {
    ...vector,
    segments,
  };
}

function cloneVectors(vectors) {
  return vectors.map(cloneVector);
}

function cloneSegment(seg) {
  return {
    p0: { x: seg?.p0?.x ?? 0, y: seg?.p0?.y ?? 0 },
    c1: { x: seg?.c1?.x ?? 0, y: seg?.c1?.y ?? 0 },
    c2: { x: seg?.c2?.x ?? 0, y: seg?.c2?.y ?? 0 },
    p3: { x: seg?.p3?.x ?? 0, y: seg?.p3?.y ?? 0 },
  };
}

function validatePoint(ref, vectors) {
  if (!ref) return null;
  const vec = vectors[ref.vecIdx];
  if (!vec) return null;
  const seg = vec.segments?.[ref.segIdx];
  if (!seg || !(ref.pointKey in seg)) return null;
  return { ...ref };
}

function pointsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.vecIdx === b.vecIdx && a.segIdx === b.segIdx && a.pointKey === b.pointKey;
}

/**
 * @typedef {{vecIdx:number,segIdx:number,pointKey:'p0'|'c1'|'c2'|'p3'}} PointRef
 */

/**
 * @typedef {{x:number,y:number,w:number,h:number}} DOMRectLike
 */
