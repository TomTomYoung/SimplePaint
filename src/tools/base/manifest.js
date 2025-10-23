/**
 * @typedef {import('../../types/tool.js').ToolFactory} ToolFactory
 * @typedef {import('../../types/tool.js').ToolManifest} ToolManifest
 * @typedef {import('../../types/tool.js').ToolManifestEntry} ToolManifestEntry
 * @typedef {import('../../types/tool.js').ToolManifestCategory} ToolManifestCategory
 */

import { makeSelectRect } from '../selection/select-rect.js';

// Drawing tools
import { makePencil } from '../drawing/pencil.js';
import { makePencilClick } from '../drawing/pencil-click.js';
import { makeBrush } from '../drawing/brush.js';
import { makeMinimal } from '../drawing/minimal.js';
import { makeSmooth } from '../drawing/smooth.js';
import { makeFreehand } from '../drawing/freehand.js';
import { makeFreehandClick } from '../drawing/freehand-click.js';
import { makeAaLineBrush } from '../drawing/aa_line_brush.js';
import { makePixelBrush } from '../drawing/pixel_brush.js';
import { makeBlurBrush } from '../drawing/blur_brush.js';
import { makeEdgeAwarePaint } from '../drawing/edge_aware_paint.js';
import { makeNoiseDisplaced } from '../drawing/noise-displaced.js';
import { makeGradientBrush } from '../drawing/gradient_brush.js';
import { makeHatching } from '../drawing/hatching.js';
import { makePredictiveBrush } from '../drawing/predictive_brush.js';
import { makePressureVelocityMapBrush } from '../drawing/pressure_velocity_map_brush.js';
import { makeSnapGridBrush } from '../drawing/snap_grid_brush.js';
import { makeStampBlendModesBrush } from '../drawing/stamp_blend_modes_brush.js';
import { makeStrokeBoilBrush } from '../drawing/stroke_boil_brush.js';
import { makeSymmetryMirror } from '../drawing/symmetry_mirror.js';
import { makeTimeAwareBrush } from '../drawing/time_aware_brush.js';
import { makeEraser } from '../drawing/eraser.js';
import { makeEraserClick } from '../drawing/eraser-click.js';

// Specialised brushes
import { makeTextureBrush } from '../special/texture-brush.js';
import { makeTessellatedStroke } from '../special/tessellated-stroke.js';
import { makeSdfStroke } from '../special/sdf-stroke.js';
import { makeWatercolor } from '../special/watercolor.js';
import { makePreviewRefine } from '../special/preview-refine.js';
import { makeCalligraphy } from '../special/calligraphy.js';
import { makeRibbon } from '../special/ribbon.js';
import { makeBristle } from '../special/bristle.js';
import { makeAirbrush } from '../special/airbrush.js';
import { makeScatter } from '../special/scatter.js';
import { makeSmudge } from '../special/smudge.js';
import { makeChalkPastel } from '../special/chalk_pastel.js';
import { makeCurvatureAdaptiveBrush } from '../special/curvature_adaptive_brush.js';
import { makeDepthAwareBrush } from '../special/depth_aware_brush.js';
import { makeDistanceStampedBrush } from '../special/distance_stamped_brush.js';
import { makeDripGravityBrush } from '../special/drip_gravity_brush.js';
import { makeFlowGuidedBrush } from '../special/flow_guided_brush.js';
import { makeGlyphBrush } from '../special/glyph_brush.js';
import { makeGpuInstancedStampBrush } from '../special/gpu_instanced_stamps.js';
import { makeGranulationBrush } from '../special/granulation_brush.js';
import { makeHalftoneDitherBrush } from '../special/halftone_dither_brush.js';
import { makeHdrLinearPipelineBrush } from '../special/hdr_linear_pipeline_brush.js';
import { makeHeightNormalAwareBrush } from '../special/height_normal_aware_brush.js';
import { makeMaskDrivenBrush } from '../special/mask_driven_brush.js';
import { makeMetaBrush } from '../special/meta_brush.js';
import { makeOnImageWarp } from '../special/on_image_warp.js';
import { makePaletteMappedBrush } from '../special/palette_mapped_brush.js';
import { makePatternArtBrush } from '../special/pattern_art_brush.js';

// Vector utilities
import { makeVectorTool } from '../vector/vector-tool.js';
import { makeVectorKeep } from '../vector/vector-keep.js';
import { makeVectorizationBrush } from '../vector/vectorization_brush.js';
import { makeVectorEditBrush } from '../vector/vector_edit_brush.js';
import { makePathBooleans } from '../vector/path_booleans_v2.js';
import { makeOutlineStrokeToFill } from '../vector/outline_stroke_to_fill.js';

// Geometric primitives
import { makeShape } from '../shapes/shape.js';
import { makeArc } from '../shapes/arc.js';
import { makeSector } from '../shapes/sector.js';
import { makeEllipse2 } from '../shapes/ellipse-2.js';

// Curves
import { makeQuadratic } from '../curves/quadratic.js';
import { makeCubic } from '../curves/cubic.js';
import { makeCatmull } from '../curves/catmull.js';
import { makeBSpline } from '../curves/bspline.js';
import { makeNURBS } from '../curves/nurbs.js';
import { makeEditableQuadratic } from '../curves/quadratic_edit.js';
import { makeEditableCubic } from '../curves/cubic_edit.js';
import { makeEditableCatmull } from '../curves/catmull_edit.js';
import { makeEditableBSpline } from '../curves/bspline_edit.js';
import { makeEditableNURBS } from '../curves/nurbs_edit.js';

// Fill tools
import { makeBucket } from '../fill/bucket.js';
import { makeEyedropper } from '../fill/eyedropper.js';

// Text
import { makeTextTool } from '../text/text-tool.js';

/**
 * @param {string} id
 * @param {ToolFactory} factory
 * @returns {ToolManifestEntry}
 */
function createToolEntry(id, factory) {
  return Object.freeze({ id, factory });
}

/**
 * @param {string} id
 * @param {string} label
 * @param {readonly ToolManifestEntry[]} tools
 * @returns {ToolManifestCategory}
 */
function createCategory(id, label, tools) {
  return Object.freeze({
    id,
    label,
    tools: Object.freeze(
      tools.map((tool) =>
        Object.freeze({
          ...tool,
          categoryId: id,
        }),
      ),
    ),
  });
}

/** @type {ToolManifest} */
export const DEFAULT_TOOL_MANIFEST = Object.freeze([
  createCategory('selection', 'Selection tools', [
    createToolEntry('select-rect', () => makeSelectRect()),
  ]),
  createCategory('drawing', 'Drawing tools', [
    createToolEntry('pencil', makePencil),
    createToolEntry('pencil-click', makePencilClick),
    createToolEntry('brush', makeBrush),
    createToolEntry('minimal', makeMinimal),
    createToolEntry('smooth', makeSmooth),
    createToolEntry('freehand', makeFreehand),
    createToolEntry('freehand-click', makeFreehandClick),
    createToolEntry('aa-line-brush', makeAaLineBrush),
    createToolEntry('pixel-brush', makePixelBrush),
    createToolEntry('blur-brush', makeBlurBrush),
    createToolEntry('edge-aware-paint', makeEdgeAwarePaint),
    createToolEntry('noise-displaced', makeNoiseDisplaced),
    createToolEntry('gradient-brush', makeGradientBrush),
    createToolEntry('hatching', makeHatching),
    createToolEntry('predictive-brush', makePredictiveBrush),
    createToolEntry('pvel-map', makePressureVelocityMapBrush),
    createToolEntry('snap-grid', makeSnapGridBrush),
    createToolEntry('stamp-blend', makeStampBlendModesBrush),
    createToolEntry('stroke-boil', makeStrokeBoilBrush),
    createToolEntry('symmetry-mirror', makeSymmetryMirror),
    createToolEntry('time-aware', makeTimeAwareBrush),
    createToolEntry('eraser', makeEraser),
    createToolEntry('eraser-click', makeEraserClick),
  ]),
  createCategory('special', 'Special brushes', [
    createToolEntry('texture-brush', makeTextureBrush),
    createToolEntry('tess-stroke', makeTessellatedStroke),
    createToolEntry('sdf-stroke', makeSdfStroke),
    createToolEntry('watercolor', makeWatercolor),
    createToolEntry('preview-refine', makePreviewRefine),
    createToolEntry('calligraphy', makeCalligraphy),
    createToolEntry('ribbon', makeRibbon),
    createToolEntry('bristle', makeBristle),
    createToolEntry('airbrush', makeAirbrush),
    createToolEntry('scatter', makeScatter),
    createToolEntry('smudge', makeSmudge),
    createToolEntry('chalk-pastel', makeChalkPastel),
    createToolEntry('curvature-adaptive', makeCurvatureAdaptiveBrush),
    createToolEntry('depth-aware', makeDepthAwareBrush),
    createToolEntry('distance-stamped', makeDistanceStampedBrush),
    createToolEntry('drip-gravity', makeDripGravityBrush),
    createToolEntry('flow-guided-brush', makeFlowGuidedBrush),
    createToolEntry('glyph-brush', makeGlyphBrush),
    createToolEntry('gpu-instanced-brush', makeGpuInstancedStampBrush),
    createToolEntry('granulation', makeGranulationBrush),
    createToolEntry('halftone-dither', makeHalftoneDitherBrush),
    createToolEntry('hdr-linear', makeHdrLinearPipelineBrush),
    createToolEntry('height-normal', makeHeightNormalAwareBrush),
    createToolEntry('mask-driven', makeMaskDrivenBrush),
    createToolEntry('meta-brush', makeMetaBrush),
    createToolEntry('on-image-warp', makeOnImageWarp),
    createToolEntry('palette-mapped', makePaletteMappedBrush),
    createToolEntry('pattern-art-brush', makePatternArtBrush),
  ]),
  createCategory('vector', 'Vector tools', [
    createToolEntry('vector-tool', makeVectorTool),
    createToolEntry('vector-keep', makeVectorKeep),
    createToolEntry('vectorization', makeVectorizationBrush),
    createToolEntry('vector-edit', makeVectorEditBrush),
    createToolEntry('path-bool', makePathBooleans),
    createToolEntry('outline-stroke-fill', makeOutlineStrokeToFill),
  ]),
  createCategory('curves', 'Curve tools', [
    createToolEntry('quad', makeQuadratic),
    createToolEntry('cubic', makeCubic),
    createToolEntry('catmull', makeCatmull),
    createToolEntry('bspline', makeBSpline),
    createToolEntry('nurbs', makeNURBS),
    createToolEntry('quad-edit', makeEditableQuadratic),
    createToolEntry('cubic-edit', makeEditableCubic),
    createToolEntry('catmull-edit', makeEditableCatmull),
    createToolEntry('bspline-edit', makeEditableBSpline),
    createToolEntry('nurbs-edit', makeEditableNURBS),
  ]),
  createCategory('shapes', 'Shape tools', [
    createToolEntry('arc', makeArc),
    createToolEntry('sector', makeSector),
    createToolEntry('ellipse-2', makeEllipse2),
    createToolEntry('line', (store) => makeShape('line', store)),
    createToolEntry('rect', (store) => makeShape('rect', store)),
    createToolEntry('ellipse', (store) => makeShape('ellipse', store)),
  ]),
  createCategory('fill', 'Fill tools', [
    createToolEntry('bucket', makeBucket),
    createToolEntry('eyedropper', makeEyedropper),
  ]),
  createCategory('text', 'Text tools', [
    createToolEntry('text', makeTextTool),
  ]),
]);

/**
 * @param {ToolManifest} [manifest=DEFAULT_TOOL_MANIFEST]
 * @returns {readonly ToolManifestEntry[]}
 */
export function flattenToolManifest(manifest = DEFAULT_TOOL_MANIFEST) {
  return manifest.flatMap((category) => category.tools);
}

/**
 * @param {ToolManifest} [manifest=DEFAULT_TOOL_MANIFEST]
 * @returns {readonly string[]}
 */
export function collectToolIds(manifest = DEFAULT_TOOL_MANIFEST) {
  return flattenToolManifest(manifest).map((tool) => tool.id);
}

export const DEFAULT_TOOL_IDS = Object.freeze(collectToolIds());

/**
 * @param {ToolManifest} [manifest=DEFAULT_TOOL_MANIFEST]
 * @returns {Map<string, ToolManifestEntry>}
 */
export function createToolIndex(manifest = DEFAULT_TOOL_MANIFEST) {
  const index = new Map();
  manifest.forEach((category) => {
    category.tools.forEach((entry) => {
      if (index.has(entry.id)) {
        throw new Error(`Duplicate tool id detected in manifest: ${entry.id}`);
      }
      index.set(entry.id, entry);
    });
  });
  return index;
}

/**
 * @param {string} id
 * @param {ToolManifest} [manifest=DEFAULT_TOOL_MANIFEST]
 * @returns {ToolManifestEntry|null}
 */
export function getToolEntryById(id, manifest = DEFAULT_TOOL_MANIFEST) {
  if (!id) {
    return null;
  }
  return createToolIndex(manifest).get(id) ?? null;
}

/**
 * @param {string} id
 * @param {ToolManifest} [manifest=DEFAULT_TOOL_MANIFEST]
 * @returns {ToolManifestCategory|null}
 */
export function getToolCategoryForId(id, manifest = DEFAULT_TOOL_MANIFEST) {
  if (!id) {
    return null;
  }
  for (const category of manifest) {
    if (category.tools.some((entry) => entry.id === id)) {
      return category;
    }
  }
  return null;
}
