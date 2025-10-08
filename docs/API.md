# SimplePaint API Reference

This document describes the public modules exposed by the SimplePaint runtime. It focuses on the contracts that third party tools and extensions can depend on when integrating with the application.

## Core Engine

### `src/core/engine.js`
- **`Engine` class** – coordinates the lifecycle of the drawing session, including the canvas context stack, active tool, and history integration.
- **`engine.useTool(toolId)`** – switches the active tool by id, validating against the registry.
- **`engine.dispatch(action)`** – pushes structured actions into the history manager and mutates canvas state.

### `src/core/store.js`
- **`createStore(initialState)`** – creates a reactive store with `getState`, `setState`, and `subscribe` helpers.
- **`store.watch(selector, callback)`** – subscribes to derived data changes without re-rendering the entire state tree.

## Tool Registry

### `src/tools/_base/registry.js`
- **`registerTool(toolId, factory)`** – adds a tool factory to the registry.
- **`getTool(toolId)`** – resolves a tool by id and throws if the tool is missing.
- **`listTools()`** – returns an array of `{ id, category }` entries assembled from the manifest and registry.

### `src/tools/_base/manifest.js`
- `DEFAULT_TOOL_MANIFEST` – frozen array of categories that define the canonical ordering of tools inside the UI.
- `createCategory(id, label, toolIds)` – helper to define manifest categories.
- `createToolEntry(id, factory)` – helper to create manifest entries for custom tooling.

## Events

### `src/core/event-bus.js`
- **`createEventBus()`** – returns a strongly typed pub/sub instance.
- **`bus.emit(event, payload)`** – broadcasts an event to listeners.
- **`bus.on(event, handler)`** – attaches a listener and returns an unsubscribe function.

## Layers

### `src/core/layer.js`
- **`createLayer(options)`** – creates a layer descriptor with metadata, transformation, and draw callbacks.
- **`layer.render(ctx)`** – paints layer content onto a provided canvas context.

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

## Extensibility Hooks

- **Tool manifest augmentation** – call `registerTool` and append new entries to the manifest to expose custom brushes.
- **Store watchers** – use `store.watch` to react to viewport or layer changes without mutating state directly.
- **Event bus** – subscribe to `pointer:*` events for global gestures or overlays.

## Versioning

The API follows semantic versioning. Breaking changes are announced in the `docs/PROGRESS.md` changelog. Extensions should pin to a specific minor version to avoid regressions.
