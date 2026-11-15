// Backend contract cases shared by every backend: test/backend.test.js runs
// them against napiBackend in Node, test/browser.test.js against
// browserBackend in each real browser engine. Each case gets an "ops" object
// (`backendOps(backend)` from test/browser/ops.js, or `pageOps(page)` from
// test/browser/launch.js for the browser) and asserts in Node.
//
// Note: `node --test` also imports this file (everything under test/); it only
// exports data.

import assert from "node:assert/strict";
import { pixelAt, pixels, expectColorNear, expectAllPixels } from "./helpers.js";

const RED = { r: 255, g: 0, b: 0, a: 255 };
const BLUE = { r: 0, g: 0, b: 255, a: 255 };
const SVG_NS = `xmlns="http://www.w3.org/2000/svg"`;
const red10 = `<svg ${SVG_NS} width="10" height="10"><rect width="10" height="10" fill="red"/></svg>`;

// A 100x100 box stroked red; the stroke spans x 6..14 when 8 wide, so x=12 is
// inside an 8-wide stroke but not inside a 1-wide one.
export const strokedBox = style => `<svg ${SVG_NS} width="100" height="100"><path d="M10 10h80v80H10z" style="fill:none;stroke:red;${style}"/></svg>`;

/** `svg` drawn at 20x20 fills the whole canvas red (corners + centre). */
async function expectFillsRed(ops, svg)
{
    let result = await ops.drawSvg(svg, 20, 20);
    for (let [x, y] of [[0, 0], [19, 0], [0, 19], [19, 19], [10, 10]])
        expectColorNear(pixelAt(result, x, y), RED, 2, `(${x},${y}) `);
}

/**
 * Asserts `promise` rejects with the loadSvgImage "non-empty string" error.
 * Only the message is checked: through page.evaluate, Firefox doesn't keep the
 * error name (`TypeError`); assertSvgSource's own test checks the name.
 */
const rejectsSourceTypeError = promise =>
    assert.rejects(promise, err => /loadSvgImage: SVG source must be a non-empty string/.test(String(err)));

/** @type {{ name: string, run: (ops: ReturnType<typeof import("./browser/ops.js").backendOps>) => Promise<void> }[]} */
export const backendCases = [
    {
        name: "createCanvas: size and a transparent RGBA 2d context",
        run: async ops =>
        {
            let image = await ops.fill(30, 20);
            assert.deepEqual([image.width, image.height, image.data.length], [30, 20, 30 * 20 * 4]);
            assert.ok(image.data.every(v => v == 0), "new canvas is not transparent");
        },
    },
    {
        name: "createCanvas: getImageData is RGBA order and not premultiplied",
        run: async ops =>
        {
            let image = await ops.fill(2, 2, "rgba(255, 128, 0, 0.5)");
            expectColorNear(pixelAt(image, 0, 0), { r: 255, g: 128, b: 0, a: 128 }, 2);
        },
    },
    {
        name: "loadSvgImage rejects non-string/empty input with a TypeError",
        run: async ops =>
        {
            for (let bad of ["", 42, undefined])
                await rejectsSourceTypeError(ops.loadSvg(bad, 10, 10));
        },
    },
    ...[
        ["garbage", "this is not an svg"],
        ["whitespace", "  \n"],
        ["truncated markup", `<svg ${SVG_NS} width="10" height="10"><rect`],
    ].map(([label, svg]) => ({
        name: `loadSvgImage rejects invalid SVG (${label})`,
        run: async ops => { await assert.rejects(ops.loadSvg(svg, 10, 10)); },
    })),
    {
        name: "loadSvgImage: a 10x10 red rect drawn at 20x20 fills the canvas (no viewBox)",
        run: ops => expectFillsRed(ops, red10),
    },
    {
        name: "loadSvgImage: viewBox only (no width/height) drawn at 20x20 fills the canvas",
        run: ops => expectFillsRed(ops, `<svg ${SVG_NS} viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>`),
    },
    {
        name: "loadSvgImage: no xmlns on the root still renders",
        run: ops => expectFillsRed(ops, `<svg width="10" height="10"><rect width="10" height="10" fill="red"/></svg>`),
    },
    {
        name: "loadSvgImage: px width/height drawn at 20x20 fills the canvas",
        run: ops => expectFillsRed(ops, `<svg ${SVG_NS} width="10px" height="10px" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>`),
    },
    {
        // A 2x2 SVG with its left half red, drawn at 40x40: vectors give a
        // hard edge at x=20; an upscaled 2x2 bitmap would blur ~10px wide.
        name: "loadSvgImage: rasterised crisply at the draw size (no upscaled-bitmap blur)",
        run: async ops =>
        {
            let result = await ops.drawSvg(`<svg ${SVG_NS} width="2" height="2"><rect width="1" height="2" fill="red"/></svg>`, 40, 40);
            expectColorNear(pixelAt(result, 18, 20), RED, 2, "left of edge: ");
            assert.ok(pixelAt(result, 21, 20).a <= 2, `right of edge not transparent (alpha ${pixelAt(result, 21, 20).a})`);
        },
    },
    {
        name: "loadSvgImage: drawn at an offset and size via drawImage",
        run: async ops =>
        {
            let result = await ops.drawSvg(red10, 20, 20, undefined, [10, 10, 10, 10]);
            assert.equal(pixelAt(result, 5, 5).a, 0);
            expectColorNear(pixelAt(result, 15, 15), RED, 2);
        },
    },
    {
        name: "loadSvgImage: unitless stroke-width in style draws 8 wide",
        run: async ops =>
        {
            let result = await ops.drawSvg(strokedBox("stroke-width:8"), 100, 100);
            expectColorNear(pixelAt(result, 12, 50), RED, 2);
            expectColorNear(pixelAt(result, 7, 50), RED, 2);
            assert.equal(pixelAt(result, 20, 50).a, 0, "stroke too wide");
        },
    },
    {
        name: "drawSvg paints the background then the SVG",
        run: async ops =>
        {
            let svg = `<svg ${SVG_NS} width="10" height="10"><rect width="5" height="10" fill="red"/></svg>`;
            let result = await ops.drawSvg(svg, 10, 10, "blue");
            expectColorNear(pixelAt(result, 2, 5), RED, 2);
            expectColorNear(pixelAt(result, 7, 5), BLUE, 2);
            assert.equal([...pixels(result)].length, 100);
        },
    },
    {
        // Tint draws the image onto a backend canvas and returns that canvas
        // as the drawable, so the backend's canvases must be drawImage-able.
        name: "render: svg tint (a backend canvas used as a drawable)",
        run: async ops =>
        {
            let svg = `<svg ${SVG_NS} viewBox="0 0 10 10"><rect width="5" height="10" fill="red"/></svg>`;
            let result = await ops.render({ layers: [{ type: "svg", svg, tint: "#00ff00" }] }, 20, 20, 4);
            expectColorNear(pixelAt(result, 4, 10), { r: 0, g: 255, b: 0, a: 255 }, 2);
            assert.equal(pixelAt(result, 15, 10).a, 0);
        },
    },
    {
        name: "render: returns a Uint8Array for channels 4 and 3 (RGB composited over black)",
        run: async ops =>
        {
            let definition = { layers: [{ type: "fill", color: "rgba(255, 0, 0, 0.5)" }] };
            let rgba = await ops.render(definition, 6, 4, 4);
            assert.ok(rgba.data instanceof Uint8Array, "channels 4: not a Uint8Array");
            assert.deepEqual([rgba.width, rgba.height, rgba.channels, rgba.data.length], [6, 4, 4, 6 * 4 * 4]);
            expectAllPixels(rgba, { r: 255, g: 0, b: 0, a: 128 }, 2);
            let rgb = await ops.render(definition, 6, 4, 3);
            assert.ok(rgb.data instanceof Uint8Array, "channels 3: not a Uint8Array");
            assert.deepEqual([rgb.channels, rgb.data.length], [3, 6 * 4 * 3]);
            expectAllPixels(rgb, { r: 128, g: 0, b: 0 }, 2);
        },
    },
];
