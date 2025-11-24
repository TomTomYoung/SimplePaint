// ツール仕様: 概要=曲線を配置・編集するツール。 入力=クリック/ドラッグによる制御点配置、Enter/Escapeなどのキー操作。 出力=新規曲線や編集済みの曲線データ。 操作=クリックで制御点を配置し、ドラッグでハンドル調整、Enterで確定、Escでキャンセル。
import { catmullRomSpline, computeAABB } from '../../utils/geometry/index.js';
import { createEditableCurveTool } from './editable_curve_base.js';

export function makeEditableCatmull(store) {
  const id = 'catmull-edit';
  return createEditableCurveTool(store, {
    id,
    minPoints: 4,
    computePreviewBounds({ points, hover, editMode, dragIndex }) {
      const includeHover = hover && !editMode && dragIndex < 0;
      const previewPoints = includeHover ? [...points, hover] : [...points];
      if (previewPoints.length >= 4) {
        return computeAABB(catmullRomSpline(previewPoints));
      }
      return computeAABB(previewPoints);
    },
    drawPreview(octx, context, helpers) {
      const { points, hover, dragIndex, state, editMode } = context;
      const includeHover = hover && !editMode && dragIndex < 0;
      const previewPoints = includeHover ? [...points, hover] : [...points];
      helpers.drawControlPolygon(octx, previewPoints);

      if (previewPoints.length >= 2) {
        const curve =
          previewPoints.length >= 4
            ? catmullRomSpline(previewPoints)
            : previewPoints;
        if (curve.length >= 2) {
          octx.save();
          helpers.applyStroke(octx, state);
          octx.beginPath();
          octx.moveTo(curve[0].x + 0.5, curve[0].y + 0.5);
          for (let i = 1; i < curve.length; i++) {
            octx.lineTo(curve[i].x + 0.5, curve[i].y + 0.5);
          }
          octx.stroke();
          octx.restore();
        }
      }

      if ((editMode || dragIndex >= 0) && points.length) {
        helpers.drawHandles(octx, points, dragIndex);
      }
    },
    finalize(ctx, _eng, context, helpers) {
      const { points, state } = context;
      const curve = catmullRomSpline(points);
      if (!curve.length) return null;
      ctx.save();
      helpers.applyStroke(ctx, state);
      ctx.beginPath();
      ctx.moveTo(curve[0].x + 0.5, curve[0].y + 0.5);
      for (let i = 1; i < curve.length; i++) {
        ctx.lineTo(curve[i].x + 0.5, curve[i].y + 0.5);
      }
      ctx.stroke();
      ctx.restore();
      return computeAABB(curve);
    },
  });
}
