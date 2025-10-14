import { toolDefaults } from '../../core/store.js';

const TOOL_ID = 'vector-tool';

const DEFAULTS = Object.freeze({
  ...toolDefaults,
  snapToGrid: false,
  gridSize: 8,
  snapToExisting: true,
  snapRadius: 6,
  simplifyTolerance: 0.75,
  rasterizeMode: 'manual', // manual | onExport | auto
  showAnchors: true,
});

const MIN_SAMPLE_DISTANCE_SQ = 0.25; // 0.5px

export function makeVectorTool(store) {
  const persisted = store.getToolState(TOOL_ID, DEFAULTS) || {};
  const initialPaths = normalisePersistedPaths(persisted.vectors);
  let pathId = Math.max(0, ...initialPaths.map((path) => path.id)) + 1;
  const model = {
    /** @type {VectorPath[]} */
    paths: initialPaths,
    /** @type {DraftPath|null} */
    draft: null,
    /** @type {number|null} */
    selection: initialPaths.length ? initialPaths[initialPaths.length - 1].id : null,
    /** @type {EditState|null} */
    edit: null,
  };

  const coordinateProcessor = new CoordinateProcessor(() => getConfig(store));
  const renderer = new VectorRenderer(model, () => getConfig(store));
  const rasterizer = new VectorRasterizer();

  const tool = {
    id: TOOL_ID,
    cursor: 'crosshair',
    previewRect: null,

    onPointerDown(ctx, ev, eng) {
      const config = getConfig(store);
      const hit = hitTestAnchor(ev.img, model, config);
      if (hit) {
        model.selection = hit.pathId;
        model.edit = hit;
        tool.previewRect = computeSelectionRect(model);
        eng.requestRepaint?.();
        return;
      }

      eng.clearSelection?.();
      eng.beginStrokeSnapshot?.();

      const start = coordinateProcessor.process(ev.img, model.paths);
      model.draft = {
        id: pathId,
        color: config.primaryColor,
        width: Math.max(1, config.brushSize || 1),
        points: [start],
      };
      tool.previewRect = computeDraftRect(model.draft);
      eng.requestRepaint?.();
    },

    onPointerMove(_ctx, ev, eng) {
      if (model.edit) {
        const { pathId, pointIndex } = model.edit;
        const path = model.paths.find((candidate) => candidate.id === pathId);
        if (!path) {
          model.edit = null;
          return;
        }
        const snapped = coordinateProcessor.process(
          ev.img,
          model.paths,
          [],
          { exclude: model.edit },
        );
        path.points[pointIndex] = snapped;
        tool.previewRect = computePathRect(path);
        eng.requestRepaint?.();
        return;
      }

      if (!model.draft) return;
      const candidate = coordinateProcessor.process(ev.img, model.paths, model.draft.points);
      const last = model.draft.points[model.draft.points.length - 1];
      if (!last || distanceSquared(last, candidate) < MIN_SAMPLE_DISTANCE_SQ) {
        tool.previewRect = computeDraftRect(model.draft);
        eng.requestRepaint?.();
        return;
      }
      model.draft.points.push(candidate);
      tool.previewRect = computeDraftRect(model.draft);
      eng.requestRepaint?.();
    },

    onPointerUp(ctx, ev, eng) {
      if (model.edit) {
        const { pathId, pointIndex } = model.edit;
        const path = model.paths.find((candidate) => candidate.id === pathId);
        model.edit = null;
        if (!path) return;

        const snapped = coordinateProcessor.process(
          ev.img,
          model.paths,
          [],
          { exclude: { pathId, pointIndex } },
        );
        path.points[pointIndex] = snapped;
        tool.previewRect = computePathRect(path);
        syncVectorsToStore(store, model.paths);
        eng.requestRepaint?.();
        return;
      }

      if (!model.draft) return;
      const config = getConfig(store);
      const finalPoint = coordinateProcessor.process(ev.img, model.paths, model.draft.points);
      const last = model.draft.points[model.draft.points.length - 1];
      if (!last || distanceSquared(last, finalPoint) >= MIN_SAMPLE_DISTANCE_SQ) {
        model.draft.points.push(finalPoint);
      }

      const simplified = simplifyPath(model.draft.points, config.simplifyTolerance);
      const canonical = simplified.length > 0 ? simplified : model.draft.points;
      const path = {
        id: pathId++,
        color: model.draft.color,
        width: model.draft.width,
        points: canonical.map(clonePoint),
      };
      model.paths.push(path);
      model.selection = path.id;
      model.draft = null;
      tool.previewRect = computePathRect(path);
      syncVectorsToStore(store, model.paths);

      if (config.rasterizeMode === 'auto') {
        const dirty = rasterizer.rasterizePaths(ctx, [path]);
        if (dirty) {
          eng.expandPendingRectByRect?.(dirty.x, dirty.y, dirty.w, dirty.h);
          eng.finishStrokeToHistory?.();
        } else {
          eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.();
        }
      } else {
        eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.();
      }

      eng.requestRepaint?.();
    },

    drawPreview(octx) {
      renderer.draw(octx);
    },

    onEnter(ctx, eng) {
      if (!model.paths.length) return;
      eng.beginStrokeSnapshot?.();
      const dirty = rasterizer.rasterizePaths(ctx, model.paths);
      if (!dirty) {
        eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.();
        return;
      }
      eng.expandPendingRectByRect?.(dirty.x, dirty.y, dirty.w, dirty.h);
      eng.finishStrokeToHistory?.();
    },

    cancel() {
      model.draft = null;
      model.edit = null;
      tool.previewRect = computeSelectionRect(model);
    },

    rasterizeToLayer(ctx, eng, options = {}) {
      const { clearVectors = false } = options;
      if (!model.paths.length) return null;
      eng.beginStrokeSnapshot?.();
      const dirty = rasterizer.rasterizePaths(ctx, model.paths);
      if (dirty) {
        eng.expandPendingRectByRect?.(dirty.x, dirty.y, dirty.w, dirty.h);
        eng.finishStrokeToHistory?.();
      } else {
        eng.commitStrokeSnapshot?.() || eng.endStrokeSnapshot?.();
      }
      if (clearVectors) {
        model.paths.length = 0;
        model.selection = null;
        model.edit = null;
        tool.previewRect = null;
        syncVectorsToStore(store, model.paths);
        eng.requestRepaint?.();
      }
      return dirty;
    },

    exportVectorsToSvg() {
      return exportToSvg(model.paths);
    },

    getVectorsSnapshot() {
      return model.paths.map((path) => ({
        id: path.id,
        color: path.color,
        width: path.width,
        points: path.points.map(clonePoint),
      }));
    },
  };

  tool.previewRect =
    computeSelectionRect(model) ?? computePathsUnionRect(model.paths) ?? null;

  return tool;
}

/* ========================================================================== */

function getConfig(store) {
  return store.getToolState(TOOL_ID, DEFAULTS);
}

function syncVectorsToStore(store, paths) {
  const vectors = paths.map((path) => ({
    id: path.id,
    color: path.color,
    width: path.width,
    points: path.points.map(clonePoint),
  }));
  store.setToolState(TOOL_ID, { vectors }, { defaults: DEFAULTS });
}

function computeDraftRect(draft) {
  if (!draft) return null;
  return computePointsRect(draft.points, draft.width);
}

function computePathRect(path) {
  return computePointsRect(path.points, path.width);
}

function computeSelectionRect(model) {
  if (!model.selection) return null;
  const target = model.paths.find((path) => path.id === model.selection);
  if (!target) return null;
  return computePathRect(target);
}

function hitTestAnchor(point, model, config) {
  if (!point) return null;
  const radius = Math.max(1, Number(config?.snapRadius) || 6);
  const radiusSq = radius * radius;
  let closest = null;
  let minDist = Infinity;

  for (const path of model.paths) {
    for (let i = 0; i < path.points.length; i++) {
      const candidate = path.points[i];
      const distSq = distanceSquared(point, candidate);
      if (distSq <= radiusSq && distSq < minDist) {
        minDist = distSq;
        closest = { pathId: path.id, pointIndex: i };
      }
    }
  }

  return closest;
}

function computePointsRect(points, width) {
  if (!points || points.length === 0) return null;
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const pad = Math.max(1, (width || 1) / 2 + 1);
  const x = Math.floor(minX - pad);
  const y = Math.floor(minY - pad);
  const w = Math.ceil(maxX - minX + pad * 2) || 1;
  const h = Math.ceil(maxY - minY + pad * 2) || 1;
  return { x, y, w, h };
}

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function clonePoint(pt) {
  return { x: pt.x, y: pt.y };
}

function simplifyPath(points, tolerance) {
  if (!points || points.length <= 2 || !Number.isFinite(tolerance) || tolerance <= 0) {
    return points ? points.map(clonePoint) : [];
  }
  return douglasPeucker(points, tolerance);
}

function douglasPeucker(points, tolerance) {
  if (points.length <= 2) return points.map(clonePoint);
  const result = [];
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;

  const stack = [[0, points.length - 1]];
  const tolSq = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    let index = -1;
    let maxDistSq = 0;
    const a = points[first];
    const b = points[last];
    for (let i = first + 1; i < last; i++) {
      const dSq = pointToSegmentDistanceSquared(points[i], a, b);
      if (dSq > maxDistSq) {
        maxDistSq = dSq;
        index = i;
      }
    }
    if (index !== -1 && maxDistSq > tolSq) {
      stack.push([first, index], [index, last]);
      keep[index] = true;
    }
  }

  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(clonePoint(points[i]));
  }
  return dedupeSequentialPoints(result);
}

function dedupeSequentialPoints(points) {
  if (points.length <= 1) return points;
  const filtered = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = filtered[filtered.length - 1];
    const cur = points[i];
    if (prev.x !== cur.x || prev.y !== cur.y) {
      filtered.push(cur);
    }
  }
  return filtered;
}

function pointToSegmentDistanceSquared(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return distanceSquared(p, a);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return distanceSquared(p, b);
  const t = c1 / c2;
  const px = a.x + vx * t;
  const py = a.y + vy * t;
  const dx = p.x - px;
  const dy = p.y - py;
  return dx * dx + dy * dy;
}

function exportToSvg(paths) {
  const bounds = unionRects(paths.map(computePathRect).filter(Boolean));
  const width = bounds ? bounds.w : 1;
  const height = bounds ? bounds.h : 1;
  const offsetX = bounds ? bounds.x : 0;
  const offsetY = bounds ? bounds.y : 0;
  const viewBox = `${offsetX} ${offsetY} ${width} ${height}`;
  const content = paths
    .map((path) => {
      const d = path.points
        .map((pt, index) => `${index === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`)
        .join(' ');
      const stroke = escapeSvgAttr(path.color);
      const width = Math.max(0.01, path.width || 1);
      return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${content}</svg>`;
}

function escapeSvgAttr(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function unionRects(rects) {
  if (!rects.length) return null;
  let minX = rects[0].x;
  let minY = rects[0].y;
  let maxX = rects[0].x + rects[0].w;
  let maxY = rects[0].y + rects[0].h;
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i];
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function computePathsUnionRect(paths) {
  if (!paths || !paths.length) return null;
  const rects = [];
  for (const path of paths) {
    const rect = computePathRect(path);
    if (rect) rects.push(rect);
  }
  return unionRects(rects);
}

/* ========================================================================== */

class CoordinateProcessor {
  constructor(getConfig) {
    this.getConfig = getConfig;
  }

  process(point, paths, draftPoints = [], options = {}) {
    const config = this.getConfig();
    const original = clonePoint(point);
    let snapped = clonePoint(point);

    if (config.snapToExisting) {
      const target = this.findExistingAnchor(point, paths, draftPoints, config, options);
      if (target) {
        snapped = target;
        return snapped;
      }
    }

    if (config.snapToGrid) {
      const size = Math.max(1, Number(config.gridSize) || 1);
      snapped = {
        x: Math.round(point.x / size) * size,
        y: Math.round(point.y / size) * size,
      };
    }

    if (!Number.isFinite(snapped.x) || !Number.isFinite(snapped.y)) {
      return original;
    }

    return snapped;
  }

  findExistingAnchor(point, paths, draftPoints, config, options = {}) {
    const radius = Math.max(0, Number(config.snapRadius) || 0);
    if (radius <= 0) return null;
    const radiusSq = radius * radius;
    let closest = null;
    let minDist = Infinity;

    const exclude = options.exclude;
    const testPoints = [];
    if (Array.isArray(draftPoints) && draftPoints.length) {
      draftPoints.forEach((pt, index) => {
        testPoints.push({
          pt,
          source: { type: 'draft', index },
        });
      });
    }
    for (const path of paths) {
      for (let i = 0; i < path.points.length; i++) {
        testPoints.push({
          pt: path.points[i],
          source: { type: 'path', pathId: path.id, index: i },
        });
      }
    }

    for (const candidate of testPoints) {
      if (
        exclude &&
        candidate.source.type === 'path' &&
        exclude.pathId === candidate.source.pathId &&
        exclude.pointIndex === candidate.source.index
      ) {
        continue;
      }
      const distSq = distanceSquared(point, candidate.pt);
      if (distSq <= radiusSq && distSq < minDist) {
        minDist = distSq;
        closest = candidate.pt;
      }
    }
    return closest ? clonePoint(closest) : null;
  }
}

class VectorRenderer {
  constructor(model, getConfig) {
    this.model = model;
    this.getConfig = getConfig;
  }

  draw(octx) {
    const config = this.getConfig();
    octx.save();
    octx.lineCap = 'round';
    octx.lineJoin = 'round';
    for (const path of this.model.paths) {
      this.drawStoredPath(octx, path, config);
    }
    if (this.model.draft) {
      this.drawDraft(octx, this.model.draft, config);
    }
    octx.restore();
  }

  drawStoredPath(octx, path, config) {
    const selected = this.model.selection === path.id;
    const width = Math.max(1, path.width || 1);
    const pts = path.points;
    if (!pts.length) return;
    const off = width <= 1 ? 0.5 : 0;

    octx.save();
    octx.globalAlpha = selected ? 1 : 0.7;
    octx.strokeStyle = path.color;
    octx.lineWidth = width;
    if (pts.length === 1) {
      const radius = width / 2;
      octx.fillStyle = path.color;
      octx.beginPath();
      octx.arc(pts[0].x, pts[0].y, radius, 0, Math.PI * 2);
      octx.fill();
    } else {
      octx.beginPath();
      octx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x + off, pts[i].y + off);
      }
      octx.stroke();
    }
    octx.restore();

    if (config.showAnchors) {
      this.drawAnchors(octx, pts, selected);
    }
  }

  drawDraft(octx, draft, config) {
    const pts = draft.points;
    if (!pts.length) return;
    const width = Math.max(1, draft.width || 1);
    const off = width <= 1 ? 0.5 : 0;

    octx.save();
    octx.strokeStyle = draft.color;
    octx.lineWidth = width;
    octx.globalAlpha = 0.9;
    octx.setLineDash([4, 3]);
    if (pts.length === 1) {
      const radius = width / 2;
      octx.beginPath();
      octx.arc(pts[0].x, pts[0].y, radius, 0, Math.PI * 2);
      octx.stroke();
    } else {
      octx.beginPath();
      octx.moveTo(pts[0].x + off, pts[0].y + off);
      for (let i = 1; i < pts.length; i++) {
        octx.lineTo(pts[i].x + off, pts[i].y + off);
      }
      octx.stroke();
    }
    octx.restore();

    if (config.showAnchors) {
      this.drawAnchors(octx, pts, false);
    }
  }

  drawAnchors(octx, points, highlighted) {
    const size = highlighted ? 4 : 3;
    const half = size / 2;
    octx.save();
    octx.fillStyle = highlighted ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.8)';
    octx.strokeStyle = highlighted ? '#333' : '#666';
    for (const pt of points) {
      octx.beginPath();
      octx.rect(pt.x - half, pt.y - half, size, size);
      octx.fill();
      octx.stroke();
    }
    octx.restore();
  }
}

class VectorRasterizer {
  rasterizePaths(ctx, paths) {
    if (!paths || paths.length === 0) return null;
    const rects = [];
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const path of paths) {
      const rect = this.rasterizePath(ctx, path);
      if (rect) rects.push(rect);
    }
    ctx.restore();
    return unionRects(rects.filter(Boolean));
  }

  rasterizePath(ctx, path) {
    if (!path.points.length) return null;
    const width = Math.max(1, path.width || 1);
    const off = width <= 1 ? 0.5 : 0;
    ctx.save();
    ctx.strokeStyle = path.color;
    ctx.fillStyle = path.color;
    ctx.lineWidth = width;
    if (path.points.length === 1) {
      const pt = path.points[0];
      const radius = width / 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(path.points[0].x + off, path.points[0].y + off);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x + off, path.points[i].y + off);
      }
      ctx.stroke();
    }
    ctx.restore();
    return computePathRect(path);
  }
}

/**
 * @typedef {{id:number,color:string,width:number,points:{x:number,y:number}[]}} VectorPath
 * @typedef {{id:number,color:string,width:number,points:{x:number,y:number}[]}} DraftPath
 * @typedef {{pathId:number, pointIndex:number}} EditState
 */

function normalisePersistedPaths(vectors) {
  if (!Array.isArray(vectors)) return [];
  const out = [];
  const usedIds = new Set();
  let nextId = 1;

  for (const entry of vectors) {
    if (!entry || typeof entry !== 'object') continue;
    const rawPoints = Array.isArray(entry.points) ? entry.points : [];
    const points = rawPoints
      .map((pt) => ({ x: Number(pt?.x), y: Number(pt?.y) }))
      .filter((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y));
    if (!points.length) continue;

    let id = Number(entry.id);
    if (!Number.isFinite(id) || id <= 0 || usedIds.has(id)) {
      while (usedIds.has(nextId)) nextId++;
      id = nextId++;
    }
    usedIds.add(id);

    const width = Number(entry.width);
    const color = typeof entry.color === 'string' ? entry.color : toolDefaults.primaryColor;

    out.push({
      id,
      color,
      width: Number.isFinite(width) && width > 0 ? width : 1,
      points,
    });
  }

  return out;
}
