export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t,
    t3 = t2 * t;
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

export function catmullRomSpline(pts, seg = 16) {
  const out = [];
  if (pts.length < 2) return pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    for (let j = 0; j <= seg; j++) {
      const t = j / seg;
      out.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  return out;
}

export function bspline(points, deg = 3, seg = 32) {
  const n = points.length - 1;
  if (n < deg) return points;
  const knots = [];
  const m = n + deg + 1;
  for (let i = 0; i <= m; i++) {
    if (i <= deg) knots.push(0);
    else if (i >= n + 1) knots.push(n - deg + 1);
    else knots.push(i - deg);
  }
  const out = [];
  const start = knots[deg],
    end = knots[n + 1];
  const step = (end - start) / seg;
  for (let s = 0; s <= seg; s++) {
    const u = start + s * step;
    let j = n;
    if (u < end) {
      for (let k = deg; k <= n; k++) {
        if (u >= knots[k] && u < knots[k + 1]) {
          j = k;
          break;
        }
      }
    }
    out.push(deBoor(deg, u, knots, points, j));
  }
  return out;
}
function deBoor(k, u, t, c, j) {
  const d = [];
  for (let r = 0; r <= k; r++) d[r] = { ...c[j - k + r] };
  for (let r = 1; r <= k; r++) {
    for (let i = k; i >= r; i--) {
      const idx = j - k + i;
      const alpha = (u - t[idx]) / (t[idx + k + 1 - r] - t[idx]);
      d[i] = {
        x: (1 - alpha) * d[i - 1].x + alpha * d[i].x,
        y: (1 - alpha) * d[i - 1].y + alpha * d[i].y,
      };
    }
  }
  return d[k];
}

export function nurbs(points, weights, deg = 3, seg = 32) {
  const n = points.length - 1;
  const knots = [];
  for (let i = 0; i <= n + deg + 1; i++) knots.push(i);

  function N(i, k, u) {
    if (k === 0) {
      if (u === knots[knots.length - 1]) return i === n ? 1 : 0;
      return u >= knots[i] && u < knots[i + 1] ? 1 : 0;
    }
    const den1 = knots[i + k] - knots[i];
    const den2 = knots[i + k + 1] - knots[i + 1];
    const a = den1 ? (u - knots[i]) / den1 : 0;
    const b = den2 ? (knots[i + k + 1] - u) / den2 : 0;
    return a * N(i, k - 1, u) + b * N(i + 1, k - 1, u);
  }

  const uStart = knots[deg];
  const uEnd = knots[n + 1];
  const out = [];
  const step = (uEnd - uStart) / seg;
  for (let s = 0; s <= seg; s++) {
    const u = s === seg ? uEnd - 1e-9 : uStart + s * step;
    let x = 0,
      y = 0,
      w = 0;
    for (let i = 0; i <= n; i++) {
      const b = N(i, deg, u) * (weights[i] ?? 1);
      x += points[i].x * b;
      y += points[i].y * b;
      w += b;
    }
    if (!isFinite(w) || Math.abs(w) < 1e-8) continue;
    out.push({ x: x / w, y: y / w });
  }
  return out;
}

// expose for non-module scripts
window.catmullRomSpline = catmullRomSpline;
window.bspline = bspline;
window.nurbs = nurbs;
