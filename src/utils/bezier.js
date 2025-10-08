const EPSILON = 1e-9;

function lerpPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

/**
 * Evaluate a quadratic Bézier curve at a given parameter.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {number} t Parameter in [0,1]
 * @returns {{x:number,y:number}}
 */
export function evaluateQuadraticBezier(p0, p1, p2, t) {
  const u = 1 - t;
  const tt = t * t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + tt * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + tt * p2.y,
  };
}

/**
 * Evaluate a cubic Bézier curve at a given parameter.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @param {number} t Parameter in [0,1]
 * @returns {{x:number,y:number}}
 */
export function evaluateCubicBezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/**
 * Split a quadratic Bézier curve into two segments at parameter t.
 * Returns the five control points that make up the two segments.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {number} t
 * @returns {[{x:number,y:number},{x:number,y:number},{x:number,y:number},{x:number,y:number},{x:number,y:number}]}
 */
export function subdivideQuadraticBezier(p0, p1, p2, t) {
  const p01 = lerpPoint(p0, p1, t);
  const p12 = lerpPoint(p1, p2, t);
  const mid = lerpPoint(p01, p12, t);
  return [p0, p01, mid, p12, p2];
}

/**
 * Split a cubic Bézier curve into two segments at parameter t using De Casteljau.
 * Returns the seven control points that make up the two segments.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @param {number} t
 * @returns {[{x:number,y:number},{x:number,y:number},{x:number,y:number},{x:number,y:number},{x:number,y:number},{x:number,y:number},{x:number,y:number}]}
 */
export function subdivideCubicBezier(p0, p1, p2, p3, t) {
  const p01 = lerpPoint(p0, p1, t);
  const p12 = lerpPoint(p1, p2, t);
  const p23 = lerpPoint(p2, p3, t);
  const p012 = lerpPoint(p01, p12, t);
  const p123 = lerpPoint(p12, p23, t);
  const mid = lerpPoint(p012, p123, t);
  return [p0, p01, p012, mid, p123, p23, p3];
}

function quadraticExtrema(p0, p1, p2) {
  const denom = p0 - 2 * p1 + p2;
  if (Math.abs(denom) < EPSILON) {
    return [];
  }
  const t = (p0 - p1) / denom;
  return t > 0 && t < 1 ? [t] : [];
}

function cubicExtrema(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots = quadraticRoots(a, b, c);
  return roots.filter((t) => t > 0 && t < 1);
}

function quadraticRoots(a, b, c) {
  if (Math.abs(a) < EPSILON) {
    if (Math.abs(b) < EPSILON) {
      return [];
    }
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    return [];
  }
  if (disc === 0) {
    return [-b / (2 * a)];
  }
  const sqrtDisc = Math.sqrt(disc);
  return [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)];
}

/**
 * Calculate the axis-aligned bounding box for a quadratic Bézier curve.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function quadraticBezierBounds(p0, p1, p2) {
  const xs = [p0.x, p2.x];
  const ys = [p0.y, p2.y];
  for (const t of quadraticExtrema(p0.x, p1.x, p2.x)) {
    const { x } = evaluateQuadraticBezier(p0, p1, p2, t);
    xs.push(x);
  }
  for (const t of quadraticExtrema(p0.y, p1.y, p2.y)) {
    const { y } = evaluateQuadraticBezier(p0, p1, p2, t);
    ys.push(y);
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/**
 * Calculate the axis-aligned bounding box for a cubic Bézier curve.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function cubicBezierBounds(p0, p1, p2, p3) {
  const xs = [p0.x, p3.x];
  const ys = [p0.y, p3.y];
  for (const t of cubicExtrema(p0.x, p1.x, p2.x, p3.x)) {
    const { x } = evaluateCubicBezier(p0, p1, p2, p3, t);
    xs.push(x);
  }
  for (const t of cubicExtrema(p0.y, p1.y, p2.y, p3.y)) {
    const { y } = evaluateCubicBezier(p0, p1, p2, p3, t);
    ys.push(y);
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function chordLength(p0, p3) {
  return Math.hypot(p3.x - p0.x, p3.y - p0.y);
}

function controlPolygonLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

function adaptiveCubicLength(p0, p1, p2, p3, depth = 0) {
  const chord = chordLength(p0, p3);
  const contnet = controlPolygonLength([p0, p1, p2, p3]);
  const diff = contnet - chord;
  if (diff <= 0.01 || depth >= 10) {
    return (chord + contnet) / 2;
  }
  const [q0, q1, q2, q3, q4, q5, q6] = subdivideCubicBezier(p0, p1, p2, p3, 0.5);
  return adaptiveCubicLength(q0, q1, q2, q3, depth + 1) + adaptiveCubicLength(q3, q4, q5, q6, depth + 1);
}

/**
 * Approximate the length of a quadratic Bézier curve using an equivalent cubic curve.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @returns {number}
 */
export function quadraticBezierLength(p0, p1, p2) {
  const c1 = {
    x: p0.x + (2 / 3) * (p1.x - p0.x),
    y: p0.y + (2 / 3) * (p1.y - p0.y),
  };
  const c2 = {
    x: p2.x + (2 / 3) * (p1.x - p2.x),
    y: p2.y + (2 / 3) * (p1.y - p2.y),
  };
  return adaptiveCubicLength(p0, c1, c2, p2);
}

/**
 * Approximate the length of a cubic Bézier curve using adaptive subdivision.
 * @param {{x:number,y:number}} p0
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} p3
 * @returns {number}
 */
export function cubicBezierLength(p0, p1, p2, p3) {
  return adaptiveCubicLength(p0, p1, p2, p3);
}
