/**
 * Canvas stroke-style helpers shared by the drawing tools.
 *
 * Each function accepts raw user preferences (such as those coming from form
 * inputs) and normalises them into values that the 2D canvas API accepts.
 * Invalid inputs never throw; they fall back to sensible defaults so the UI can
 * remain responsive even when a user enters unexpected data.
 */

const VALID_CAPS = ['butt', 'round', 'square'];

/**
 * Normalises a user-provided `lineCap` value to one of the Canvas API options.
 *
 * @param {string} value - Arbitrary user input describing the cap style.
 * @returns {'butt'|'round'|'square'} A valid cap, defaulting to `'butt'` when the
 * input is missing or unknown.
 */
export function resolveLineCap(value) {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (VALID_CAPS.includes(lower)) {
      return lower;
    }
  }
  return 'butt';
}

/**
 * Parses dash pattern input into the numeric array expected by `setLineDash`.
 *
 * Whitespace- or comma-separated strings are supported alongside arrays. Any
 * zero, negative, `NaN`, or infinite values are discarded so the resulting
 * pattern always complies with the Canvas API requirements.
 *
 * @param {string|number[]|null|undefined} value - Pattern description provided by the user.
 * @returns {number[]} Sanitised dash segment lengths. Returns an empty array when
 * no usable pattern is supplied, which clears existing dash settings.
 */
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

/**
 * Applies stroke style preferences to a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx - Context that will receive the style updates.
 * @param {{capStyle?: string, dashPattern?: string|number[]}} [state={}] - User
 *   preferences to apply. Unsupported properties are ignored silently.
 */
export function applyStrokeStyle(ctx, state = {}) {
  if (!ctx) return;
  ctx.lineCap = resolveLineCap(state.capStyle);
  if (typeof ctx.setLineDash === 'function') {
    const dash = parseDashPattern(state.dashPattern);
    ctx.setLineDash(dash);
  }
}
