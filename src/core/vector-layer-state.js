const toFiniteNumber = (value, fallback = 0) =>
  Number.isFinite(value) ? Number(value) : fallback;

const clonePoint = (point = { x: 0, y: 0 }) => ({
  x: toFiniteNumber(point?.x, 0),
  y: toFiniteNumber(point?.y, 0),
});

const DEFAULT_STYLE = Object.freeze({
  color: '#000000',
  width: 1,
  dashPattern: '',
  capStyle: 'butt',
});

const normaliseColor = (value) => {
  if (typeof value === 'string' && value.trim().length) {
    return value.trim();
  }
  return DEFAULT_STYLE.color;
};

const normaliseWidth = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STYLE.width;
};

const normaliseDashPattern = (value) => {
  if (typeof value !== 'string') {
    return DEFAULT_STYLE.dashPattern;
  }
  return value.trim();
};

const normaliseCapStyle = (value) => {
  if (typeof value !== 'string') return DEFAULT_STYLE.capStyle;
  const lower = value.trim().toLowerCase();
  if (lower === 'round' || lower === 'square' || lower === 'butt') {
    return lower;
  }
  return DEFAULT_STYLE.capStyle;
};

export const normaliseVectorStyle = (style = {}) => ({
  color: normaliseColor(style?.color),
  width: normaliseWidth(style?.width),
  dashPattern: normaliseDashPattern(style?.dashPattern),
  capStyle: normaliseCapStyle(style?.capStyle),
});

const cloneVectorStyle = (style = {}) => normaliseVectorStyle(style);

const normaliseWeights = (weights = [], pointCount = 0) => {
  if (!Array.isArray(weights)) {
    return Array.from({ length: pointCount }, () => 1);
  }
  const result = weights.map((w) => {
    const value = Number(w);
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  if (result.length < pointCount) {
    const missing = pointCount - result.length;
    for (let i = 0; i < missing; i++) {
      result.push(1);
    }
  } else if (result.length > pointCount) {
    result.length = pointCount;
  }
  return result;
};

export const cloneVectorCurve = (curve = { points: [], weights: [] }) => {
  const points = Array.isArray(curve?.points)
    ? curve.points.map((point) => clonePoint(point))
    : [];
  const weights = normaliseWeights(curve?.weights, points.length);
  const style = cloneVectorStyle(curve?.style);
  return { points, weights, style };
};

export const createEmptyVectorLayer = () => ({
  id: 'vector-layer',
  curves: [],
  defaultStyle: cloneVectorStyle(DEFAULT_STYLE),
});

export const cloneVectorLayer = (layer = null) => {
  if (!layer) {
    return createEmptyVectorLayer();
  }
  const id = typeof layer.id === 'string' && layer.id ? layer.id : 'vector-layer';
  const curves = Array.isArray(layer.curves)
    ? layer.curves.map((curve) => cloneVectorCurve(curve))
    : [];
  const defaultStyle = cloneVectorStyle(layer?.defaultStyle);
  return { id, curves, defaultStyle };
};

export const appendCurvesToLayer = (layer, curves) => {
  const base = cloneVectorLayer(layer);
  if (!Array.isArray(curves) || !curves.length) {
    return base;
  }
  const additions = curves
    .map((curve) => {
      const cloned = cloneVectorCurve(curve);
      if (!cloned.style) {
        cloned.style = cloneVectorStyle(base.defaultStyle);
      }
      return cloned;
    })
    .filter((curve) => curve.points.length > 0);
  if (!additions.length) {
    return base;
  }
  return {
    ...base,
    curves: [...base.curves, ...additions],
  };
};

export const replaceLayerCurves = (layer, curves) => {
  const base = cloneVectorLayer(layer);
  const nextCurves = Array.isArray(curves)
    ? curves.map((curve) => {
        const cloned = cloneVectorCurve(curve);
        if (!cloned.style) {
          cloned.style = cloneVectorStyle(base.defaultStyle);
        }
        return cloned;
      })
    : [];
  return {
    ...base,
    curves: nextCurves,
  };
};

export const updateLayerDefaultStyle = (layer, styleUpdates = {}) => {
  const base = cloneVectorLayer(layer);
  const merged = {
    ...base.defaultStyle,
    ...styleUpdates,
  };
  base.defaultStyle = cloneVectorStyle(merged);
  return base;
};

export const applyDefaultStyleToCurves = (layer) => {
  const base = cloneVectorLayer(layer);
  const style = cloneVectorStyle(base.defaultStyle);
  base.curves = base.curves.map((curve) => ({
    ...curve,
    style: style ? { ...style } : style,
  }));
  return base;
};

export const getDefaultVectorStyle = () => cloneVectorStyle(DEFAULT_STYLE);
