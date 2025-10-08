/**
 * Path utilities built on top of the geometry helpers.
 * They operate on simple {x, y} coordinate arrays so tools can reuse them.
 */

import { closestPointOnSegment } from './geometry.js';

const EPSILON = 1e-9;

const clonePoint = (point) => ({ x: point.x, y: point.y });

const positiveModulo = (value, modulus) => {
  const result = value % modulus;
  return result < 0 ? result + modulus : result;
};

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
