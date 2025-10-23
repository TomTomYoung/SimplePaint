# SimplePaint API Reference

This document describes the public modules exposed by the SimplePaint runtime. It focuses on the contracts that third party tools and extensions can depend on when integrating with the application.

## Core Engine

### `src/core/engine.js`
- **`Engine` class** – coordinates the lifecycle of the drawing session, including the canvas context stack, active tool, and history integration.
- **`engine.register(tool)`** – installs a tool object produced by a factory.
- **`engine.setTool(toolId)`** – switches the active tool by id.
- **`engine.beginStrokeSnapshot()` / `engine.finishStrokeToHistory()`** – wrap direct pixel mutations so the history stack records before/after snapshots.
- **`engine.expandPendingRect(x, y, radius)`** – mark the painted region so history snapshots can be clipped.
- **`engine.clearSelection()`** – dismiss any active selection and associated overlays.
- **`engine.requestRepaint()`** – composite layers and overlays, syncing them with the viewport.

### `src/core/store.js`
- **`createStore(initialState?, eventBus?)`** – creates a reactive store wired to the shared `EventBus` instance.
- **`Store#getState()`** – returns a deep clone of the current state snapshot.
- **`Store#set(updates, options?)`** – merge updates into the state and notify subscribers.
- **`Store#replaceState(nextState, options?)`** – replace the entire state tree.
- **`Store#subscribe(handler)`** – listen for full-state changes.
- **`Store#watch(selector, callback, options?)`** – subscribe to derived slices with custom comparison logic.
- **`Store#getToolState(id, defaults?)`** – read per-tool settings merged with shared defaults.
- **`Store#setToolState(id, updates, options?)`** – persist tool-specific settings.
- **`Store#resetToolState(id, options?)`** – restore default tool settings.
- **`Store#clearToolState(id, options?)`** – remove the stored state for a tool.
- **`defaultState` / `toolDefaults`** – frozen baseline objects used to initialise the store.

## Tool Registry

### `src/tools/base/registry.js`
- **`createDefaultTools(store, manifest?)`** – instantiates every tool factory described in a manifest.
- **`registerDefaultTools(engine, store, manifest?)`** – registers the instantiated tool objects on the engine.

### `src/tools/base/manifest.js`
- **`DEFAULT_TOOL_MANIFEST`** – frozen array of categories that define the canonical ordering of tools inside the UI.
- **`DEFAULT_TOOL_IDS`** – frozen array of tool identifiers derived from the manifest.
- **`flattenToolManifest(manifest?)`** – flattens categories into a single ordered array of tool entries.
- **`collectToolIds(manifest?)`** – returns an array of tool identifiers in manifest order.
- **`createToolIndex(manifest?)`** – builds a `Map` keyed by tool id for quick lookups.
- **`getToolEntryById(id, manifest?)`** – resolves a manifest entry by identifier.
- **`getToolCategoryForId(id, manifest?)`** – returns the category record containing the tool, if any.

## Events

### `src/core/event-bus.js`
- **`EventBus` class** – lightweight pub/sub implementation used across the runtime.
- **`EventBus#on(event, handler, options?)` / `EventBus#once(event, handler, options?)`** – attach listeners with optional abort signals and once semantics.
- **`EventBus#emit(event, payload)` / `EventBus#emitAsync(event, payload)`** – broadcast events synchronously or asynchronously.
- **`EventBus#off(event, handler)`** – remove a previously registered listener.
- **`EventBus#clear(event?)`** – remove listeners, either globally or for a specific event.
- **`EventBus#listeners(event)`**, **`EventBus#listenerCount(event)`**, **`EventBus#has(event)`** – inspection helpers for instrumentation.

## Layers

### `src/core/layer.js`
- **`layers` / `activeLayer`** – shared canvas elements representing the document stack and the index of the active layer.
- **`flattenLayers(ctx)`** – composites visible layers into the provided context.
- **`renderLayers()`** – refreshes the shared bitmap backing the viewport.
- **`updateLayerList(engine)`** – refreshes the layer panel UI bindings.
- **`setActiveLayer(index, engine)`** – change the active layer and trigger repaints.
- **`moveLayer(from, to, engine)`** – reorder layers and update history entries.
- **`addLayer(engine)` / `deleteLayer(engine)`** – manage the stack of canvas layers.

## Utilities

### `src/utils/canvas/`
- Canvas helpers for managing raster buffers, overlays, and exporting user selections.

### `src/utils/geometry/`
- Vector math helpers, collision detection, and shape tessellation utilities shared across tools.

### `src/utils/color-space.js`
- Conversions between RGB, HSV, and L*a*b* colour spaces.

### `src/utils/math/`
- Interpolation, noise, random distributions, and smoothing kernels.

### `src/utils/path.js`
- Bézier helpers, polyline simplification, and cursor snapping logic.

## Tool Interface

See [tool-interface.md](./tool-interface.md) for the contract that custom tools must satisfy.

### `src/types/tool.js`
- **`ToolPointerEvent`** – normalised payload passed to tool pointer handlers.
- **`Tool`** – structural contract for tool objects registered with the engine.
- **`ToolFactory`** – factory signature used by the manifest and registry helpers.
- **`ToolManifest` / `ToolManifestEntry` / `ToolManifestCategory`** – data structures describing the manifest and category layout.

## Extensibility Hooks

- **Tool registration** – call `registerDefaultTools(engine, store, manifest)` with a manifest that includes your custom entries, or manually `engine.register` the tool object returned by your factory.
- **Store watchers** – use `store.watch` to react to viewport or layer changes without mutating state directly.
- **Event bus** – subscribe to `pointer:*` events for global gestures or overlays.

## Versioning

The API follows semantic versioning. Breaking changes are announced in the `docs/PROGRESS.md` changelog. Extensions should pin to a specific minor version to avoid regressions.
