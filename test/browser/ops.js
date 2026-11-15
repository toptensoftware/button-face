// Browser-safe backend operations shared by the Node tests (napi backend,
// test/helpers.js + test/backend.test.js) and the in-page side of the browser
// tests (test/browser/page.js, browserBackend). No Node imports.
//
// The shared backend contract cases (test/backend-cases.js) call these
// through an "ops" object, so the same cases run against any backend.

import { render, createSvgResolver } from "../../src/index.js";

/** @typedef {{ data: Uint8Array|Uint8ClampedArray, width: number, height: number, channels: number }} Pixels */

/**
 * Rasterise an SVG string onto a new transparent canvas of the given size,
 * through a rendering backend.
 * @param {import("../../src/backend.js").Backend} backend
 * @param {string} svg
 * @param {number} width canvas width
 * @param {number} height canvas height
 * @param {string} [background] optional CSS colour painted first
 * @param {number[]} [at] `[x, y, w, h]`: where to draw the SVG (and its load
 *   size); default the whole canvas
 * @returns {Promise<Pixels>}
 */
export async function drawSvgWith(backend, svg, width, height, background, at = [0, 0, width, height])
{
    let ctx = backend.createCanvas(width, height).getContext("2d");
    if (background)
    {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
    }
    let [x, y, w, h] = at;
    ctx.drawImage(await backend.loadSvgImage(svg, w, h), x, y, w, h);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height, channels: 4 };
}

/**
 * The operations the backend contract cases use, bound to one backend.
 * @param {import("../../src/backend.js").Backend} backend
 */
export function backendOps(backend)
{
    let options = { backend, resolveSvg: createSvgResolver() };
    return {
        /** Core `render` through this backend (default resolver). */
        render: (definition, width, height, channels) => render(definition, width, height, { ...options, channels }),
        /** See `drawSvgWith`. */
        drawSvg: (svg, width, height, background, at) => drawSvgWith(backend, svg, width, height, background, at),
        /**
         * A new canvas, optionally filled with a CSS colour; width/height
         * are read back from the canvas.
         * @returns {Pixels}
         */
        fill: (width, height, color) =>
        {
            let canvas = backend.createCanvas(width, height);
            let ctx = canvas.getContext("2d");
            if (color)
            {
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, width, height);
            }
            let image = ctx.getImageData(0, 0, width, height);
            return { data: image.data, width: canvas.width, height: canvas.height, channels: 4 };
        },
        /** `backend.loadSvgImage`, resolving to null (just "it decoded"). */
        loadSvg: async (svg, width, height) =>
        {
            await backend.loadSvgImage(svg, width, height);
            return null;
        },
    };
}
