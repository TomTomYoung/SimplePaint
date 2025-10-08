/**
 * Shared type definitions for the tool system.  The file does not export runtime
 * symbols; it only exists to provide JSDoc typedefs that other modules can import
 * for IntelliSense and static tooling.
 *
 * @module types/tool
 */

/**
 * @typedef {Object} ToolImagePoint
 * @property {number} x - X coordinate in image space.
 * @property {number} y - Y coordinate in image space.
 */

/**
 * @typedef {Object} ToolPointerEvent
 * @property {number} sx - Pointer position on screen space relative to the canvas.
 * @property {number} sy - Pointer position on screen space relative to the canvas.
 * @property {ToolImagePoint} img - Coordinates mapped into image space via the viewport.
 * @property {number} button - Pointer button index from the originating DOM event.
 * @property {number} detail - Normalised click count (1 for single, 2 for double clicks).
 * @property {boolean} shift - Whether the Shift modifier was held.
 * @property {boolean} ctrl - Whether the Control or Command modifier was held.
 * @property {boolean} alt - Whether the Alt modifier was held.
 * @property {number} pressure - Pointer pressure normalised between 0 and 1.
 * @property {number} pointerId - DOM PointerEvent identifier for capture logic.
 * @property {string} type - Pointer event type such as `pointerdown` or `pointermove`.
 */

/**
 * @typedef {Object} ToolPreviewRect
 * @property {number} x - X coordinate of the preview rectangle origin.
 * @property {number} y - Y coordinate of the preview rectangle origin.
 * @property {number} w - Preview rectangle width in image space.
 * @property {number} h - Preview rectangle height in image space.
 */

/**
 * @callback ToolPointerHandler
 * @param {CanvasRenderingContext2D} ctx - Drawing context of the active layer.
 * @param {ToolPointerEvent} event - Normalised pointer payload supplied by the engine.
 * @param {import('../core/engine.js').Engine} engine - Engine instance coordinating the session.
 * @returns {void}
 */

/**
 * @callback ToolPreviewRenderer
 * @param {CanvasRenderingContext2D} overlayCtx - Overlay canvas context for guides and previews.
 * @returns {void}
 */

/**
 * @typedef {Object} Tool
 * @property {string} id - Unique tool identifier.
 * @property {string} [cursor] - CSS cursor applied when the tool is active.
 * @property {ToolPreviewRect|null|undefined} [previewRect] - Rectangle highlighted by marching ants.
 * @property {ToolPointerHandler} onPointerDown - Handler invoked on pointer press.
 * @property {ToolPointerHandler} onPointerMove - Handler invoked on pointer move.
 * @property {ToolPointerHandler} onPointerUp - Handler invoked on pointer release.
 * @property {ToolPreviewRenderer} [drawPreview] - Overlay renderer executed on each repaint.
 * @property {() => void} [cancel] - Optional hook invoked when the interaction is cancelled.
 * @property {(CanvasRenderingContext2D, import('../core/engine.js').Engine) => void} [onEnter]
 *   - Optional hook executed when the user presses Enter.
 */

/**
 * @typedef {import('../core/store.js').Store} Store
 */

/**
 * @callback ToolFactory
 * @param {Store} store - Shared store instance used to read and persist tool state.
 * @returns {Tool}
 */

/**
 * @typedef {Object} ToolManifestEntry
 * @property {string} id - Tool identifier.
 * @property {ToolFactory} factory - Factory that creates the tool object.
 * @property {string} categoryId - Identifier of the category that owns the tool.
 */

/**
 * @typedef {Object} ToolManifestCategory
 * @property {string} id - Unique category identifier.
 * @property {string} label - Human readable category label.
 * @property {readonly ToolManifestEntry[]} tools - Immutable list of tool entries.
 */

/**
 * @typedef {readonly ToolManifestCategory[]} ToolManifest
 */

export {};
