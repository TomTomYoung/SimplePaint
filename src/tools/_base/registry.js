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
import { makeVectorKeep } from '../vector/vector-keep.js';
import { makeVectorizationBrush } from '../vector/vectorization_brush.js';
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

// Fill tools
import { makeBucket } from '../fill/bucket.js';
import { makeEyedropper } from '../fill/eyedropper.js';

// Text
import { makeTextTool } from '../text/text-tool.js';

const DRAWING_FACTORIES = [
  makePencil,
  makePencilClick,
  makeBrush,
  makeMinimal,
  makeSmooth,
  makeFreehand,
  makeFreehandClick,
  makeAaLineBrush,
  makePixelBrush,
  makeBlurBrush,
  makeEdgeAwarePaint,
  makeNoiseDisplaced,
  makeGradientBrush,
  makeHatching,
  makePredictiveBrush,
  makePressureVelocityMapBrush,
  makeSnapGridBrush,
  makeStampBlendModesBrush,
  makeStrokeBoilBrush,
  makeSymmetryMirror,
  makeTimeAwareBrush,
  makeEraser,
  makeEraserClick,
];

const SPECIAL_FACTORIES = [
  makeTextureBrush,
  makeTessellatedStroke,
  makeSdfStroke,
  makeWatercolor,
  makePreviewRefine,
  makeCalligraphy,
  makeRibbon,
  makeBristle,
  makeAirbrush,
  makeScatter,
  makeSmudge,
  makeChalkPastel,
  makeCurvatureAdaptiveBrush,
  makeDepthAwareBrush,
  makeDistanceStampedBrush,
  makeDripGravityBrush,
  makeFlowGuidedBrush,
  makeGlyphBrush,
  makeGpuInstancedStampBrush,
  makeGranulationBrush,
  makeHalftoneDitherBrush,
  makeHdrLinearPipelineBrush,
  makeHeightNormalAwareBrush,
  makeMaskDrivenBrush,
  makeMetaBrush,
  makeOnImageWarp,
  makePaletteMappedBrush,
  makePatternArtBrush,
];

const VECTOR_FACTORIES = [
  makeVectorKeep,
  makeVectorizationBrush,
  makePathBooleans,
  makeOutlineStrokeToFill,
];

const CURVE_FACTORIES = [
  makeQuadratic,
  makeCubic,
  makeCatmull,
  makeBSpline,
  makeNURBS,
];

const SHAPE_FACTORIES = [makeArc, makeSector, makeEllipse2];

const FILL_FACTORIES = [makeBucket, makeEyedropper];

const TEXT_FACTORIES = [makeTextTool];

const STORE_FACTORIES = [
  ...DRAWING_FACTORIES,
  ...SPECIAL_FACTORIES,
  ...VECTOR_FACTORIES,
  ...CURVE_FACTORIES,
  ...SHAPE_FACTORIES,
  ...FILL_FACTORIES,
  ...TEXT_FACTORIES,
];

const SHAPE_KINDS = ['line', 'rect', 'ellipse'];

export function registerDefaultTools(engine, store) {
  engine.register(makeSelectRect(store));
  STORE_FACTORIES.forEach((factory) => {
    engine.register(factory(store));
  });
  SHAPE_KINDS.forEach((kind) => engine.register(makeShape(kind, store)));
}
