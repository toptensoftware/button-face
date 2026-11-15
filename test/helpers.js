// Shared helpers for render tests.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { napiBackend } from "../src/backends/napi.js";

/**
 * Assert a source file (path relative to the repo root) has no Node-only or
 * native imports (`node:*`, `fs`, `path`, `@napi-rs/*`), i.e. is browser-safe.
 * @param {string} relPath e.g. "src/render.js"
 */
export function assertBrowserSafe(relPath)
{
    let source = readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /from\s+["'](node:|fs["']|path["']|@napi-rs)/, `${relPath} is not browser-safe`);
}

/**
 * Walk the static import graph of a source module (path relative to the repo
 * root), following relative specifiers (`import`/`export ... from`, static
 * only). Returns `{ files, external }`: every module reached (repo-relative
 * paths, entry first) and every non-relative specifier seen.
 * @param {string} relPath e.g. "src/index.js"
 * @returns {{ files: string[], external: string[] }}
 */
export function importGraph(relPath)
{
    let files = [], external = new Set(), pending = [relPath];
    while (pending.length)
    {
        let file = pending.shift();
        if (files.includes(file))
            continue;
        files.push(file);
        let source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
        for (let [, fromSpec, bareSpec] of source.matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm))
        {
            let spec = fromSpec ?? bareSpec;
            if (spec.startsWith("."))
                pending.push(new URL(spec, new URL(`../${file}`, import.meta.url)).href.slice(new URL("../", import.meta.url).href.length));
            else
                external.add(spec);
        }
    }
    return { files, external: [...external] };
}

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
 * Assert every pixel of `result` is within `tolerance` of `expected` (see
 * `expectColorNear`; alpha only checked when `expected.a` is given).
 */
export function expectAllPixels(result, expected, tolerance = 2)
{
    for (let [x, y, p] of pixels(result))
        expectColorNear(p, expected, tolerance, `pixel (${x}, ${y}): `);
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
