/**
 * Drawing primitives for tools that operate on a 2D canvas context.
 *
 * Inputs are always explicit (context references, geometry, colour data) so the
 * helpers stay free of global state. When an operation produces metadata it is
 * shaped for serialisation, making it safe to store inside undo stacks or
 * `localStorage` snapshots.
 */

/**
 * Describes the rectangle affected by a flood fill along with the before/after
 * image buffers used by the undo system.
 *
 * @typedef {Object} FloodFillResult
 * @property {{x: number, y: number, w: number, h: number}} rect - Bounding box enclosing every pixel that changed.
 * @property {ImageData} before - Pixels captured before the fill was applied.
 * @property {ImageData} after - Pixels captured after the fill completed.
 */

/**
 * Draws an elliptical path on the provided 2D canvas context using four cubic
 * Bézier curves.
 *
 * The control-point constant `k` approximates a quarter circle using a cubic
 * Bézier curve. It equals `4/3 * tan(π/8)`, which is numerically identical to
 * `4 * (sqrt(2) - 1) / 3` (≈ 0.5522847498307936). Scaling the control distance
 * by each axis radius lets the same approximation draw ellipses.
 *
 * @param {CanvasRenderingContext2D} ctx - Rendering context to mutate.
 * @param {number} cx - X-coordinate of the ellipse centre.
 * @param {number} cy - Y-coordinate of the ellipse centre.
 * @param {number} rx - Ellipse radius along the x-axis.
 * @param {number} ry - Ellipse radius along the y-axis.
 */
export function drawEllipsePath(ctx, cx, cy, rx, ry) {
  const k = 0.5522847498307936;
  const ox = rx * k;
  const oy = ry * k;
  ctx.moveTo(cx + rx, cy);
  ctx.bezierCurveTo(cx + rx, cy - oy, cx + ox, cy - ry, cx, cy - ry);
  ctx.bezierCurveTo(cx - ox, cy - ry, cx - rx, cy - oy, cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy + oy, cx - ox, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx + ox, cy + ry, cx + rx, cy + oy, cx + rx, cy);
}

/**
 * Performs a flood fill from the starting pixel and returns the affected
 * rectangle along with the previous and updated image data snapshots.
 *
 * The implementation is based on a scanline stack-based algorithm so it avoids
 * recursion and keeps allocations minimal. Each pixel is considered the same
 * colour when the sum of per-channel absolute differences is less than or equal
 * to the `tolerance`. Because the tolerance sums channel deltas, values around
 * 40–60 allow filling anti-aliased edges without bleeding into unrelated colours.
 *
 * @example
 * const result = floodFill(ctx, { width: canvas.width, height: canvas.height }, x, y, [255, 0, 0, 255], 32);
 * if (result) {
 *   history.push(result.before); // save snapshot for undo
 * }
 *
 * @param {CanvasRenderingContext2D} ctx - Rendering context that owns the bitmap.
 * @param {{width: number, height: number}} bmp - Dimensions of the bitmap to fill.
 * @param {number} x0 - X-coordinate of the seed pixel.
 * @param {number} y0 - Y-coordinate of the seed pixel.
 * @param {[number, number, number, number]} rgba - Replacement colour in RGBA components.
 * @param {number} [tolerance=0] - Colour distance threshold. Higher values accept
 * neighbouring shades when evaluating the fill region.
 * @returns {FloodFillResult|null} Null when the operation does not change the
 * bitmap (for example, zero tolerance and the seed colour already matches the
 * replacement).
 */
export function floodFill(ctx, bmp, x0, y0, rgba, tolerance = 0) {
  if (x0 < 0 || y0 < 0 || x0 >= bmp.width || y0 >= bmp.height) return null;
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  const d = img.data;
  const w = bmp.width;
  const h = bmp.height;
  const id = (x, y) => (y * w + x) * 4;
  const sr = d[id(x0, y0)];
  const sg = d[id(x0, y0) + 1];
  const sb = d[id(x0, y0) + 2];
  const sa = d[id(x0, y0) + 3];
  const same = (r, g, b, a) =>
    Math.abs(r - sr) +
    Math.abs(g - sg) +
    Math.abs(b - sb) +
    Math.abs(a - sa) <= tolerance;
  const [fr, fg, fb, fa] = rgba;
  if (same(fr, fg, fb, fa) && tolerance === 0) return null;
  const st = [[x0, y0]];
  let minx = x0,
    maxx = x0,
    miny = y0,
    maxy = y0;
  while (st.length) {
    let [x, y] = st.pop();
    while (x >= 0 && same(d[id(x, y)], d[id(x, y) + 1], d[id(x, y) + 2], d[id(x, y) + 3])) x--;
    x++;
    let up = false,
      dn = false;
    while (
      x < w &&
      same(d[id(x, y)], d[id(x, y) + 1], d[id(x, y) + 2], d[id(x, y) + 3])
    ) {
      const i = id(x, y);
      d[i] = fr;
      d[i + 1] = fg;
      d[i + 2] = fb;
      d[i + 3] = fa;
      minx = Math.min(minx, x);
      maxx = Math.max(maxx, x);
      miny = Math.min(miny, y);
      maxy = Math.max(maxy, y);
      if (y > 0) {
        const iu = id(x, y - 1);
        const su = same(d[iu], d[iu + 1], d[iu + 2], d[iu + 3]);
        if (!up && su) {
          st.push([x, y - 1]);
          up = true;
        } else if (up && !su) {
          up = false;
        }
      }
      if (y < h - 1) {
        const idd = id(x, y + 1);
        const sd = same(d[idd], d[idd + 1], d[idd + 2], d[idd + 3]);
        if (!dn && sd) {
          st.push([x, y + 1]);
          dn = true;
        } else if (dn && !sd) {
          dn = false;
        }
      }
      x++;
    }
  }
  const rect = {
    x: minx,
    y: miny,
    w: maxx - minx + 1,
    h: maxy - miny + 1,
  };
  const before = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  ctx.putImageData(img, 0, 0);
  const after = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  return { rect, before, after };
}
