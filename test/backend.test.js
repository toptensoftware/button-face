// Rendering backend contract (src/backend.js) and the Node
// backend (src/backends/napi.js, @napi-rs/canvas / Skia).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as skia from "@napi-rs/canvas";
import { napiBackend } from "../src/backends/napi.js";
import { drawSvg, pixelAt, pixels, expectColorNear } from "./helpers.js";

const RED = { r: 255, g: 0, b: 0, a: 255 };

// Raw Skia with no SVG patching - only for characterising the Skia quirk below.
// (Tests may import @napi-rs/canvas; src/ must not, except the napi backend.)
const rawSkia = {
    createCanvas: skia.createCanvas,
    loadSvgImage: svg => skia.loadImage(Buffer.from(svg)),
};

test("napiBackend implements the backend contract", () =>
{
    assert.equal(typeof napiBackend.createCanvas, "function");
    assert.equal(typeof napiBackend.loadSvgImage, "function");
    assert.ok(Object.isFrozen(napiBackend));
});

test("createCanvas: size and a transparent RGBA 2d context", () =>
{
    let canvas = napiBackend.createCanvas(30, 20);
    assert.equal(canvas.width, 30);
    assert.equal(canvas.height, 20);
    let ctx = canvas.getContext("2d");
    let image = ctx.getImageData(0, 0, 30, 20);
    assert.equal(image.width, 30);
    assert.equal(image.height, 20);
    assert.equal(image.data.length, 30 * 20 * 4);
    assert.ok(image.data.every(v => v == 0), "new canvas is not transparent");
});

test("createCanvas: getImageData is RGBA order and not premultiplied", () =>
{
    let ctx = napiBackend.createCanvas(2, 2).getContext("2d");
    ctx.fillStyle = "rgba(255, 128, 0, 0.5)";
    ctx.fillRect(0, 0, 2, 2);
    let d = ctx.getImageData(0, 0, 1, 1).data;
    expectColorNear({ r: d[0], g: d[1], b: d[2], a: d[3] }, { r: 255, g: 128, b: 0, a: 128 }, 2);
});

test("loadSvgImage: a 10x10 red rect drawn at 20x20 fills the canvas", async () =>
{
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>`;
    let canvas = napiBackend.createCanvas(20, 20);
    let ctx = canvas.getContext("2d");
    let img = await napiBackend.loadSvgImage(svg, 20, 20);
    ctx.drawImage(img, 0, 0, 20, 20);
    let result = { data: ctx.getImageData(0, 0, 20, 20).data, width: 20, height: 20, channels: 4 };
    for (let [x, y] of [[0, 0], [19, 0], [0, 19], [19, 19], [10, 10]])
        expectColorNear(pixelAt(result, x, y), RED, 2, `(${x},${y}) `);
});

test("loadSvgImage: drawn at an offset and size via drawImage", async () =>
{
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>`;
    let ctx = napiBackend.createCanvas(20, 20).getContext("2d");
    ctx.drawImage(await napiBackend.loadSvgImage(svg, 10, 10), 10, 10, 10, 10);
    let result = { data: ctx.getImageData(0, 0, 20, 20).data, width: 20, height: 20, channels: 4 };
    assert.equal(pixelAt(result, 5, 5).a, 0);
    expectColorNear(pixelAt(result, 15, 15), RED, 2);
});

for (let [label, svg] of [
    ["garbage", "this is not an svg"],
    ["empty string", ""],
    ["truncated markup", `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect`],
])
{
    test(`loadSvgImage rejects invalid SVG (${label})`, async () =>
    {
        await assert.rejects(napiBackend.loadSvgImage(svg, 10, 10));
    });
}

// A 100x100 box stroked red; the stroke spans x 6..14 when 8 wide, so x=12 is
// inside an 8-wide stroke but not inside a 1-wide one.
const strokedBox = style => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M10 10h80v80H10z" style="fill:none;stroke:red;${style}"/></svg>`;

test("loadSvgImage applies normalizeStyleLengths (unitless stroke-width in style draws 8 wide)", async () =>
{
    let result = await drawSvg(strokedBox("stroke-width:8"), 100, 100);
    expectColorNear(pixelAt(result, 12, 50), RED, 2);
    expectColorNear(pixelAt(result, 7, 50), RED, 2);
    assert.equal(pixelAt(result, 20, 50).a, 0, "stroke too wide");
});

// Known Skia (@napi-rs/canvas 1.1.1) quirk (see README "SVG authoring notes"):
// a *unitless* `stroke-width` inside `style="..."` is ignored (falls back to 1
// user unit); it works with a `px` unit (and as an attribute). Browsers and
// librsvg accept it. The built-in icons avoid strokes altogether (see
// icons.test.js); the napi backend patches SVGs with `normalizeStyleLengths`
// (test above). If this test starts failing, Skia has fixed the bug and that
// patch may no longer be needed.
test("Skia quirk (raw, unpatched): unitless stroke-width in style is ignored, px is honoured", async () =>
{
    let unitless = await drawSvg(strokedBox("stroke-width:8"), 100, 100, undefined, rawSkia);
    let px = await drawSvg(strokedBox("stroke-width:8px"), 100, 100, undefined, rawSkia);
    expectColorNear(pixelAt(px, 12, 50), RED, 2, "px: ");
    assert.equal(pixelAt(unitless, 12, 50).a, 0, "unitless stroke-width is now honoured - Skia fixed?");
});

test("drawSvg helper paints the background then the SVG", async () =>
{
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="5" height="10" fill="red"/></svg>`;
    let result = await drawSvg(svg, 10, 10, "blue");
    expectColorNear(pixelAt(result, 2, 5), RED, 2);
    expectColorNear(pixelAt(result, 7, 5), { r: 0, g: 0, b: 255, a: 255 }, 2);
    assert.equal([...pixels(result)].length, 100);
});
