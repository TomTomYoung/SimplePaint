# Tool Interface Guide

This document summarises how painting tools are structured in SimplePaint after the toolkit was reorganised into category folders.

## Factory pattern

Every tool module exports a `make*` factory that receives the shared [`Store`](../src/core/store.js) instance.  The factory returns a plain object describing the behaviour of a tool.  Tools are registered from [`registerDefaultTools`](../src/tools/_base/registry.js), which calls each factory with the store and hands the result to [`Engine.register`](../src/core/engine.js).

```js
// src/tools/drawing/pencil.js
export function makePencil(store) {
  const id = 'pencil';
  return {
    id,
    cursor: 'crosshair',
    onPointerDown(ctx, event, engine) {
      // ...
    },
    onPointerMove(ctx, event, engine) {
      // ...
    },
    onPointerUp(ctx, event, engine) {
      // ...
    },
  };
}
```

Factories may close over helper functions or caches.  They should never reuse mutable state across different tools; create fresh state inside the factory body.

### Tool manifest and categories

[`src/tools/_base/manifest.js`](../src/tools/_base/manifest.js) declares the canonical list of built-in tools grouped by category.  Each entry stores the tool identifier and the factory used to instantiate it.  The manifest is frozen at load time so tests and editor panels can rely on a stable structure.  Helper utilities exported alongside the manifest include:

- `flattenToolManifest(manifest)` — returns a flat array of tool entries while preserving category membership metadata.
- `collectToolIds(manifest)` — returns an array of identifiers, useful for checking uniqueness.
- `DEFAULT_TOOL_IDS` — frozen array of all shipped tool ids.

[`registerDefaultTools`](../src/tools/_base/registry.js) simply flattens the manifest, instantiates each factory, and passes the resulting tool objects to the engine.  Consumers that only need the instantiated tool objects (for example previewing tool metadata in a panel) can call `createDefaultTools(store)` to obtain the same array without registering them on an engine instance.

## Required properties

All tool objects **must** define the following members:

- `id` — Unique identifier string used by the store and engine for lookups.
- `onPointerDown(ctx, event, engine)` — Called when the primary pointer is pressed on the canvas.
- `onPointerMove(ctx, event, engine)` — Called on pointer motion while the tool is active.  The handler is still invoked even if the pointer is not currently pressed so tools can update previews.
- `onPointerUp(ctx, event, engine)` — Called on pointer release.  The engine automatically snapshots the affected pixels afterwards and pushes a history patch.

The first argument is a `CanvasRenderingContext2D` for the active layer.  The `event` argument is a normalised pointer payload with:

| property | description |
| --- | --- |
| `sx`, `sy` | Screen-space coordinates relative to the canvas element. |
| `img` | Coordinates mapped into image space via the viewport. |
| `button` | Pointer button index. |
| `detail` | Click count for primary button events. |
| `shift`, `ctrl`, `alt` | Modifier flags (`ctrl` includes `meta` on macOS). |
| `pressure` | Pointer pressure (0–1). |
| `pointerId` | DOM pointer identifier for capture logic. |
| `type` | DOM event type (e.g. `pointermove`). |

The `engine` argument exposes helpers for history tracking, selection control, viewport state and repaint requests.  Commonly used methods include:

- `engine.clearSelection()` — Release any active marquee or floating selection.
- `engine.beginStrokeSnapshot()` / `engine.finishStrokeToHistory()` — Wrap direct pixel mutations so history patches contain before/after image data.
- `engine.expandPendingRect(x, y, radius)` — Inform the engine about the area touched by the stroke so the snapshot can be limited to that region.
- `engine.requestRepaint()` — Schedule a composite of all layers plus overlays.

## Optional properties

Tools may also define the following members to integrate with additional engine features:

| property | purpose |
| --- | --- |
| `cursor` | CSS cursor string applied when the tool is active. |
| `previewRect` | Rectangle describing the current preview bounds.  When defined, the engine draws marching ants around the rect. |
| `drawPreview(overlayCtx)` | Render custom overlays (e.g. guides) on the overlay canvas each frame. |
| `cancel()` | Reset internal state when the user presses Escape or right-clicks. |
| `onEnter(ctx, engine)` | Commit the current preview when the user presses Enter. |

Any additional helpers can be added as long as the tool manages its own state.

## Working with tool state

Per-tool settings are stored through the shared `Store` instance.  The store exposes:

- `store.getToolState(id, defaults?)` — Retrieve a shallow copy of the current settings merged with [`toolDefaults`](../src/core/store.js).  Pass `defaults = null` to skip the shared defaults when a tool manages its own schema.
- `store.setToolState(id, updates, options?)` — Persist changes.  Use `{ replace: true }` when writing the entire state object, or `{ silent: true }` when a tool updates internal caches without triggering UI refreshes.
- `store.resetToolState(id, options?)` — Restore defaults, often used after applying filters or when switching tools.

All state objects must remain serialisable so autosave and history inspection continue to operate correctly.

## Registration flow

1. Implement a factory in the appropriate category folder under `src/tools/`.
2. Export the factory from the module.
3. Add the factory to the relevant array inside [`src/tools/_base/registry.js`](../src/tools/_base/registry.js).  The registry controls the registration order, which also determines the primary tool selected at boot.
4. When the app boots, [`PaintApp.registerTools`](../src/app.js) calls `registerDefaultTools`, making the new tool available in the GUI.  Tool buttons simply need a matching `data-tool` attribute to activate it via the store.

## Example: lightweight preview tool

The following pattern is common for shape tools that preview geometry before committing pixels:

```js
export function makeArc(store) {
  const id = 'arc';
  let start = null;
  return {
    id,
    cursor: 'crosshair',
    previewRect: null,
    onPointerDown(ctx, event, engine) {
      start = event.img;
      engine.beginStrokeSnapshot();
    },
    onPointerMove(ctx, event) {
      if (!start) return;
      this.previewRect = computeArcRect(start, event.img);
      drawGhostArc(ctx, start, event.img);
    },
    onPointerUp(ctx, event, engine) {
      if (!start) return;
      commitArc(ctx, start, event.img, store.getToolState(id));
      this.previewRect = null;
      start = null;
      engine.finishStrokeToHistory();
    },
    cancel() {
      this.previewRect = null;
      start = null;
    }
  };
}
```

By following this contract, new tools plug into history, overlays, keyboard shortcuts and autosave without additional wiring.
