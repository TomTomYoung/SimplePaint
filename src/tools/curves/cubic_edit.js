// ツール仕様: 概要=曲線を配置・編集するツール。 入力=クリック/ドラッグによる制御点配置、Enter/Escapeなどのキー操作。 出力=新規曲線や編集済みの曲線データ。 操作=クリックで制御点を配置し、ドラッグでハンドル調整、Enterで確定、Escでキャンセル。
import { computeAABB } from '../../utils/geometry/index.js';
import { createEditableCurveTool } from './editable_curve_base.js';

export function makeEditableCubic(store) {
  const id = 'cubic-edit';
  return createEditableCurveTool(store, {
    id,
    minPoints: 4,
    maxPoints: 4,
    computePreviewBounds({ points, hover, editMode, dragIndex }) {
      const includeHover = hover && !editMode && dragIndex < 0 && points.length < 4;
      const candidates = includeHover ? [...points, hover] : [...points];
      return computeAABB(candidates);
    },
    drawPreview(octx, context, helpers) {
      const { points, hover, dragIndex, state, editMode } = context;
      const includeHover = hover && !editMode && dragIndex < 0 && points.length < 4;
      const previewPoints = includeHover ? [...points, hover] : [...points];
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

      if ((editMode || dragIndex >= 0) && points.length) {
        helpers.drawHandles(octx, points, dragIndex);
      }
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
