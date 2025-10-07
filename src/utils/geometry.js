/**
 * Geometry helpers shared across curve tools.
 * All functions operate on plain {x, y} coordinate objects so tools can reuse them easily.
 */

/**
 * Evaluate a Catmull–Rom spline segment.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @param {number} t interpolation parameter in [0,1]
 */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

/**
 * Sample a Catmull–Rom spline for the supplied control points.
 * @param {Array<{x:number,y:number}>} pts
 * @param {number} [segments=16]
 */
export function catmullRomSpline(pts, segments = 16) {
  if (pts.length < 2) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      out.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  return out;
}

/**
 * Compute a uniform B-spline through the provided control points.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} [degree=3]
 * @param {number} [segments=32]
 */
export function bspline(points, degree = 3, segments = 32) {
  const n = points.length - 1;
  if (n < degree) return points.slice();

  const knots = [];
  const m = n + degree + 1;
  for (let i = 0; i <= m; i++) {
    if (i <= degree) knots.push(0);
    else if (i >= n + 1) knots.push(n - degree + 1);
    else knots.push(i - degree);
  }

  const out = [];
  const start = knots[degree];
  const end = knots[n + 1];
  const step = (end - start) / segments;

  for (let s = 0; s <= segments; s++) {
    const u = start + s * step;
    let j = n;
    if (u < end) {
      for (let k = degree; k <= n; k++) {
        if (u >= knots[k] && u < knots[k + 1]) {
          j = k;
          break;
        }
      }
    }
    out.push(deBoor(degree, u, knots, points, j));
  }
  return out;
}

function deBoor(k, u, t, c, j) {
  const d = [];
  for (let r = 0; r <= k; r++) d[r] = { ...c[j - k + r] };
  for (let r = 1; r <= k; r++) {
    for (let i = k; i >= r; i--) {
      const idx = j - k + i;
      const denom = t[idx + k + 1 - r] - t[idx];
      const alpha = denom ? (u - t[idx]) / denom : 0;
      d[i] = {
        x: (1 - alpha) * d[i - 1].x + alpha * d[i].x,
        y: (1 - alpha) * d[i - 1].y + alpha * d[i].y,
      };
    }
  }
  return d[k];
}

/**
 * Non-uniform rational B-spline evaluator.
 * @param {Array<{x:number,y:number}>} points
 * @param {number[]} weights
 * @param {number} [degree=3]
 * @param {number} [segments=32]
 */
export function nurbs(points, weights, degree = 3, segments = 32) {
  const n = points.length - 1;
  if (n < 0) return [];
  const knots = [];
  for (let i = 0; i <= n + degree + 1; i++) knots.push(i);

  function basis(i, k, u) {
    if (k === 0) {
      if (u === knots[knots.length - 1]) return i === n ? 1 : 0;
      return u >= knots[i] && u < knots[i + 1] ? 1 : 0;
    }
    const den1 = knots[i + k] - knots[i];
    const den2 = knots[i + k + 1] - knots[i + 1];
    const a = den1 ? (u - knots[i]) / den1 : 0;
    const b = den2 ? (knots[i + k + 1] - u) / den2 : 0;
    return a * basis(i, k - 1, u) + b * basis(i + 1, k - 1, u);
  }

  const uStart = knots[degree];
  const uEnd = knots[n + 1];
  const out = [];
  const step = (uEnd - uStart) / segments;
  for (let s = 0; s <= segments; s++) {
    const u = s === segments ? uEnd - 1e-9 : uStart + s * step;
    let x = 0;
    let y = 0;
    let w = 0;
    for (let i = 0; i <= n; i++) {
      const b = basis(i, degree, u) * (weights[i] ?? 1);
      x += points[i].x * b;
      y += points[i].y * b;
      w += b;
    }
    if (!Number.isFinite(w) || Math.abs(w) < 1e-8) continue;
    out.push({ x: x / w, y: y / w });
  }
  return out;
}

/**
 * Compute the axis-aligned bounding box for a set of points.
 * @param {Array<{x:number,y:number}>} points
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}|null}
 */
export function computeAABB(points) {
  if (!points.length) return null;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 折れ線の総延長を求める。
 * @param {Array<{x:number,y:number}>} points
 * @returns {number}
 */
export function polylineLength(points) {
  if (points.length < 2) return 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    length += Math.hypot(curr.x - prev.x, curr.y - prev.y);
  }
  return length;
}

/**
 * 多角形の面積を求める。結果は常に非負。
 * @param {Array<{x:number,y:number}>} points
 * @returns {number}
 */
export function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const { x: x1, y: y1 } = points[i];
    const { x: x2, y: y2 } = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * 多角形の重心を求める。面積がほぼゼロの場合は頂点の平均を返す。
 * @param {Array<{x:number,y:number}>} points
 * @returns {{x:number,y:number}|null}
 */
export function polygonCentroid(points) {
  const count = points.length;
  if (!count) return null;
  if (count === 1) return { ...points[0] };

  let areaAcc = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < count; i++) {
    const { x: x1, y: y1 } = points[i];
    const { x: x2, y: y2 } = points[(i + 1) % count];
    const cross = x1 * y2 - x2 * y1;
    areaAcc += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }

  const area = areaAcc / 2;
  if (Math.abs(area) < 1e-8) {
    let sumX = 0;
    let sumY = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }
    return { x: sumX / count, y: sumY / count };
  }

  const factor = 1 / (6 * area);
  return { x: cx * factor, y: cy * factor };
}

if (typeof window !== 'undefined') {
  window.catmullRomSpline = catmullRomSpline;
  window.bspline = bspline;
  window.nurbs = nurbs;
}
