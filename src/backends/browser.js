// Browser rendering backend: OffscreenCanvas (or <canvas>) + Image. Uses only
// browser globals, looked up when called, so this module imports fine
// anywhere (it is part of the browser-safe core entry).
//
// Caveats:
// - `loadSvgImage` needs `Image`, so it only works on a page's main thread
//   (Web Workers have no SVG decoder: `createImageBitmap` can't decode SVG
//   blobs in Chromium). `createCanvas` also works in workers.
// - Text layers use the page's fonts: load web fonts first (e.g.
//   `await document.fonts.load("bold 16px MyFont")`) or a fallback is used.
// - SVGs decoded as images can't load external resources (web fonts,
//   `<image href>`, CSS), unlike the Node backend.

import { assertSvgSource } from "../backend.js";
import { prepareSvgImage } from "../svgSize.js";

/**
 * Create a browser backend over the given globals (`OffscreenCanvas` or
 * `document`, `Image`, `Blob`, `URL`). Tests inject fakes; everyone else uses
 * `browserBackend`.
 * @param {object} [env] - read on every call, not captured
 * @returns {import("../backend.js").Backend}
 */
export function createBrowserBackend(env = globalThis)
{
    /** @type {import("../backend.js").Backend["createCanvas"]} */
    function createCanvas(width, height)
    {
        if (typeof env.OffscreenCanvas == "function")
            return new env.OffscreenCanvas(width, height);
        if (env.document && typeof env.document.createElement == "function")
        {
            let canvas = env.document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
        throw new Error("browserBackend.createCanvas: needs OffscreenCanvas or a DOM document (not available here)");
    }

    /**
     * Decode SVG text into an `Image`, stamped with the draw size so it
     * rasterises crisply at that size (see `prepareSvgImage`).
     * @type {import("../backend.js").Backend["loadSvgImage"]}
     */
    async function loadSvgImage(svg, width, height)
    {
        assertSvgSource(svg, "loadSvgImage");
        let prepared = prepareSvgImage(svg, width, height);
        if (typeof env.Image != "function")
            throw new Error("browserBackend.loadSvgImage: needs Image (a page's main thread; not available in Web Workers)");
        let url = env.URL.createObjectURL(new env.Blob([prepared], { type: "image/svg+xml" }));
        try
        {
            let img = new env.Image();
            img.src = url;
            await img.decode();
            return img;
        }
        finally
        {
            env.URL.revokeObjectURL(url);
        }
    }

    return Object.freeze({ createCanvas, loadSvgImage });
}

/**
 * The browser backend, using the page's globals.
 * @type {import("../backend.js").Backend}
 */
export const browserBackend = createBrowserBackend();
