/**
 * @typedef {Object} ToolPointerInfo
 * @property {{x:number,y:number}} img Image-space coordinates adjusted by the viewport.
 * @property {{x:number,y:number}} screen Screen-space pointer coordinates.
 * @property {number} button Pointer button index (0: primary).
 * @property {number} [detail] Additional click count metadata for double-click detection.
 * @property {boolean} [shift]
 * @property {boolean} [ctrl]
 * @property {boolean} [alt]
 */

/**
 * @typedef {Object} ToolEngine
 * @property {(id:string)=>void} setTool
 * @property {()=>void} clearSelection
 * @property {()=>void} beginStrokeSnapshot
 * @property {()=>void} finishStrokeToHistory
 * @property {(x:number,y:number,r?:number)=>void} expandPendingRect
 * @property {(rect:{x:number,y:number,w:number,h:number})=>void} expandPendingRectByRect
 * @property {()=>void} requestRepaint
 */

/**
 * @typedef {Object} Tool
 * @property {string} id
 * @property {string} [cursor]
 * @property {(ctx:CanvasRenderingContext2D, event:ToolPointerInfo, engine:ToolEngine)=>void} onPointerDown
 * @property {(ctx:CanvasRenderingContext2D, event:ToolPointerInfo, engine:ToolEngine)=>void} [onPointerMove]
 * @property {(ctx:CanvasRenderingContext2D, event:ToolPointerInfo, engine:ToolEngine)=>void} [onPointerUp]
 * @property {(overlayCtx:CanvasRenderingContext2D)=>void} [drawPreview]
 * @property {()=>void} [cancel]
 * @property {(ctx:CanvasRenderingContext2D, engine:ToolEngine)=>void} [onEnter]
 */

export {};
