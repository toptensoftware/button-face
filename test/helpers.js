// Shared helpers for render tests.

import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { napiBackend } from "../src/backends/napi.js";
import { drawSvgWith } from "./browser/ops.js";

// Source icon access (icons/*.svg), shared with the generator.
export { ICON_KEY, listIcons, readIcon } from "../scripts/build-icons.js";

/**
 * Read a file (path relative to the repo root) as UTF-8 text.
 * @param {string} relPath e.g. "package.json"
 * @returns {string}
 */
export function readRepoFile(relPath)
{
    return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

/**
 * Read a file from test/fixtures/ as UTF-8 text.
 * @param {string} name e.g. "material-home.svg"
 * @returns {string}
 */
export function readFixture(name)
{
    return readRepoFile(`test/fixtures/${name}`);
}

/** The parsed package.json. */
export const pkg = JSON.parse(readRepoFile("package.json"));

/**
 * A fresh temp directory for one test, removed (recursively) after it.
 * @param {import("node:test").TestContext} t
 * @returns {Promise<string>}
 */
export async function tempDir(t)
{
    let dir = await mkdtemp(join(tmpdir(), "button-face-test-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    return dir;
}

/** The HTML body a fake 404 response returns (like fonts.gstatic.com). */
export const NOT_FOUND_HTML = "<!DOCTYPE html><html><body>Error 404 (Not Found)</body></html>";

/**
 * A fake `fetch` (no network): `routes` maps URL -> body (200) or an Error
 * (rejects); any other URL 404s with HTML. `calls` records every URL fetched.
 * @param {Record<string, string|Error>} [routes]
 */
export function fakeFetch(routes = {})
{
    let calls = [];
    let fetch = async url =>
    {
        calls.push(url);
        await null;
        let body = routes[url];
        if (body instanceof Error)
            throw body;
        let ok = body !== undefined;
        return { ok, status: ok ? 200 : 404, text: async () => ok ? body : NOT_FOUND_HTML };
    };
    return { fetch, calls };
}

/**
 * Assert a source file (path relative to the repo root) has no Node-only or
 * native imports (`node:*`, `fs`, `path`, `@napi-rs/*`), i.e. is browser-safe.
 * @param {string} relPath e.g. "src/render.js"
 */
export function assertBrowserSafe(relPath)
{
    let source = readRepoFile(relPath);
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
        let source = readRepoFile(file);
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
export function drawSvg(svg, width, height, background, backend = napiBackend)
{
    return drawSvgWith(backend, svg, width, height, background);
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
 * Every fully opaque pixel as `{ r, g, b, a }`.
 */
export function opaquePixels(result)
{
    return [...pixels(result)].map(([, , p]) => p).filter(p => p.a == 255);
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
 * The most opaque pixel on the left half of the middle row, for icons drawn
 * as thin outlines (e.g. `#square` / `#circle`, ~2.6px, so no pixel may be
 * fully covered) on a transparent background. Asserts it is reasonably opaque.
 */
export function outlinePixel(result)
{
    let y = result.height >> 1;
    let best = pixelAt(result, 0, y);
    for (let x = 1; x < result.width >> 1; x++)
    {
        let p = pixelAt(result, x, y);
        if (p.a > best.a)
            best = p;
    }
    assert.ok(best.a >= 200, `outline too faint on the middle row (alpha ${best.a})`);
    return best;
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
 * Per-pixel difference between two same-sized renders, on premultiplied
 * RGBA (so the colour of nearly transparent pixels, which un-premultiplying
 * makes arbitrary, doesn't count; alpha is 255 for 3-channel results):
 * - `max`: largest per-channel difference anywhere (0..255)
 * - `mean`: mean per-channel difference over all pixels and RGBA channels
 * - `bad`: percentage of pixels whose largest channel difference > `threshold`
 * - `bounds`: largest edge shift (px) between the two images' ink bounds,
 *   where ink = differs from `a`'s top-left pixel by more than 32 (`null`
 *   when exactly one image has no ink, 0 when neither has)
 * @param {object} a
 * @param {object} b
 * @param {number} [threshold]
 * @returns {{ max: number, mean: number, bad: number, bounds: number|null }}
 */
export function diffStats(a, b, threshold = 64)
{
    assert.deepEqual([b.width, b.height], [a.width, a.height], "diffStats: size mismatch");
    // Premultiplied RGBA copies (4 channels), used for every metric.
    let premultiplied = image => ({ width: image.width, height: image.height, channels: 4,
        data: Float64Array.from([...pixels(image)].flatMap(([, , p]) => [p.r * p.a / 255, p.g * p.a / 255, p.b * p.a / 255, p.a])) });
    a = premultiplied(a);
    b = premultiplied(b);
    let max = 0, sum = 0, bad = 0;
    for (let i = 0; i < a.data.length; i += 4)
    {
        let d = 0;
        for (let ch = 0; ch < 4; ch++)
        {
            let v = Math.abs(a.data[i + ch] - b.data[i + ch]);
            sum += v;
            d = Math.max(d, v);
        }
        max = Math.max(max, d);
        if (d > threshold)
            bad++;
    }
    let pixelCount = a.width * a.height;
    let background = pixelAt(a, 0, 0);
    let ba = findInkBounds(a, background), bb = findInkBounds(b, background);
    let bounds = !ba && !bb ? 0 : !ba || !bb ? null
        : Math.max(...["left", "top", "right", "bottom"].map(k => Math.abs(ba[k] - bb[k])));
    return {
        max: Math.round(max),
        mean: Math.round(sum / (pixelCount * 4) * 100) / 100,
        bad: Math.round(bad / pixelCount * 10000) / 100,
        bounds,
    };
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
