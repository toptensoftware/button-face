// Shared helpers for render tests.

import { napiBackend } from "../src/backends/napi.js";

/**
 * Rasterise an SVG string onto a new transparent canvas of the given size,
 * through a rendering backend (default: the Node backend).
 * @param {string} svg
 * @param {number} width
 * @param {number} height
 * @param {string} [background] optional CSS colour painted first
 * @param {import("../src/backend.js").Backend} [backend]
 * @returns {Promise<{ data: Uint8ClampedArray, width: number, height: number, channels: 4 }>}
 */
export async function drawSvg(svg, width, height, background, backend = napiBackend)
{
    let canvas = backend.createCanvas(width, height);
    let ctx = canvas.getContext("2d");
    if (background)
    {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
    }
    let img = await backend.loadSvgImage(svg, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    let data = ctx.getImageData(0, 0, width, height).data;
    return { data, width, height, channels: 4 };
}

/**
 * Read one pixel as `{ r, g, b, a }` (a is 0..255; 255 when channels is 3).
 */
export function pixelAt(result, x, y)
{
    let { data, width, channels } = result;
    let i = (y * width + x) * channels;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: channels == 4 ? data[i + 3] : 255 };
}

/**
 * Iterate over every pixel as `[x, y, { r, g, b, a }]`.
 */
export function* pixels(result)
{
    for (let y = 0; y < result.height; y++)
    {
        for (let x = 0; x < result.width; x++)
            yield [x, y, pixelAt(result, x, y)];
    }
}

/**
 * Bounding box of "ink": pixels that differ from `background` (default: alpha
 * above `threshold`). Returns null if there is no ink.
 * @param {object} result
 * @param {{ r: number, g: number, b: number, a: number }} [background]
 * @param {number} [threshold] per-channel difference counted as ink
 */
export function findInkBounds(result, background, threshold = 32)
{
    let isInk = background
        ? p => Math.max(Math.abs(p.r - background.r), Math.abs(p.g - background.g),
            Math.abs(p.b - background.b), Math.abs(p.a - background.a)) > threshold
        : p => p.a > threshold;
    let bounds = null;
    for (let [x, y, p] of pixels(result))
    {
        if (!isInk(p))
            continue;
        if (!bounds)
            bounds = { left: x, top: y, right: x, bottom: y };
        bounds.left = Math.min(bounds.left, x);
        bounds.top = Math.min(bounds.top, y);
        bounds.right = Math.max(bounds.right, x);
        bounds.bottom = Math.max(bounds.bottom, y);
    }
    return bounds;
}

/**
 * Summary of a rendered image for loose comparisons between renderers:
 * `coverage` = sum of alpha / 255 (pixel-equivalents of ink), `bounds` =
 * `findInkBounds(result)`, `color` = coverage-weighted mean RGB (rounded), or
 * null when there is no ink.
 * @returns {{ coverage: number, bounds: object|null, color: {r:number,g:number,b:number}|null }}
 */
export function inkStats(result)
{
    let coverage = 0, r = 0, g = 0, b = 0;
    for (let [, , p] of pixels(result))
    {
        let w = p.a / 255;
        coverage += w;
        r += p.r * w;
        g += p.g * w;
        b += p.b * w;
    }
    let color = coverage ? { r: Math.round(r / coverage), g: Math.round(g / coverage), b: Math.round(b / coverage) } : null;
    return { coverage: Math.round(coverage * 10) / 10, bounds: findInkBounds(result), color };
}

/**
 * Assert a pixel's RGB (and alpha, if `expected.a` is given) is within
 * `tolerance` of `expected` per channel.
 */
export function expectColorNear(actual, expected, tolerance = 2, message = "")
{
    for (let ch of ["r", "g", "b", "a"])
    {
        if (expected[ch] === undefined)
            continue;
        if (Math.abs(actual[ch] - expected[ch]) > tolerance)
        {
            throw new Error(`${message}colour ${JSON.stringify(actual)} not within ${tolerance} of ${JSON.stringify(expected)}`);
        }
    }
}
