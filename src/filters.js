export function applyFilterToCanvas(srcCanvas, p) {
  const w = srcCanvas.width,
    h = srcCanvas.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const sctx = srcCanvas.getContext('2d');
  const dctx = out.getContext('2d');
  const img = sctx.getImageData(0, 0, w, h);
  const d = img.data;

  const b = p.brightness / 100; // add in [ -1 .. 1 ]
  const c = 1 + p.contrast / 100; // 0 → 1.0（無変化）
  const sat = 1 + p.saturation / 100; // multiply
  const hue = ((p.hue || 0) * Math.PI) / 180; // radians
  const inv = p.invert ? 1 : 0;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255,
      g = d[i + 1] / 255,
      bch = d[i + 2] / 255,
      a = d[i + 3] / 255;

    // brightness (add)
    r = r + b;
    g = g + b;
    bch = bch + b;

    // contrast around 0.5 -> remap to [-1..1] domain centered at 0
    r = 0.5 + c * (r - 0.5);
    g = 0.5 + c * (g - 0.5);
    bch = 0.5 + c * (bch - 0.5);

    // to HSV for hue/sat
    let {
      h: sH,
      s: sS,
      v: sV,
    } = rgb2hsv(clamp01(r), clamp01(g), clamp01(bch));
    sH = (sH + hue / (2 * Math.PI)) % 1;
    if (sH < 0) sH += 1;
    sS = clamp01(sS * sat);
    ({ r, g, b: bch } = hsv2rgb(sH, sS, sV));

    // invert
    if (inv) {
      r = 1 - r;
      g = 1 - g;
      bch = 1 - bch;
    }

    d[i] = Math.round(clamp01(r) * 255);
    d[i + 1] = Math.round(clamp01(g) * 255);
    d[i + 2] = Math.round(clamp01(bch) * 255);
    d[i + 3] = Math.round(clamp01(a) * 255);
  }
  dctx.putImageData(img, 0, 0);
  return out;
}

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function rgb2hsv(r, g, b) {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

export function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6),
    f = h * 6 - i,
    p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p };
    case 1:
      return { r: q, g: v, b: p };
    case 2:
      return { r: p, g: v, b: t };
    case 3:
      return { r: p, g: q, b: v };
    case 4:
      return { r: t, g: p, b: v };
    case 5:
      return { r: v, g: p, b: q };
  }
}
