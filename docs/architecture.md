# SimplePaint Architecture Overview

SimplePaint is composed of four layers: the rendering core, shared utilities, interactive tools, and the presentation layer exposed by `index.html`. The architecture is intentionally modular so that tools and extensions can be developed in isolation and registered through the manifest system.

## 1. Rendering Core

Located in `src/core/`, the rendering core manages state, history, and drawing orchestration.

- **`engine.js`** – wraps the canvas contexts, provides the tool execution pipeline, and integrates the `HistoryManager` for undo/redo.
- **`store.js`** – lightweight observable store inspired by Zustand; exposes `watch` helpers for derived subscriptions.
- **`viewport.js`** – translates between screen and canvas coordinates, supports zooming/panning.
- **`layer.js`** – describes drawable layers and their render order.
- **`event-bus.js`** – centralised pub/sub for user interactions and tool events.

## 2. Tooling System

Tools live under `src/tools/` and are grouped by category. Each tool exports a factory function that returns the lifecycle handlers expected by the engine (`onPointerDown`, `onPointerMove`, `onPointerUp`, `drawPreview`, etc.).

The manifest (`src/tools/base/manifest.js`) provides a declarative catalogue. The registry (`src/tools/base/registry.js`) ensures that each tool id is unique and retrievable at runtime. Tools can be swapped or extended without touching engine internals.

## 3. Utilities

The `src/utils/` directory houses shared functionality:

- `canvas/` – frame buffer helpers and compositing utilities.
- `geometry/` – vector math, intersections, and curve helpers.
- `image/processing.js` – blur, sharpen, and convolutions for raster tools.
- `color-space.js` – conversions and colour blending helpers.
- `math/` – easing curves, noise generators, and statistics.
- `path.js` – polyline, Bézier, and stroke outline operations.

## 4. Presentation Layer

`index.html` bootstraps the engine, loads the default tool manifest, and wires up UI controls. Styling lives in `styles.css`. This layer is intentionally thin; most behaviour is encapsulated in the engine and tools to make future UI rewrites easy.

## Data Flow

1. User interaction triggers DOM events.
2. Events are forwarded to the engine, which looks up the current tool via the registry.
3. Tool handlers mutate the store or draw to scratch canvases.
4. The engine commits results to the active layer and records a history entry.
5. The viewport and presentation layer respond to store changes and re-render as needed.

## Extensibility

- **Add a new tool** by creating a module in the appropriate category and registering it in the manifest.
- **Inject custom state** by extending the store with additional slices and watchers.
- **Listen to events** via the event bus to build overlays or collaborative features.

## Testing Strategy

Core modules are deterministic and can be unit tested by importing the functions directly. Tool behaviour is best validated through integration tests that simulate pointer events against an offscreen canvas. See `test/` for existing suites and use them as templates for new tests.
