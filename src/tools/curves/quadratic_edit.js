import { computeAABB } from '../../utils/geometry/index.js';
import { createEditableCurveTool } from './editable_curve_base.js';

export function makeEditableQuadratic(store) {
  const id = 'quad-edit';
  return createEditableCurveTool(store, {
    id,
    minPoints: 3,
    maxPoints: 3,
    computePreviewBounds({ points, hover, editMode, dragIndex }) {
      const includeHover = hover && !editMode && dragIndex < 0 && points.length < 3;
      const candidates = includeHover ? [...points, hover] : [...points];
      return computeAABB(candidates);
    },
    drawPreview(octx, context, helpers) {
      const { points, hover, dragIndex, state, editMode } = context;
      const includeHover = hover && !editMode && dragIndex < 0 && points.length < 3;
      const previewPoints = includeHover ? [...points, hover] : [...points];
      helpers.drawControlPolygon(octx, previewPoints);

      if (points.length >= 3) {
        const [p0, p1, p2] = points;
        octx.save();
        helpers.applyStroke(octx, state);
        octx.beginPath();
        octx.moveTo(p0.x + 0.5, p0.y + 0.5);
        octx.quadraticCurveTo(
          p1.x + 0.5,
          p1.y + 0.5,
          p2.x + 0.5,
          p2.y + 0.5,
        );
        octx.stroke();
        octx.restore();
      } else if (previewPoints.length >= 2) {
        octx.save();
        helpers.applyStroke(octx, state);
        octx.beginPath();
        octx.moveTo(previewPoints[0].x + 0.5, previewPoints[0].y + 0.5);
        for (let i = 1; i < previewPoints.length; i++) {
          octx.lineTo(previewPoints[i].x + 0.5, previewPoints[i].y + 0.5);
        }
        octx.stroke();
        octx.restore();
      }

      if ((editMode || dragIndex >= 0) && points.length) {
        helpers.drawHandles(octx, points, dragIndex);
      }
    },
    finalize(ctx, _eng, context, helpers) {
      const { points, state } = context;
      const [p0, p1, p2] = points;
      ctx.save();
      helpers.applyStroke(ctx, state);
      ctx.beginPath();
      ctx.moveTo(p0.x + 0.5, p0.y + 0.5);
      ctx.quadraticCurveTo(
        p1.x + 0.5,
        p1.y + 0.5,
        p2.x + 0.5,
        p2.y + 0.5,
      );
      ctx.stroke();
      ctx.restore();
      return computeAABB(points);
    },
  });
}
