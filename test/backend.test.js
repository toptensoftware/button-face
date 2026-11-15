// Rendering backend contract (src/backend.js) and the Node
// backend (src/backends/napi.js, @napi-rs/canvas / Skia). The contract cases
// themselves are shared with the real-browser tests: test/backend-cases.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as skia from "@napi-rs/canvas";
import { napiBackend } from "../src/backends/napi.js";
import { assertSvgSource } from "../src/backend.js";
import { backendOps } from "./browser/ops.js";
import { backendCases, strokedBox } from "./backend-cases.js";
import { drawSvg, pixelAt, expectColorNear } from "./helpers.js";

const RED = { r: 255, g: 0, b: 0, a: 255 };

test("assertSvgSource: non-empty strings pass; anything else throws a TypeError naming the function", () =>
{
    assertSvgSource("<svg/>", "fn");
    for (let bad of ["", "  \n", 42, null, undefined, {}])
    {
        assert.throws(() => assertSvgSource(bad, "myLoader"),
            { name: "TypeError", message: "myLoader: SVG source must be a non-empty string" }, String(bad));
    }
});

test("napiBackend implements the backend contract", () =>
{
    assert.equal(typeof napiBackend.createCanvas, "function");
    assert.equal(typeof napiBackend.loadSvgImage, "function");
    assert.ok(Object.isFrozen(napiBackend));
});

const ops = backendOps(napiBackend);
for (let { name, run } of backendCases)
    test(`napiBackend: ${name}`, () => run(ops));

// Raw Skia with no SVG patching - only for characterising the Skia quirk below.
// (Tests may import @napi-rs/canvas; src/ must not, except the napi backend.)
const rawSkia = {
    createCanvas: skia.createCanvas,
    loadSvgImage: svg => skia.loadImage(Buffer.from(svg)),
};

// Known Skia (@napi-rs/canvas 1.1.1) quirk (see README "SVG authoring notes"):
// a *unitless* `stroke-width` inside `style="..."` is ignored (falls back to 1
// user unit); it works with a `px` unit (and as an attribute). Browsers and
// librsvg accept it. The built-in icons avoid strokes altogether (see
// icons.test.js); the napi backend patches SVGs with `normalizeStyleLengths`
// (shared case "unitless stroke-width in style draws 8 wide"). If this test
// starts failing, Skia has fixed the bug and that patch may no longer be needed.
test("Skia quirk (raw, unpatched): unitless stroke-width in style is ignored, px is honoured", async () =>
{
    let unitless = await drawSvg(strokedBox("stroke-width:8"), 100, 100, undefined, rawSkia);
    let px = await drawSvg(strokedBox("stroke-width:8px"), 100, 100, undefined, rawSkia);
    expectColorNear(pixelAt(px, 12, 50), RED, 2, "px: ");
    assert.equal(pixelAt(unitless, 12, 50).a, 0, "unitless stroke-width is now honoured - Skia fixed?");
});
