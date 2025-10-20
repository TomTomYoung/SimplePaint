const toFiniteNumber = (value, fallback = 0) =>
  Number.isFinite(value) ? Number(value) : fallback;

const clonePoint = (point = { x: 0, y: 0 }) => ({
  x: toFiniteNumber(point?.x, 0),
  y: toFiniteNumber(point?.y, 0),
});

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
  return { points, weights };
};

export const createEmptyVectorLayer = () => ({
  id: 'vector-layer',
  curves: [],
});

export const cloneVectorLayer = (layer = null) => {
  if (!layer) {
    return createEmptyVectorLayer();
  }
  const id = typeof layer.id === 'string' && layer.id ? layer.id : 'vector-layer';
  const curves = Array.isArray(layer.curves)
    ? layer.curves.map((curve) => cloneVectorCurve(curve))
    : [];
  return { id, curves };
};

export const appendCurvesToLayer = (layer, curves) => {
  const base = cloneVectorLayer(layer);
  if (!Array.isArray(curves) || !curves.length) {
    return base;
  }
  const additions = curves
    .map((curve) => cloneVectorCurve(curve))
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
    ? curves.map((curve) => cloneVectorCurve(curve))
    : [];
  return {
    ...base,
    curves: nextCurves,
  };
};
