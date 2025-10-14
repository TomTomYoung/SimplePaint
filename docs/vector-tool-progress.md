# Vector Tool Implementation Progress

## Completed
- Implemented `makeVectorTool` that owns vector paths, draft strokes, selection, and exposes pointer handlers for draw interactions without relying on a separate layer abstraction.\
  _(See `src/tools/vector/vector-tool.js` for full implementation.)_
- Added coordinate processing helpers providing snapping to existing anchors or grid and optional Douglas–Peucker simplification before committing paths.\
- Implemented preview rendering, anchor visualization, and rasterisation helper to bake paths into the raster layer when requested or in auto mode.
- Persisted vector paths and configuration through the shared tool store slice so sessions rehydrate previous drawings and maintain settings.
- Registered the vector tool in the tool manifest so it appears in the application UI.
- Added unit tests covering rehydration logic and configuration persistence when new paths are committed.

## In Progress / TODO
- Editing tools for existing paths (moving anchors, deleting segments, adjusting stroke styles) are not yet implemented.
- UI wiring for toggling snapping modes, simplification tolerance, rasterise mode, and anchor visibility remains to be built.
- Undo/redo integration for vector edits beyond rasterisation snapshots still needs validation.
- SVG export currently emits simple `M/L` path commands; support for curves and shape primitives is pending.

## Next Steps
1. Design and implement anchor editing interactions within the tool-owned model.
2. Expose the vector tool configuration options through the UI and ensure they update the store slice.
3. Extend export and rasterisation routines to cover bezier curves, rectangles, ellipses, and polygons once their editing flows land.
4. Add integration tests exercising tool lifecycle with the main application engine.
