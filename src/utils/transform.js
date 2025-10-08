/**
 * 2D affine transform utilities using Canvas/SVG matrix conventions.
 * Matrices are represented as [a, b, c, d, e, f] where:
 *   x' = a * x + c * y + e
 *   y' = b * x + d * y + f
 */

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/**
 * Create a fresh identity matrix.
 * @returns {[number, number, number, number, number, number]}
 */
export function identity() {
  return [1, 0, 0, 1, 0, 0];
}

/**
 * Clone an existing matrix.
 * @param {ArrayLike<number>} m
 */
export function clone(m) {
  return [m[0], m[1], m[2], m[3], m[4], m[5]];
}

/**
 * Compute the determinant of a matrix.
 * @param {ArrayLike<number>} m
 */
export function determinant(m) {
  return m[0] * m[3] - m[1] * m[2];
}

/**
 * Check whether a matrix is effectively the identity.
 * @param {ArrayLike<number>} m
 * @param {number} [epsilon=1e-10]
 */
export function isIdentity(m, epsilon = 1e-10) {
  return (
    Math.abs(m[0] - 1) <= epsilon &&
    Math.abs(m[1]) <= epsilon &&
    Math.abs(m[2]) <= epsilon &&
    Math.abs(m[3] - 1) <= epsilon &&
    Math.abs(m[4]) <= epsilon &&
    Math.abs(m[5]) <= epsilon
  );
}

/**
 * Multiply two matrices (a ∘ b), returning a new matrix.
 * @param {ArrayLike<number>} a applied last
 * @param {ArrayLike<number>} b applied first
 */
export function multiply(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/**
 * Compose multiple matrices (last argument applied first).
 * @param {...ArrayLike<number>} matrices
 */
export function compose(...matrices) {
  if (!matrices.length) return identity();
  return matrices.reduce((acc, m) => multiply(acc, m), identity());
}

/**
 * Translation matrix.
 * @param {number} [tx=0]
 * @param {number} [ty=0]
 */
export function translate(tx = 0, ty = 0) {
  return [1, 0, 0, 1, tx, ty];
}

/**
 * Scaling matrix with optional pivot.
 * @param {number} sx
 * @param {number} [sy=sx]
 * @param {number} [cx=0]
 * @param {number} [cy=0]
 */
export function scale(sx, sy = sx, cx = 0, cy = 0) {
  return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy];
}

/**
 * Rotation matrix (counter-clockwise, radians) with optional pivot.
 * @param {number} angle radians
 * @param {number} [cx=0]
 * @param {number} [cy=0]
 */
export function rotate(angle, cx = 0, cy = 0) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    cos,
    sin,
    -sin,
    cos,
    cx - cos * cx + sin * cy,
    cy - sin * cx - cos * cy,
  ];
}

/**
 * Skew (shear) matrix. Angles are in radians.
 * @param {number} [ax=0] skew along the x axis (y -> x) in radians
 * @param {number} [ay=0] skew along the y axis (x -> y) in radians
 */
export function skew(ax = 0, ay = 0) {
  const tx = Math.tan(ax);
  const ty = Math.tan(ay);
  return [1, ty, tx, 1, 0, 0];
}

/**
 * Invert a matrix. Returns null when the matrix is singular.
 * @param {ArrayLike<number>} m
 * @param {number} [epsilon=1e-12]
 */
export function invert(m, epsilon = 1e-12) {
  const det = determinant(m);
  if (Math.abs(det) <= epsilon) return null;
  const invDet = 1 / det;
  return [
    m[3] * invDet,
    -m[1] * invDet,
    -m[2] * invDet,
    m[0] * invDet,
    (m[2] * m[5] - m[3] * m[4]) * invDet,
    (m[1] * m[4] - m[0] * m[5]) * invDet,
  ];
}

/**
 * Apply a matrix to a point.
 * @param {ArrayLike<number>} m
 * @param {{x:number,y:number}} point
 */
export function applyToPoint(m, point) {
  return {
    x: m[0] * point.x + m[2] * point.y + m[4],
    y: m[1] * point.x + m[3] * point.y + m[5],
  };
}

/**
 * Apply a matrix to an array of points.
 * @param {ArrayLike<number>} m
 * @param {Array<{x:number,y:number}>} points
 */
export function applyToPoints(m, points) {
  return points.map((pt) => applyToPoint(m, pt));
}

/**
 * Transform an axis-aligned rectangle and return its bounding box.
 * @param {ArrayLike<number>} m
 * @param {{x:number,y:number,width:number,height:number}} rect
 */
export function transformRect(m, rect) {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((pt) => applyToPoint(m, pt));

  let minX = corners[0].x;
  let maxX = corners[0].x;
  let minY = corners[0].y;
  let maxY = corners[0].y;

  for (let i = 1; i < corners.length; i++) {
    const p = corners[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Decompose a matrix into translation, rotation, scale, and shear components.
 * @param {ArrayLike<number>} m
 */
export function decompose(m) {
  const translate = { x: m[4], y: m[5] };
  let a = m[0];
  let b = m[1];
  let c = m[2];
  let d = m[3];

  let scaleX = Math.hypot(a, b);
  if (!scaleX) {
    return {
      translation: translate,
      rotation: 0,
      scale: { x: 0, y: 0 },
      shear: 0,
    };
  }
  a /= scaleX;
  b /= scaleX;

  let shear = a * c + b * d;
  c -= a * shear;
  d -= b * shear;

  let scaleY = Math.hypot(c, d);
  if (!scaleY) {
    scaleY = 0;
  } else {
    c /= scaleY;
    d /= scaleY;
    shear /= scaleY;
  }

  if (a * d < b * c) {
    scaleY = -scaleY;
    c = -c;
    d = -d;
    shear = -shear;
  }

  const rotation = Math.atan2(b, a);

  return {
    translation: translate,
    rotation,
    scale: { x: scaleX, y: scaleY },
    shear,
  };
}

/**
 * Compose a matrix from decomposition components.
 * @param {{translation?:{x?:number,y?:number},rotation?:number,scale?:{x?:number,y?:number},shear?:number}} components
 */
export function composeFromComponents(components) {
  const translation = components.translation ?? {};
  const rotation = components.rotation ?? 0;
  const scaleComp = components.scale ?? {};
  const shearFactor = components.shear ?? 0;
  const tx = translation.x ?? 0;
  const ty = translation.y ?? 0;

  let m = identity();
  if (scaleComp.x !== undefined || scaleComp.y !== undefined) {
    const sx = scaleComp.x ?? 1;
    const sy = scaleComp.y ?? 1;
    m = multiply([sx, 0, 0, sy, 0, 0], m);
  }
  if (shearFactor) {
    m = multiply([1, 0, shearFactor, 1, 0, 0], m);
  }
  if (rotation) {
    m = multiply(rotate(rotation), m);
  }
  if (tx || ty) {
    m = multiply(translate(tx, ty), m);
  }
  return m;
}
