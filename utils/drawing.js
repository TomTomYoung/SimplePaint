import { bmp } from "../layer.js";
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

export function floodFill(ctx, x0, y0, rgba, th = 0) {
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
    Math.abs(a - sa) <= th;
  const [fr, fg, fb, fa] = rgba;
  if (same(fr, fg, fb, fa) && th === 0) return null;
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
