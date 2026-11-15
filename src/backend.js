// Rendering backend contract (types only - no runtime code).
//
// The renderer paints layers onto a Canvas 2D context, so all it needs from a
// platform is a way to make canvases and a way to decode SVG text into
// something `drawImage` accepts. Kept deliberately small so a browser backend
// can implement it with `OffscreenCanvas` / `HTMLCanvasElement` and
// `Image` / `createImageBitmap`, and so no platform-specific types (Node
// `Buffer`, @napi-rs/canvas classes) leak into the core.

/**
 * The subset of `CanvasRenderingContext2D` the renderer uses (standard Canvas
 * 2D API; `getImageData` returns non-premultiplied RGBA).
 * @typedef {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} Context2D
 */

/**
 * A canvas: `width`, `height` and `getContext("2d")`.
 * @typedef {object} Canvas
 * @property {number} width
 * @property {number} height
 * @property {(type: "2d") => Context2D} getContext
 */

/**
 * Anything the backend's own contexts accept as the first argument of
 * `drawImage` (e.g. an `Image`, `ImageBitmap` or canvas). Opaque to the core:
 * it is only ever passed back to `ctx.drawImage(image, x, y, width, height)`.
 * @typedef {object} Drawable
 */

/**
 * @typedef {object} Backend
 * @property {(width: number, height: number) => Canvas} createCanvas
 *   Create a transparent canvas of the given device-pixel size.
 * @property {(svg: string, width: number, height: number) => Promise<Drawable>} loadSvgImage
 *   Decode SVG source text. `width`/`height` are the device-pixel size the
 *   caller will draw it at (`ctx.drawImage(image, x, y, width, height)`);
 *   backends may use them to rasterise at that size. Must render vectors
 *   crisply at that size (no upscaled bitmap blur). Rejects if the SVG can't
 *   be decoded.
 */

export {};
