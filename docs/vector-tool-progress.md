# Vector Tool Implementation Progress

## Completed
- Implemented `makeVectorTool` that owns vector paths, draft strokes, selection, and exposes pointer handlers for draw interactions without relying on a separate layer abstraction.\
  _(See `src/tools/vector/vector-tool.js` for full implementation.)_
- Added coordinate processing helpers providing snapping to existing anchors or grid and optional Douglas–Peucker simplification before committing paths.\
- Implemented preview rendering, anchor visualization, and rasterisation helper to bake paths into the raster layer when requested or in auto mode.
- Persisted vector paths and configuration through the shared tool store slice so sessions rehydrate previous drawings and maintain settings.
- Registered the vector tool in the tool manifest so it appears in the application UI.
- Added unit tests covering rehydration logic and configuration persistence when new paths are committed.
- Added anchor hit-testing and drag editing so existing points can be repositioned without creating new paths, including store persistence coverage.
- Enabled modifier-driven editing gestures: Shift/double-click inserts new anchors on existing segments, and Alt-click removes anchors or deletes paths when they become empty, with corresponding persistence tests.
- Added direct path translation by dragging segments so entire shapes can be repositioned while maintaining snapping behaviour, plus unit coverage.

## In Progress / TODO
- Editing tooling still lacks dedicated segment subdivision UI affordances, multi-point selection, and stroke style adjustments beyond anchor repositioning.
- UI wiring for toggling snapping modes, simplification tolerance, rasterise mode, and anchor visibility remains to be built.
- Undo/redo integration for vector edits beyond rasterisation snapshots still needs validation.
- SVG export currently emits simple `M/L` path commands; support for curves and shape primitives is pending.

## Next Steps
1. Design and implement anchor editing interactions within the tool-owned model.
2. Expose the vector tool configuration options through the UI and ensure they update the store slice.
3. Extend export and rasterisation routines to cover bezier curves, rectangles, ellipses, and polygons once their editing flows land.
4. Add integration tests exercising tool lifecycle with the main application engine.
