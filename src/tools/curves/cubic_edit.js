import { computeAABB } from '../../utils/geometry/index.js';
import { createEditableCurveTool } from './editable_curve_base.js';

export function makeEditableCubic(store) {
  const id = 'cubic-edit';
  return createEditableCurveTool(store, {
    id,
    minPoints: 4,
    maxPoints: 4,
    computePreviewBounds({ points, hover }) {
      const candidates = [...points];
      if (hover && points.length < 4) candidates.push(hover);
      return computeAABB(candidates);
    },
    drawPreview(octx, context, helpers) {
      const { points, hover, dragIndex, state } = context;
      const previewPoints = [...points];
      if (hover && points.length < 4) {
        previewPoints.push(hover);
      }
      helpers.drawControlPolygon(octx, previewPoints);

      if (points.length >= 4) {
        const [p0, p1, p2, p3] = points;
        octx.save();
        helpers.applyStroke(octx, state);
        octx.beginPath();
        octx.moveTo(p0.x + 0.5, p0.y + 0.5);
        octx.bezierCurveTo(
          p1.x + 0.5,
          p1.y + 0.5,
          p2.x + 0.5,
          p2.y + 0.5,
          p3.x + 0.5,
          p3.y + 0.5,
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

      helpers.drawHandles(octx, points, dragIndex);
    },
    finalize(ctx, _eng, context, helpers) {
      const { points, state } = context;
      const [p0, p1, p2, p3] = points;
      ctx.save();
      helpers.applyStroke(ctx, state);
      ctx.beginPath();
      ctx.moveTo(p0.x + 0.5, p0.y + 0.5);
      ctx.bezierCurveTo(
        p1.x + 0.5,
        p1.y + 0.5,
        p2.x + 0.5,
        p2.y + 0.5,
        p3.x + 0.5,
        p3.y + 0.5,
      );
      ctx.stroke();
      ctx.restore();
      return computeAABB(points);
    },
  });
}
