// Browser-vs-napi comparison: every sample in scripts/sample-defs.js is
// rendered with `napiBackend` in Node and with `browserBackend` in each
// available browser engine (see test/browser/launch.js; engines that can't
// be launched are skipped with a reason), and the two are compared with
// `diffStats`. Text samples (`isTextSample`) get loose tolerances because
// font metrics/hinting differ between engines (e.g. Skia rounds the "Xy"
// ascent of bold 12px Arial to 8px in napi but 9px in Chrome, which moves
// wrapped lines by a pixel); everything else is fills + SVG and must match
// closely (differences are edge antialiasing only).
//
// Tolerances were tuned on real runs (Chrome 157, Playwright Firefox and
// WebKit on Windows); measured worst cases are recorded in
// wip/wip-browser-backend.md (or its complete- successor).

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../scripts/static-server.js";
import { findBrowsers, closeBrowsers, openTestPage, pageOps } from "./browser/launch.js";
import { backendOps } from "./browser/ops.js";
import { napiBackend } from "../src/backends/napi.js";
import { groups, renderSample, isTextSample } from "../scripts/sample-defs.js";
import { diffStats, pixelAt } from "./helpers.js";

/**
 * Upper limits per `diffStats` metric (`max` isn't limited: single edge
 * pixels can legitimately differ a lot). `corner` = per-channel limit on the
 * top-left (background) pixel.
 */
const TOLERANCES = {
    shape: { mean: 1.5, bad: 0.5, bounds: 1, corner: 2 },
    text: { mean: 22, bad: 16, bounds: 4, corner: 2 },
};

/** A `renderSample` render function over an ops object (backendOps / pageOps). */
const viaOps = ops => (def, w, h, { channels }) => ops.render(def, w, h, channels);

/**
 * Problems (strings) comparing a sample's napi and browser renders; empty if
 * within tolerance.
 */
function compareSample(expected, actual, tolerance)
{
    let stats = diffStats(expected, actual);
    let problems = ["mean", "bad", "bounds"]
        .filter(k => stats[k] === null || stats[k] > tolerance[k])
        .map(k => `${k} ${stats[k]} > ${tolerance[k]}`);
    let [p, q] = [pixelAt(expected, 0, 0), pixelAt(actual, 0, 0)];
    if (["r", "g", "b", "a"].some(ch => Math.abs(p[ch] - q[ch]) > tolerance.corner))
        problems.push(`corner ${JSON.stringify(q)} vs ${JSON.stringify(p)}`);
    return problems.length ? [`${problems.join(", ")} (${JSON.stringify(stats)})`] : [];
}

describe("diffStats", () =>
{
    const image = (channels, pixels, width = pixels.length / channels) =>
        ({ data: Uint8Array.from(pixels), width, height: pixels.length / channels / width, channels });

    test("identical images: all zero", () =>
    {
        let a = image(3, [0, 0, 0, 255, 255, 255]);
        assert.deepEqual(diffStats(a, a), { max: 0, mean: 0, bad: 0, bounds: 0 });
    });

    test("max, mean and bad percentage", () =>
    {
        let a = image(3, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        let b = image(3, [0, 0, 0, 200, 0, 0, 0, 40, 0, 0, 0, 0]);
        // per-channel diffs sum 240 over 4 pixels x 4 channels; 1 of 4 pixels > 64
        assert.deepEqual(diffStats(a, b), { max: 200, mean: 15, bad: 25, bounds: null });
        assert.equal(diffStats(a, b, 30).bad, 50);
    });

    test("compares premultiplied colour (transparent pixels' RGB ignored)", () =>
    {
        let a = image(4, [0, 0, 0, 0, 255, 0, 0, 128]);
        let b = image(4, [255, 255, 255, 0, 255, 0, 0, 128]);
        assert.deepEqual(diffStats(a, b), { max: 0, mean: 0, bad: 0, bounds: 0 });
        let c = image(4, [0, 0, 0, 0, 255, 0, 0, 255]);
        assert.equal(diffStats(a, c).max, 127);
    });

    test("bounds: largest ink edge shift against a's top-left pixel", () =>
    {
        let row = inkAt => [0, 1, 2, 3].flatMap(x => x == inkAt ? [255, 255, 255] : [0, 0, 0]);
        assert.equal(diffStats(image(3, row(1)), image(3, row(3))).bounds, 2);
        assert.equal(diffStats(image(3, row(1)), image(3, row(-1))).bounds, null);
    });

    test("throws on a size mismatch", () =>
    {
        assert.throws(() => diffStats(image(3, [0, 0, 0]), image(3, [0, 0, 0, 0, 0, 0])), /size mismatch/);
    });
});

describe("compareSample", () =>
{
    const solid = (r, w = 4) => ({ data: Uint8Array.from({ length: w * w * 3 }, (_, i) => i % 3 ? 0 : r), width: w, height: w, channels: 3 });

    test("within tolerance -> no problems", () =>
    {
        assert.deepEqual(compareSample(solid(10), solid(11), TOLERANCES.shape), []);
    });

    test("names each failing metric", () =>
    {
        let [problem] = compareSample(solid(0), solid(200), TOLERANCES.shape);
        assert.match(problem, /^mean 50 > 1\.5, bad 100 > 0\.5, bounds null > 1, corner /);
    });
});

const browsers = await findBrowsers();
after(() => closeBrowsers(browsers));

let server;
before(async () =>
{
    if (browsers.some(b => b.browser))
        server = await startStaticServer({ root: fileURLToPath(new URL("../", import.meta.url)) });
});
after(() => server?.close());

/** napi renders, rendered once on first use and shared by every engine. */
let napiRenders;
async function napiRender(sample)
{
    napiRenders ??= new Map(await Promise.all(groups.flatMap(g => g.samples)
        .map(async s => [s, await renderSample(viaOps(backendOps(napiBackend)), s)])));
    return napiRenders.get(sample);
}

for (let { label, browser, skip } of browsers)
{
    describe(`browser vs napi: ${label}`, { skip }, () =>
    {
        let page;
        before(async () => { page = await openTestPage(browser, server); });
        after(() => page?.close());

        for (let group of groups)
        {
            test(`samples match napi: ${group.name}`, async () =>
            {
                let failures = [];
                for (let sample of group.samples)
                {
                    let kind = isTextSample(sample) ? "text" : "shape";
                    let actual = await renderSample(viaOps(pageOps(page)), sample);
                    for (let problem of compareSample(await napiRender(sample), actual, TOLERANCES[kind]))
                        failures.push(`${group.name}/${sample.label} (${kind}): ${problem}`);
                }
                assert.deepEqual(failures, []);
            });
        }
    });
}
