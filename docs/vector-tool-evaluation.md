# Vector Tool Architecture Evaluation

This document reassesses the proposed vector tool architecture in light of the clarified goal: the vector tool itself must own all vector state instead of delegating to a reusable `VectorLayer`. The notes below capture how the revised plan aligns with SimplePaint conventions, its advantages, new risks introduced by the shift, and the concrete steps required next.

## Alignment with Existing Engine & Store Patterns

- **Tool-centric state**: Keeping control data inside `makeVectorTool` mirrors how existing brushes track their in-progress strokes. The vector tool can keep a private in-memory model (paths, anchors, selections) that is committed to the engine only when rasterisation or export is needed, avoiding an additional layer abstraction.
- **Engine integration**: Directly calling `engine.beginStrokeSnapshot()`/`finishStrokeToHistory()` from the tool preserves compatibility with current undo/redo. The vector tool simply passes rasterised snapshots when it decides to bake the vector data, which matches expectations for other tools.
- **Store usage**: Persisted preferences (snap toggles, simplification tolerance, rasterisation mode) remain scoped to the tool slice in the shared store, so no manifest changes are required.

## Strengths of the Tool-owned Approach

1. **Lower surface area**: Removing `VectorLayer` eliminates a cross-cutting dependency. The tool encapsulates its data structures, reducing the API footprint the rest of the app must understand.
2. **Simpler lifecycle management**: Selection and editing state live alongside pointer handlers, so we avoid reconciling selections between a layer subsystem and the tool UI.
3. **Faster experimentation**: Iterating on path editing behaviour only touches tool code, allowing rapid prototyping without refactoring core engine modules.
4. **Same feature richness**: We still retain the coordinate processor (snapping, Douglas–Peucker simplification), renderer (preview overlays), rasteriser modes, and SVG export as internal helpers owned by the tool.

## Risks & Open Questions

- **State persistence**: Without a shared layer, we must decide how long-lived vector data is stored. Options include keeping an internal history stack inside the tool or serialising vector commands into the engine history entries so undo works after reload.
- **Collaboration with existing selection UI**: The tool now owns selection highlighting. We need conventions for when the global selection chrome is hidden or reused, to avoid conflicting cues.
- **Performance of in-tool data structures**: Managing all vector paths in JavaScript within the tool might impact memory if documents become complex. Profiling should confirm that the data structures remain efficient without engine-level sharing.
- **Raster history fidelity**: Auto-rasterisation must still integrate with history diffs. We should validate that the tool-triggered `finishStrokeToHistory()` calls capture both the raster snapshot and enough metadata to rebuild vector state for edits.

## Suggested Next Steps

1. Prototype `makeVectorTool` with an internal model (paths + anchors) and validate pointer event flows without relying on a separate layer.
2. Define the contract for helper modules (`CoordinateProcessor`, `VectorRenderer`, `VectorRasterizer`) so they operate purely as private utilities invoked by the tool.
3. Implement undo/redo experiments to ensure the tool-owned history remains consistent across sessions, especially for the `auto` rasterisation mode.
4. Draft UX specs for exposing tool-managed settings (snap toggles, simplification tolerance, rasterisation mode) in the existing sidebar controls.

Documenting the tool-owned direction now should keep subsequent implementation focused and compatible with SimplePaint's current architecture.
