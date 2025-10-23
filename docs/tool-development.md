# Tool Development Guide

This guide explains how to build a custom tool for SimplePaint using the manifest and registry infrastructure.

## 1. Project Setup

1. Create a new file inside the correct category under `src/tools/`. For example, `src/tools/drawing/spray.js`.
2. Export a factory function that receives the shared `Store` instance and returns the tool lifecycle handlers.

```javascript
// src/tools/drawing/spray.js
import { sampleGaussian } from '../../utils/math/random.js';

/** @typedef {import('../../types/tool.js').ToolFactory} ToolFactory */
/** @typedef {import('../../types/tool.js').ToolPointerEvent} ToolPointerEvent */

/** @type {ToolFactory} */
export function makeSpray(store) {
  const id = 'spray';
  let drawing = false;

  function stamp(ctx, x, y) {
    const settings = store.getToolState(id);
    const radius = settings.brushSize ?? 12;
    for (let i = 0; i < 24; i += 1) {
      const [dx, dy] = sampleGaussian(0, radius);
      ctx.fillRect(x + dx, y + dy, 1, 1);
    }
  }

  return {
    id,
    cursor: 'crosshair',
    /** @param {ToolPointerEvent} event */
    onPointerDown(ctx, event, engine) {
      drawing = true;
      engine.clearSelection();
      const settings = store.getToolState(id);
      engine.expandPendingRect(event.img.x, event.img.y, settings.brushSize ?? 12);
      stamp(ctx, event.img.x, event.img.y);
    },
    /** @param {ToolPointerEvent} event */
    onPointerMove(ctx, event, engine) {
      if (!drawing) return;
      const settings = store.getToolState(id);
      engine.expandPendingRect(event.img.x, event.img.y, settings.brushSize ?? 12);
      stamp(ctx, event.img.x, event.img.y);
    },
    onPointerUp() {
      drawing = false;
    },
    drawPreview() {},
  };
}
```

## 2. Registering the Tool

Add the tool to the manifest passed into the registry. The default manifest is frozen, so create a new manifest that includes your entry and provide it to `registerDefaultTools` during boot.

```javascript
// src/app.js (or wherever you configure bootstrapping)
import { DEFAULT_TOOL_MANIFEST } from './tools/base/manifest.js';
import { registerDefaultTools } from './tools/base/registry.js';
import { makeSpray } from './tools/drawing/spray.js';

const sprayEntry = Object.freeze({
  id: 'spray',
  factory: makeSpray,
  categoryId: 'drawing',
});

const manifestWithSpray = Object.freeze(
  DEFAULT_TOOL_MANIFEST.map((category) =>
    category.id === 'drawing'
      ? Object.freeze({
          ...category,
          tools: Object.freeze([...category.tools, sprayEntry]),
        })
      : category,
  ),
);

registerDefaultTools(engine, store, manifestWithSpray);
```

## 3. Tool Context

The factory receives the shared `Store` instance. Use the store to read and persist settings and call methods on the `Engine` instance that is supplied to every lifecycle handler.

Pointer handlers receive a [`ToolPointerEvent`](../src/types/tool.js) which normalises DOM pointer events:

- `event.sx` / `event.sy` – screen-space coordinates relative to the canvas element.
- `event.img` – `{ x, y }` coordinates mapped into image space through the viewport.
- `event.button` / `event.detail` – pointer button index and click count.
- `event.shift`, `event.ctrl`, `event.alt` – modifier state flags (`ctrl` includes `meta` on macOS).
- `event.pressure` – stylus pressure value in the range `[0, 1]`.
- `event.pointerId` – stable identifier for pointer capture logic.
- `event.type` – original DOM pointer event type.

## 4. State Management

- Use `store.getState()` to read reactive data.
- Use `store.set(updates)` to update slices. Group related changes to avoid redundant renders.
- Use `store.watch(selector, callback)` for derived state such as layer opacity or viewport zoom.

## 5. Drawing Strategy

- Prefer drawing into offscreen buffers for complex brushes, then compositing onto the main canvas.
- When painting directly, wrap operations in `engine.beginStrokeSnapshot()` / `engine.finishStrokeToHistory()` to ensure correct history snapshots.
- Provide a `drawPreview` function for hover outlines or overlays.

## 6. Performance Tips

- Cache expensive calculations between pointer events.
- Use utilities from `src/utils/` (geometry, math, image) instead of re-implementing helpers.
- Debounce history entries if the tool emits long-running strokes.

## 7. Testing

Add unit or integration tests under `test/tools/` that simulate pointer events and assert canvas mutations. Use the existing pencil tests as a template.

## 8. Distribution

Third-party tool bundles should export a function that receives the engine context and registers tools by calling `engine.register` or by supplying a manifest to `registerDefaultTools`. Document required assets and configuration in your README.

For more background on the runtime, review the [Architecture Overview](./architecture.md) and [API Reference](./API.md).
