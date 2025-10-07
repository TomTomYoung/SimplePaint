import { makeSelectRect } from './select-rect.js';
import { makePencil } from './pencil.js';
import { makePencilClick } from './pencil-click.js';
import { makeBrush } from './brush.js';
import { makeMinimal } from './minimal.js';
import { makeSmooth } from './smooth.js';
import { makeTextureBrush } from './texture-brush.js';
import { makeTessellatedStroke } from './tessellated-stroke.js';
import { makeSdfStroke } from './sdf-stroke.js';
import { makeWatercolor } from './watercolor.js';
import { makePreviewRefine } from './preview-refine.js';
import { makeVectorKeep } from './vector-keep.js';
import { makeCalligraphy } from './calligraphy.js';
import { makeRibbon } from './ribbon.js';
import { makeBristle } from './bristle.js';
import { makeAirbrush } from './airbrush.js';
import { makeScatter } from './scatter.js';
import { makeSmudge } from './smudge.js';
import { makeAaLineBrush } from './aa_line_brush.js';
import { makePixelBrush } from './pixel_brush.js';
import { makeBlurBrush } from './blur_brush.js';
import { makeEdgeAwarePaint } from './edge_aware_paint.js';
import { makeNoiseDisplaced } from './noise-displaced.js';
import { makeChalkPastel } from './chalk_pastel.js';
import { makeCurvatureAdaptiveBrush } from './curvature_adaptive_brush.js';
import { makeDepthAwareBrush } from './depth_aware_brush.js';
import { makeDistanceStampedBrush } from './distance_stamped_brush.js';
import { makeDripGravityBrush } from './drip_gravity_brush.js';
import { makeFlowGuidedBrush } from './flow_guided_brush.js';
import { makeGlyphBrush } from './glyph_brush.js';
import { makeGpuInstancedStampBrush } from './gpu_instanced_stamps.js';
import { makeGradientBrush } from './gradient_brush.js';
import { makeGranulationBrush } from './granulation_brush.js';
import { makeHalftoneDitherBrush } from './halftone_dither_brush.js';
import { makeHatching } from './hatching.js';
import { makeHdrLinearPipelineBrush } from './hdr_linear_pipeline_brush.js';
import { makeHeightNormalAwareBrush } from './height_normal_aware_brush.js';
import { makeMaskDrivenBrush } from './mask_driven_brush.js';
import { makeMetaBrush } from './meta_brush.js';
import { makeOnImageWarp } from './on_image_warp.js';
import { makeOutlineStrokeToFill } from './outline_stroke_to_fill.js';
import { makePaletteMappedBrush } from './palette_mapped_brush.js';
import { makePatternArtBrush } from './pattern_art_brush.js';
import { makePredictiveBrush } from './predictive_brush.js';
import { makePressureVelocityMapBrush } from './pressure_velocity_map_brush.js';
import { makeSnapGridBrush } from './snap_grid_brush.js';
import { makeStampBlendModesBrush } from './stamp_blend_modes_brush.js';
import { makeStrokeBoilBrush } from './stroke_boil_brush.js';
import { makeSymmetryMirror } from './symmetry_mirror.js';
import { makeTimeAwareBrush } from './time_aware_brush.js';
import { makeVectorizationBrush } from './vectorization_brush.js';
import { makeEraser } from './eraser.js';
import { makeEraserClick } from './eraser-click.js';
import { makeBucket } from './bucket.js';
import { makeEyedropper } from './eyedropper.js';
import { makeShape } from './shape.js';
import { makeQuadratic } from './quadratic.js';
import { makeCubic } from './cubic.js';
import { makeArc } from './arc.js';
import { makeSector } from './sector.js';
import { makeCatmull } from './catmull.js';
import { makeBSpline } from './bspline.js';
import { makeNURBS } from './nurbs.js';
import { makeEllipse2 } from './ellipse-2.js';
import { makeFreehand } from './freehand.js';
import { makeFreehandClick } from './freehand-click.js';
import { makeTextTool } from './text-tool.js';

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
