// Node rendering backend: @napi-rs/canvas (Skia). This is the only module in
// src/ that imports @napi-rs/canvas; nothing it returns is exposed beyond the
// Backend contract in ../backend.js.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { normalizeStyleLengths } from "../recolor.js";

/**
 * Decode an SVG with Skia. Unitless lengths in `style` declarations get `px`
 * first, because Skia ignores e.g. `style="stroke-width:0.7"`.
 * Skia renders the SVG as vectors at the size it is drawn, so `width`/`height`
 * are not needed here.
 * @param {string} svg
 * @returns {Promise<import("../backend.js").Drawable>}
 */
async function loadSvgImage(svg)
{
    if (typeof svg != "string" || !svg.trim())
        throw new TypeError("loadSvgImage: SVG source must be a non-empty string");
    return await loadImage(Buffer.from(normalizeStyleLengths(svg)));
}

/** @type {import("../backend.js").Backend} */
export const napiBackend = Object.freeze({
    createCanvas: (width, height) => createCanvas(width, height),
    loadSvgImage,
});
