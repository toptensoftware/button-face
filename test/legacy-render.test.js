// convertLegacyDefinition round trips: converted old definitions render as
// expected through render() (see test/legacy.test.js for the pure mapping).

import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render.js";
import { napiBackend } from "../src/backends/napi.js";
import { createSvgResolver } from "../src/resolve.js";
import { convertLegacyDefinition as convert } from "../src/legacy.js";
import { pixelAt, findInkBounds, outlinePixel, expectColorNear, expectAllPixels } from "./helpers.js";

const SIZE = 72;
const RED = { r: 255, g: 0, b: 0 };
const GREY = { r: 0x84, g: 0x84, b: 0x84 };
const BOX = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#848484"/></svg>`;

const draw = (definition, channels = 4) =>
    render(definition, SIZE, SIZE, { backend: napiBackend, resolveSvg: createSvgResolver(), channels });

// Convert an old definition and render it.
const drawOld = (old, channels) => draw(convert(old), channels);

// The old project's test.js definition, and its hand-written layered form.
const OLD_TEST_JS = {
    backColor: "black", svgFile: "#apple-tv", svgForeColor: "#404040", svgTranslate: { y: -7 },
    text: "Hello!", textColor: "white", textVAlign: "bottom", textAlign: "center",
};
const NEW_TEST_JS = {
    layers: [
        { type: "fill", color: "black" },
        { type: "svg", src: "#apple-tv", colors: { "#848484": "#404040" }, translate: { y: -7 } },
        { type: "text", text: "Hello!", color: "white", align: "center", valign: "bottom" },
    ],
};

for (let channels of [3, 4])
{
    test(`old test.js definition renders identically to the hand-written layered one (${channels} channels)`, async () =>
    {
        let [actual, expected] = await Promise.all([drawOld(OLD_TEST_JS, channels), draw(NEW_TEST_JS, channels)]);
        assert.equal(actual.channels, channels);
        assert.deepEqual([actual.width, actual.height], [SIZE, SIZE]);
        assert.deepEqual(actual.data, expected.data);
        // Not trivially empty: the icon recoloured to #404040 and white label ink.
        assert.ok(findInkBounds(actual, { r: 0, g: 0, b: 0, a: 255 }));
    });
}

test("svgForeColor recolours built-ins (#square, #heart)", async () =>
{
    for (let svgFile of ["#square", "#heart"])
    {
        let old = { backColor: "transparent", svgFile };
        expectColorNear(outlinePixel(await drawOld({ ...old, svgForeColor: "red" })), RED, 2, `${svgFile}: `);
        expectColorNear(outlinePixel(await drawOld(old)), GREY, 2, `${svgFile} default: `);
    }
});

test("svgForeColor recolours an inline svgCode grey box", async () =>
{
    expectAllPixels(await drawOld({ svgCode: BOX, svgForeColor: "red" }), { ...RED, a: 255 });
    expectAllPixels(await drawOld({ svgCode: BOX }), { ...GREY, a: 255 });
});

test("backColor shows in the corners", async () =>
{
    let result = await drawOld({ backColor: "blue", svgCode: BOX, svgScale: 0.5 });
    for (let [x, y] of [[0, 0], [SIZE - 1, 0], [0, SIZE - 1], [SIZE - 1, SIZE - 1]])
        expectColorNear(pixelAt(result, x, y), { r: 0, g: 0, b: 255, a: 255 }, 2, `(${x}, ${y}): `);
    expectColorNear(pixelAt(result, SIZE / 2, SIZE / 2), GREY);
});

test("textVAlign bottom puts the label ink near the bottom", async () =>
{
    let result = await drawOld({ backColor: "transparent", text: "Hello!", textVAlign: "bottom" });
    let bounds = findInkBounds(result);
    assert.ok(bounds, "no label ink");
    assert.ok(bounds.top > SIZE / 2, `label top ${bounds.top}`);
    assert.ok(bounds.bottom >= SIZE - 3 - 6 && bounds.bottom < SIZE - 1, `label bottom ${bounds.bottom}`);
    expectColorNear(pixelAt(result, 0, 0), { a: 0 });
});
