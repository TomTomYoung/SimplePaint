import { nurbs, computeAABB } from '../../utils/geometry/index.js';
import { createEditableCurveTool } from './editable_curve_base.js';

const getWeightFromState = (state) => {
  const value = parseFloat(state?.nurbsWeight);
  return Number.isFinite(value) && value > 0 ? value : 1;
};

const filterFinitePoints = (points) =>
  points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

export function makeEditableNURBS(store) {
  const id = 'nurbs-edit';
  return createEditableCurveTool(store, {
    id,
    minPoints: 4,
    getNewPointWeight: getWeightFromState,
    computePreviewBounds({ points, hover, weights }) {
      const previewPoints = hover ? [...points, hover] : [...points];
      const previewWeights = hover ? [...weights, 1] : [...weights];
      if (previewPoints.length >= 4) {
        return computeAABB(filterFinitePoints(nurbs(previewPoints, previewWeights)));
      }
      return computeAABB(previewPoints);
    },
    drawPreview(octx, context, helpers) {
      const { points, hover, dragIndex, state, weights } = context;
      const previewPoints = hover ? [...points, hover] : [...points];
      const previewWeights = hover ? [...weights, 1] : [...weights];
      helpers.drawControlPolygon(octx, previewPoints);

      if (previewPoints.length >= 2) {
        const curve =
          previewPoints.length >= 4
            ? filterFinitePoints(nurbs(previewPoints, previewWeights))
            : previewPoints;
        if (curve.length >= 2) {
          octx.save();
          helpers.applyStroke(octx, state);
          octx.beginPath();
          octx.moveTo(curve[0].x + 0.5, curve[0].y + 0.5);
          for (let i = 1; i < curve.length; i++) {
            const p = curve[i];
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            octx.lineTo(p.x + 0.5, p.y + 0.5);
          }
          octx.stroke();
          octx.restore();
        }
      }

      helpers.drawHandles(octx, points, dragIndex);
    },
    finalize(ctx, _eng, context, helpers) {
      const { points, state, weights } = context;
      const curve = filterFinitePoints(nurbs(points, weights));
      if (!curve.length) return null;
      ctx.save();
      helpers.applyStroke(ctx, state);
      ctx.beginPath();
      ctx.moveTo(curve[0].x + 0.5, curve[0].y + 0.5);
      for (let i = 1; i < curve.length; i++) {
        const p = curve[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        ctx.lineTo(p.x + 0.5, p.y + 0.5);
      }
      ctx.stroke();
      ctx.restore();
      return computeAABB(curve);
    },
  });
}
