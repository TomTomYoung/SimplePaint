/**
 * Path utilities built on top of the geometry helpers.
 * They operate on simple {x, y} coordinate arrays so tools can reuse them.
 */

import { closestPointOnSegment } from './geometry.js';

const EPSILON = 1e-9;

const clonePoint = (point) => ({ x: point.x, y: point.y });

const clonePoints = (points) => points.map(clonePoint);

const pointsApproximatelyEqual = (a, b, eps = EPSILON) =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

const pushUniquePoint = (points, point) => {
  if (!points.length || !pointsApproximatelyEqual(points.at(-1), point)) {
    points.push(clonePoint(point));
  }
};

const getPointAtIndex = (points, index, closed) => {
  const count = points.length;
  if (count === 0) return null;
  if (closed) {
    const wrapped = positiveModulo(index, count);
    return points[wrapped];
  }
  if (index <= 0) return points[0];
  if (index >= count - 1) return points[count - 1];
  return points[index];
};

const positiveModulo = (value, modulus) => {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
};

const catmullRomIncrement = (ti, pa, pb, alpha) => {
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const dist = Math.hypot(dx, dy);
  const increment = dist <= EPSILON ? 1 : Math.pow(dist, alpha);
  return ti + increment;
};

const catmullRomLerp = (pa, pb, t, ta, tb) => {
  const denom = tb - ta;
  if (Math.abs(denom) <= EPSILON) {
    return clonePoint(pb);
  }
  const ratio = (t - ta) / denom;
  return {
    x: pa.x + (pb.x - pa.x) * ratio,
    y: pa.y + (pb.y - pa.y) * ratio,
  };
};

function evaluateCatmullRomSegment(p0, p1, p2, p3, t, alpha) {
  if (!Number.isFinite(t)) {
    throw new Error('t must be a finite number');
  }
  if (t <= 0) {
    return clonePoint(p1);
  }
  if (t >= 1) {
    return clonePoint(p2);
  }

  const a = Math.max(0, Math.min(1, t));
  const t0 = 0;
  const t1 = catmullRomIncrement(t0, p0, p1, alpha);
  const t2 = catmullRomIncrement(t1, p1, p2, alpha);
  const t3 = catmullRomIncrement(t2, p2, p3, alpha);
  const tActual = t1 + (t2 - t1) * a;

  const A1 = catmullRomLerp(p0, p1, tActual, t0, t1);
  const A2 = catmullRomLerp(p1, p2, tActual, t1, t2);
  const A3 = catmullRomLerp(p2, p3, tActual, t2, t3);

  const B1 = catmullRomLerp(A1, A2, tActual, t0, t2);
  const B2 = catmullRomLerp(A2, A3, tActual, t1, t3);

  return catmullRomLerp(B1, B2, tActual, t1, t2);
}

function catmullRomTangent(p0, p1, p2, p3, t, alpha) {
  const delta = 1e-4;
  let start = t - delta;
  let end = t + delta;
  if (start < 0) {
    start = 0;
    end = Math.min(1, start + delta);
  }
  if (end > 1) {
    end = 1;
    start = Math.max(0, end - delta);
  }
  if (Math.abs(end - start) <= EPSILON) {
    return { x: 0, y: 0 };
  }

  const a = evaluateCatmullRomSegment(p0, p1, p2, p3, start, alpha);
  const b = evaluateCatmullRomSegment(p0, p1, p2, p3, end, alpha);
  const scale = 1 / (end - start);
  return {
    x: (b.x - a.x) * scale,
    y: (b.y - a.y) * scale,
  };
}

/**
 * Evaluate a Catmull–Rom spline segment at a parameter t.
 * @param {{x:number,y:number}} p0 Previous control point
 * @param {{x:number,y:number}} p1 Segment start
 * @param {{x:number,y:number}} p2 Segment end
 * @param {{x:number,y:number}} p3 Next control point
 * @param {number} t Normalised parameter in [0,1]
 * @param {{alpha?:number}} [options]
 * @returns {{x:number,y:number}}
 */
export function evaluateCatmullRom(p0, p1, p2, p3, t, { alpha = 0.5 } = {}) {
  const clampedAlpha = Number.isFinite(alpha) ? Math.max(0, alpha) : 0.5;
  return evaluateCatmullRomSegment(p0, p1, p2, p3, t, clampedAlpha);
}

/**
 * Pre-compute cumulative arc-lengths for a polyline or polygon.
 * @param {Array<{x:number,y:number}>} points
 * @param {{closed?:boolean}} [options]
 * @returns {{total:number,lengths:number[],closed:boolean}|null}
 */
export function computeArcLengthTable(points, { closed = false } = {}) {
  const count = points.length;
  if (count === 0) return null;

  const lengths = [0];
  if (count === 1) {
    return { total: 0, lengths, closed };
  }

  const segmentCount = closed ? count : count - 1;
  let total = 0;
  for (let i = 0; i < segmentCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % count];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    total += length;
    lengths.push(total);
  }

  return { total, lengths, closed };
}

function splitSegment(a, b) {
  return {
    q: {
      x: 0.75 * a.x + 0.25 * b.x,
      y: 0.75 * a.y + 0.25 * b.y,
    },
    r: {
      x: 0.25 * a.x + 0.75 * b.x,
      y: 0.25 * a.y + 0.75 * b.y,
    },
  };
}

function normalizeVector(x, y) {
  const length = Math.hypot(x, y);
  if (length <= EPSILON) return null;
  return { x: x / length, y: y / length };
}

function sampleAlong(points, table, distance) {
  const { closed, total, lengths } = table;
  const count = points.length;
  if (count === 0) return null;
  if (count === 1 || total <= EPSILON) {
    return {
      point: clonePoint(points[0] ?? { x: 0, y: 0 }),
      index: 0,
      t: 0,
      distance: 0,
      total,
    };
  }

  let target = distance;
  if (closed) {
    target = positiveModulo(target, total);
  } else {
    if (target <= 0) {
      return {
        point: clonePoint(points[0]),
        index: 0,
        t: 0,
        distance: 0,
        total,
      };
    }
    if (target >= total) {
      return {
        point: clonePoint(points[count - 1]),
        index: count - 2,
        t: 1,
        distance: total,
        total,
      };
    }
  }

  // binary search the lengths array for the surrounding segment
  let low = 0;
  let high = lengths.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lengths[mid] <= target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const segmentIndex = Math.min(Math.max(high, 0), lengths.length - 2);
  const startLength = lengths[segmentIndex];
  const endLength = lengths[segmentIndex + 1];
  const segmentLength = endLength - startLength;
  const localT = segmentLength > EPSILON ? (target - startLength) / segmentLength : 0;

  const a = points[segmentIndex];
  const b = points[(segmentIndex + 1) % count];

  return {
    point: {
      x: a.x + (b.x - a.x) * localT,
      y: a.y + (b.y - a.y) * localT,
    },
    index: segmentIndex,
    t: localT,
    distance: target,
    total,
  };
}

/**
 * Sample a point along the path at the provided arc length.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} distance
 * @param {{closed?:boolean}} [options]
 * @returns {{point:{x:number,y:number},index:number,t:number,distance:number,total:number}|null}
 */
export function pointAtDistance(points, distance, { closed = false } = {}) {
  const table = computeArcLengthTable(points, { closed });
  if (!table) return null;
  return sampleAlong(points, table, distance);
}

/**
 * Compute the unit tangent vector at the supplied arc length.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} distance
 * @param {{closed?:boolean}} [options]
 * @returns {{x:number,y:number}|null}
 */
export function tangentAtDistance(points, distance, { closed = false } = {}) {
  const table = computeArcLengthTable(points, { closed });
  if (!table) return null;
  const sample = sampleAlong(points, table, distance);
  if (!sample) return null;
  const count = points.length;
  if (count < 2) return { x: 0, y: 0 };

  let startIndex = sample.index;
  let endIndex = (startIndex + 1) % count;
  if (!closed && endIndex >= count) {
    startIndex = count - 2;
    endIndex = count - 1;
  }

  let dx = points[endIndex].x - points[startIndex].x;
  let dy = points[endIndex].y - points[startIndex].y;

  if (Math.hypot(dx, dy) <= EPSILON) {
    // fall back to the nearest non-degenerate neighbouring segment
    if (closed) {
      for (let offset = 1; offset < count; offset++) {
        const forward = (startIndex + offset) % count;
        const forwardNext = (forward + 1) % count;
        dx = points[forwardNext].x - points[forward].x;
        dy = points[forwardNext].y - points[forward].y;
        if (Math.hypot(dx, dy) > EPSILON) break;
      }
    } else {
      for (let forward = startIndex + 1; forward < count - 1; forward++) {
        dx = points[forward + 1].x - points[forward].x;
        dy = points[forward + 1].y - points[forward].y;
        if (Math.hypot(dx, dy) > EPSILON) break;
      }
      if (Math.hypot(dx, dy) <= EPSILON) {
        for (let backward = startIndex - 1; backward >= 0; backward--) {
          dx = points[backward + 1].x - points[backward].x;
          dy = points[backward + 1].y - points[backward].y;
          if (Math.hypot(dx, dy) > EPSILON) break;
        }
      }
    }
  }

  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) {
    return { x: 0, y: 0 };
  }
  return { x: dx / length, y: dy / length };
}

/**
 * Resample the path at roughly equal arc-length intervals.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} spacing
 * @param {{closed?:boolean,includeLast?:boolean}} [options]
 * @returns {Array<{x:number,y:number}>}
 */
export function resampleBySpacing(points, spacing, { closed = false, includeLast } = {}) {
  if (spacing <= 0) {
    throw new Error('spacing must be a positive number');
  }
  const count = points.length;
  if (count === 0) return [];
  if (count === 1) return [clonePoint(points[0])];

  const table = computeArcLengthTable(points, { closed });
  if (!table || table.total <= EPSILON) {
    return points.map(clonePoint);
  }

  const result = [clonePoint(points[0])];
  for (let distance = spacing; distance < table.total - EPSILON; distance += spacing) {
    result.push(sampleAlong(points, table, distance).point);
  }

  const shouldIncludeLast = includeLast ?? true;
  if (shouldIncludeLast) {
    if (closed) {
      result.push(clonePoint(result[0]));
    } else {
      result.push(clonePoint(points[count - 1]));
    }
  }

  return result;
}

/**
 * Resample the path into a fixed number of evenly spaced samples.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} count
 * @param {{closed?:boolean,includeLast?:boolean}} [options]
 * @returns {Array<{x:number,y:number}>}
 */
export function resampleByCount(points, count, { closed = false, includeLast = false } = {}) {
  if (count <= 0) return [];
  if (points.length === 0) return [];
  if (points.length === 1) {
    return Array.from({ length: includeLast ? count + 1 : count }, () => clonePoint(points[0]));
  }

  const table = computeArcLengthTable(points, { closed });
  if (!table || table.total <= EPSILON) {
    const samples = Array.from({ length: count }, () => clonePoint(points[0]));
    if (includeLast) samples.push(clonePoint(points[0]));
    return samples;
  }

  const samples = [];
  if (!closed) {
    if (count === 1) {
      samples.push(clonePoint(points[0]));
    } else {
      const step = table.total / (count - 1);
      for (let i = 0; i < count; i++) {
        if (i === count - 1) {
          samples.push(clonePoint(points[points.length - 1]));
        } else {
          samples.push(sampleAlong(points, table, step * i).point);
        }
      }
    }
    if (includeLast && count > 0) {
      samples.push(clonePoint(points[points.length - 1]));
    }
    return samples;
  }

  const step = table.total / count;
  for (let i = 0; i < count; i++) {
    samples.push(sampleAlong(points, table, step * i).point);
  }
  if (includeLast && samples.length) {
    samples.push(clonePoint(samples[0]));
  }
  return samples;
}

/**
 * Sample a Catmull–Rom spline that interpolates the supplied points.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} [segmentsPerCurve=8]
 * @param {{closed?:boolean,alpha?:number}} [options]
 * @returns {Array<{x:number,y:number}>}
 */
export function sampleCatmullRom(points, segmentsPerCurve = 8, { closed = false, alpha = 0.5 } = {}) {
  const count = points.length;
  if (count === 0) return [];
  if (count === 1) return [clonePoint(points[0])];

  const segmentCount = closed ? count : count - 1;
  if (segmentCount <= 0) {
    return clonePoints(points);
  }

  const samples = [];
  const segments = Math.max(1, Math.floor(segmentsPerCurve));
  const clampedAlpha = Number.isFinite(alpha) ? Math.max(0, alpha) : 0.5;

  for (let i = 0; i < segmentCount; i++) {
    const p0 = getPointAtIndex(points, i - 1, closed);
    const p1 = getPointAtIndex(points, i, closed);
    const p2 = getPointAtIndex(points, i + 1, closed);
    const p3 = getPointAtIndex(points, i + 2, closed);

    if (!p0 || !p1 || !p2 || !p3) continue;

    if (i === 0) {
      pushUniquePoint(samples, p1);
    }

    for (let step = 1; step <= segments; step++) {
      const t = step / segments;
      const sample = evaluateCatmullRomSegment(p0, p1, p2, p3, t, clampedAlpha);
      pushUniquePoint(samples, sample);
    }
  }

  if (closed && samples.length) {
    pushUniquePoint(samples, samples[0]);
  }

  return samples;
}

/**
 * Convert a Catmull–Rom spline through the provided points into cubic Bézier segments.
 * @param {Array<{x:number,y:number}>} points
 * @param {{closed?:boolean,alpha?:number}} [options]
 * @returns {Array<{p0:{x:number,y:number},p1:{x:number,y:number},p2:{x:number,y:number},p3:{x:number,y:number}}>} 
 */
export function catmullRomToBezierSegments(points, { closed = false, alpha = 0.5 } = {}) {
  const count = points.length;
  if (count < 2) return [];

  const segmentCount = closed ? count : count - 1;
  if (segmentCount <= 0) return [];

  const clampedAlpha = Number.isFinite(alpha) ? Math.max(0, alpha) : 0.5;
  const segments = [];

  for (let i = 0; i < segmentCount; i++) {
    const p0 = getPointAtIndex(points, i - 1, closed);
    const p1 = getPointAtIndex(points, i, closed);
    const p2 = getPointAtIndex(points, i + 1, closed);
    const p3 = getPointAtIndex(points, i + 2, closed);

    if (!p0 || !p1 || !p2 || !p3) continue;

    const start = clonePoint(p1);
    const end = clonePoint(p2);
    const startTangent = catmullRomTangent(p0, p1, p2, p3, 0, clampedAlpha);
    const endTangent = catmullRomTangent(p0, p1, p2, p3, 1, clampedAlpha);

    const control1 = {
      x: start.x + startTangent.x / 3,
      y: start.y + startTangent.y / 3,
    };
    const control2 = {
      x: end.x - endTangent.x / 3,
      y: end.y - endTangent.y / 3,
    };

    segments.push({ p0: start, p1: control1, p2: control2, p3: end });
  }

  return segments;
}

/**
 * Apply Chaikin smoothing to the provided path.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} [iterations=1]
 * @param {{closed?:boolean,preserveEnds?:boolean}} [options]
 * @returns {Array<{x:number,y:number}>}
 */
export function chaikinSmooth(points, iterations = 1, { closed = false, preserveEnds = true } = {}) {
  if (!points.length) return [];
  if (points.length === 1) return [clonePoint(points[0])];

  const count = Math.max(0, Math.floor(iterations));
  if (count === 0) {
    return clonePoints(points);
  }

  let current = clonePoints(points);
  for (let iter = 0; iter < count; iter++) {
    if (current.length < 2) break;
    const next = [];

    if (closed) {
      const segmentCount = current.length;
      for (let i = 0; i < segmentCount; i++) {
        const a = current[i];
        const b = current[(i + 1) % segmentCount];
        const { q, r } = splitSegment(a, b);
        next.push(q, r);
      }
    } else {
      const limit = current.length - 1;
      if (preserveEnds) {
        next.push(clonePoint(current[0]));
      }
      for (let i = 0; i < limit; i++) {
        const { q, r } = splitSegment(current[i], current[i + 1]);
        next.push(q, r);
      }
      if (preserveEnds) {
        next.push(clonePoint(current[current.length - 1]));
      }
    }

    current = next;
  }

  return current;
}

function douglasPeucker(points, toleranceSquared) {
  const n = points.length;
  if (n <= 2) {
    return points.map(clonePoint);
  }

  const keep = new Array(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;

  const stack = [[0, n - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = -1;
    let maxIndex = -1;

    const startPoint = points[start];
    const endPoint = points[end];
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const denom = dx * dx + dy * dy;

    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      let distSquared;
      if (denom <= EPSILON) {
        const vx = p.x - startPoint.x;
        const vy = p.y - startPoint.y;
        distSquared = vx * vx + vy * vy;
      } else {
        const t = ((p.x - startPoint.x) * dx + (p.y - startPoint.y) * dy) / denom;
        const projX = startPoint.x + t * dx;
        const projY = startPoint.y + t * dy;
        const vx = p.x - projX;
        const vy = p.y - projY;
        distSquared = vx * vx + vy * vy;
      }
      if (distSquared > maxDist) {
        maxDist = distSquared;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceSquared && maxIndex !== -1) {
      keep[maxIndex] = true;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }

  return points.filter((_, index) => keep[index]).map(clonePoint);
}

/**
 * Simplify a polyline or polygon using the Douglas–Peucker algorithm.
 * @param {Array<{x:number,y:number}>} points
 * @param {number} tolerance
 * @param {{closed?:boolean}} [options]
 * @returns {Array<{x:number,y:number}>}
 */
export function simplifyDouglasPeucker(points, tolerance = 1, { closed = false } = {}) {
  if (points.length === 0) return [];
  if (tolerance <= 0 || points.length <= 2) {
    return clonePoints(points);
  }

  const tolSq = tolerance * tolerance;

  if (!closed) {
    return douglasPeucker(points, tolSq);
  }

  if (points.length <= 3) {
    return clonePoints(points);
  }

  const extended = clonePoints(points);
  extended.push(clonePoint(points[0]));
  const simplified = douglasPeucker(extended, tolSq);
  if (simplified.length > 1 && simplified.at(-1).x === simplified[0].x && simplified.at(-1).y === simplified[0].y) {
    simplified.pop();
  }
  return simplified;
}

/**
 * Compute per-vertex tangents and left normals for the provided path.
 * @param {Array<{x:number,y:number}>} points
 * @param {{closed?:boolean}} [options]
 * @returns {Array<{tangent:{x:number,y:number},normal:{x:number,y:number}}>} tangents are unit-length
 */
export function computePathNormals(points, { closed = false } = {}) {
  const count = points.length;
  if (count === 0) return [];
  if (count === 1) {
    return [
      {
        tangent: { x: 1, y: 0 },
        normal: { x: 0, y: 1 },
      },
    ];
  }

  const result = [];
  for (let i = 0; i < count; i++) {
    const current = points[i];
    const prevIndex = i === 0 ? (closed ? (count - 1) : i) : i - 1;
    const nextIndex = i === count - 1 ? (closed ? 0 : i) : i + 1;
    const prev = points[prevIndex];
    const next = points[nextIndex];

    let prevDir = normalizeVector(current.x - prev.x, current.y - prev.y);
    let nextDir = normalizeVector(next.x - current.x, next.y - current.y);

    if (!closed) {
      if (i === 0) {
        prevDir = nextDir ?? prevDir;
      }
      if (i === count - 1) {
        nextDir = prevDir ?? nextDir;
      }
    }

    let tangent = null;
    if (prevDir && nextDir) {
      const tx = prevDir.x + nextDir.x;
      const ty = prevDir.y + nextDir.y;
      tangent = normalizeVector(tx, ty);
      if (!tangent) {
        tangent = normalizeVector(nextDir.x, nextDir.y) ?? normalizeVector(prevDir.x, prevDir.y);
      }
    } else {
      tangent = prevDir ?? nextDir;
    }

    if (!tangent) {
      tangent = { x: 1, y: 0 };
    }

    const normal = { x: -tangent.y, y: tangent.x };
    result.push({ tangent, normal });
  }

  return result;
}

/**
 * Project an arbitrary point onto the closest location along the path.
 * @param {{x:number,y:number}} point
 * @param {Array<{x:number,y:number}>} path
 * @param {{closed?:boolean}} [options]
 * @returns {{point:{x:number,y:number},index:number,t:number,distance:number,arcLength:number}|null}
 */
export function closestPointOnPath(point, path, { closed = false } = {}) {
  const count = path.length;
  if (count === 0) return null;
  if (count === 1) {
    const dx = point.x - path[0].x;
    const dy = point.y - path[0].y;
    return {
      point: clonePoint(path[0]),
      index: 0,
      t: 0,
      distance: Math.hypot(dx, dy),
      arcLength: 0,
    };
  }

  const table = computeArcLengthTable(path, { closed });
  if (!table) return null;

  const segmentCount = closed ? count : count - 1;
  let best = null;
  let bestDist = Infinity;

  for (let i = 0; i < segmentCount; i++) {
    const a = path[i];
    const b = path[(i + 1) % count];
    const projected = closestPointOnSegment(point, a, b);
    const dx = point.x - projected.x;
    const dy = point.y - projected.y;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist - EPSILON) {
      bestDist = dist;
      const startLength = table.lengths[i];
      const endLength = table.lengths[i + 1];
      const segmentLength = endLength - startLength;
      const arc = startLength + segmentLength * projected.t;
      best = {
        point: { x: projected.x, y: projected.y },
        index: i,
        t: projected.t,
        distance: dist,
        arcLength: arc,
      };
    }
  }

  return best;
}
