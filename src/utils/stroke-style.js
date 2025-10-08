const VALID_CAPS = ['butt', 'round', 'square'];

export function resolveLineCap(value) {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (VALID_CAPS.includes(lower)) {
      return lower;
    }
  }
  return 'butt';
}

export function parseDashPattern(value) {
  if (Array.isArray(value)) {
    return value.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
  }
  if (value === null || value === undefined) return [];
  const tokens = String(value)
    .split(/[\s,]+/)
    .map((token) => Number(token.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return tokens;
}

export function applyStrokeStyle(ctx, state = {}) {
  if (!ctx) return;
  ctx.lineCap = resolveLineCap(state.capStyle);
  if (typeof ctx.setLineDash === 'function') {
    const dash = parseDashPattern(state.dashPattern);
    ctx.setLineDash(dash);
  }
}
