import { makeSelectRect } from './selection/select-rect.js';
import { makePencil } from './drawing/pencil.js';
import { makePencilClick } from './drawing/pencil-click.js';
import { makeBrush } from './drawing/brush.js';
import { makeMinimal } from './drawing/minimal.js';
import { makeSmooth } from './drawing/smooth.js';
import { makeTextureBrush } from './drawing/texture-brush.js';
import { makeTessellatedStroke } from './drawing/tessellated-stroke.js';
import { makeSdfStroke } from './drawing/sdf-stroke.js';
import { makeWatercolor } from './drawing/watercolor.js';
import { makePreviewRefine } from './special/preview-refine.js';
import { makeVectorKeep } from './vector/vector-keep.js';
import { makeCalligraphy } from './drawing/calligraphy.js';
import { makeRibbon } from './drawing/ribbon.js';
import { makeBristle } from './drawing/bristle.js';
import { makeAirbrush } from './drawing/airbrush.js';
import { makeScatter } from './drawing/scatter.js';
import { makeSmudge } from './special/smudge.js';
import { makeAaLineBrush } from './drawing/aa_line_brush.js';
import { makePixelBrush } from './drawing/pixel_brush.js';
import { makeBlurBrush } from './drawing/blur_brush.js';
import { makeEdgeAwarePaint } from './drawing/edge_aware_paint.js';
import { makeNoiseDisplaced } from './drawing/noise-displaced.js';
import { makeChalkPastel } from './drawing/chalk_pastel.js';
import { makeCurvatureAdaptiveBrush } from './drawing/curvature_adaptive_brush.js';
import { makeDepthAwareBrush } from './drawing/depth_aware_brush.js';
import { makeDistanceStampedBrush } from './drawing/distance_stamped_brush.js';
import { makeDripGravityBrush } from './drawing/drip_gravity_brush.js';
import { makeFlowGuidedBrush } from './drawing/flow_guided_brush.js';
import { makeGlyphBrush } from './drawing/glyph_brush.js';
import { makeGpuInstancedStampBrush } from './drawing/gpu_instanced_stamps.js';
import { makeGradientBrush } from './drawing/gradient_brush.js';
import { makeGranulationBrush } from './drawing/granulation_brush.js';
import { makeHalftoneDitherBrush } from './drawing/halftone_dither_brush.js';
import { makeHatching } from './drawing/hatching.js';
import { makeHdrLinearPipelineBrush } from './drawing/hdr_linear_pipeline_brush.js';
import { makeHeightNormalAwareBrush } from './drawing/height_normal_aware_brush.js';
import { makeMaskDrivenBrush } from './drawing/mask_driven_brush.js';
import { makeMetaBrush } from './drawing/meta_brush.js';
import { makeOnImageWarp } from './drawing/on_image_warp.js';
import { makeOutlineStrokeToFill } from './vector/outline_stroke_to_fill.js';
import { makePaletteMappedBrush } from './drawing/palette_mapped_brush.js';
import { makePatternArtBrush } from './drawing/pattern_art_brush.js';
import { makePredictiveBrush } from './drawing/predictive_brush.js';
import { makePressureVelocityMapBrush } from './drawing/pressure_velocity_map_brush.js';
import { makeSnapGridBrush } from './drawing/snap_grid_brush.js';
import { makeStampBlendModesBrush } from './drawing/stamp_blend_modes_brush.js';
import { makeStrokeBoilBrush } from './drawing/stroke_boil_brush.js';
import { makeSymmetryMirror } from './drawing/symmetry_mirror.js';
import { makeTimeAwareBrush } from './drawing/time_aware_brush.js';
import { makeVectorizationBrush } from './vector/vectorization_brush.js';
import { makeEraser } from './drawing/eraser.js';
import { makeEraserClick } from './drawing/eraser-click.js';
import { makeBucket } from './fill/bucket.js';
import { makeEyedropper } from './fill/eyedropper.js';
import { makeShape } from './shapes/shape.js';
import { makeQuadratic } from './curves/quadratic.js';
import { makeCubic } from './curves/cubic.js';
import { makeArc } from './shapes/arc.js';
import { makeSector } from './shapes/sector.js';
import { makeCatmull } from './curves/catmull.js';
import { makeBSpline } from './curves/bspline.js';
import { makeNURBS } from './curves/nurbs.js';
import { makeEllipse2 } from './shapes/ellipse-2.js';
import { makeFreehand } from './drawing/freehand.js';
import { makeFreehandClick } from './drawing/freehand-click.js';
import { makeTextTool } from './text/text-tool.js';

const STORE_FACTORIES = [
  makePencil,
  makePencilClick,
  makeBrush,
  makeMinimal,
  makeSmooth,
  makeTextureBrush,
  makeTessellatedStroke,
  makeSdfStroke,
  makeWatercolor,
  makePreviewRefine,
  makeVectorKeep,
  makeCalligraphy,
  makeRibbon,
  makeBristle,
  makeAirbrush,
  makeScatter,
  makeSmudge,
  makeAaLineBrush,
  makePixelBrush,
  makeBlurBrush,
  makeEdgeAwarePaint,
  makeNoiseDisplaced,
  makeChalkPastel,
  makeCurvatureAdaptiveBrush,
  makeDepthAwareBrush,
  makeDistanceStampedBrush,
  makeDripGravityBrush,
  makeFlowGuidedBrush,
  makeGlyphBrush,
  makeGpuInstancedStampBrush,
  makeGradientBrush,
  makeGranulationBrush,
  makeHalftoneDitherBrush,
  makeHatching,
  makeHdrLinearPipelineBrush,
  makeHeightNormalAwareBrush,
  makeMaskDrivenBrush,
  makeMetaBrush,
  makeOnImageWarp,
  makeOutlineStrokeToFill,
  makePaletteMappedBrush,
  makePatternArtBrush,
  makePredictiveBrush,
  makePressureVelocityMapBrush,
  makeSnapGridBrush,
  makeStampBlendModesBrush,
  makeStrokeBoilBrush,
  makeSymmetryMirror,
  makeTimeAwareBrush,
  makeVectorizationBrush,
  makeEraser,
  makeEraserClick,
  makeBucket,
  makeEyedropper,
  makeQuadratic,
  makeCubic,
  makeArc,
  makeSector,
  makeCatmull,
  makeBSpline,
  makeNURBS,
  makeEllipse2,
  makeFreehand,
  makeFreehandClick,
  makeTextTool,
];

const SHAPE_KINDS = ['line', 'rect', 'ellipse'];

export function registerDefaultTools(engine, store) {
  engine.register(makeSelectRect(store));
  STORE_FACTORIES.forEach((factory) => {
    engine.register(factory(store));
  });
  SHAPE_KINDS.forEach((kind) => engine.register(makeShape(kind, store)));
}
