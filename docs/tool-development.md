# Tool Development Guide

This guide explains how to build a custom tool for SimplePaint using the manifest and registry infrastructure.

## 1. Project Setup

1. Create a new file inside the correct category under `src/tools/`. For example, `src/tools/drawing/spray.js`.
2. Export a factory function that returns the tool lifecycle handlers.

```javascript
// src/tools/drawing/spray.js
import { sampleGaussian } from '../../utils/math/random.js';

export default function createSprayTool(context) {
  const points = [];

  return {
    id: 'spray',
    cursor: 'crosshair',
    onPointerDown(event, engine) {
      points.length = 0;
      this.onPointerMove(event, engine);
    },
    onPointerMove(event, engine) {
      const { canvasCtx } = engine.getContexts();
      for (let i = 0; i < 16; i += 1) {
        const [dx, dy] = sampleGaussian(0, 12);
        canvasCtx.fillRect(event.x + dx, event.y + dy, 1, 1);
      }
    },
    onPointerUp() {},
    drawPreview(overlayCtx) {
      overlayCtx.strokeStyle = 'rgba(255,255,255,0.3)';
      overlayCtx.strokeRect(context.pointer.x - 12, context.pointer.y - 12, 24, 24);
    },
  };
}
```

## 2. Registering the Tool

Add the tool to the manifest and registry. The manifest controls ordering, while the registry provides the actual factory.

```javascript
// src/tools/_base/manifest.js
import { createCategory, createToolEntry } from './manifest-helpers.js';
import createSprayTool from '../drawing/spray.js';

export const DEFAULT_TOOL_MANIFEST = [
  // ...existing categories
  createCategory('drawing', 'Drawing tools', [
    createToolEntry('pencil'),
    createToolEntry('brush'),
    createToolEntry('spray'), // new entry
  ]),
];

// src/tools/_base/registry.js
import { registerTool } from './registry-core.js';
import createSprayTool from '../drawing/spray.js';

registerTool('spray', createSprayTool);
```

## 3. Tool Context

The factory receives a `context` object containing helpers:

- `store` – shared global state.
- `viewport` – coordinate transforms.
- `history` – undo/redo integration.
- `eventBus` – publish/subscribe to application events.

Use these helpers instead of importing modules directly when possible; this keeps tools portable.

## 4. State Management

- Use `store.getState()` to read reactive data.
- Use `store.setState()` to update slices. Group related changes to avoid redundant renders.
- Use `store.watch(selector, callback)` for derived state such as layer opacity or viewport zoom.

## 5. Drawing Strategy

- Prefer drawing into offscreen buffers for complex brushes, then compositing onto the main canvas.
- When painting directly, wrap operations in `engine.beginStroke()` / `engine.endStroke()` if available to ensure correct history snapshots.
- Provide a `drawPreview` function for hover outlines or overlays.

## 6. Performance Tips

- Cache expensive calculations between pointer events.
- Use utilities from `src/utils/` (geometry, math, image) instead of re-implementing helpers.
- Debounce history entries if the tool emits long-running strokes.

## 7. Testing

Add unit or integration tests under `test/tools/` that simulate pointer events and assert canvas mutations. Use the existing pencil tests as a template.

## 8. Distribution

Third-party tool bundles should export a function that receives the engine context and registers tools via `registerTool`. Document required assets and configuration in your README.

For more background on the runtime, review the [Architecture Overview](./architecture.md) and [API Reference](./API.md).
