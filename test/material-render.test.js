// Material Symbols (`@name?...`) rendered end to end through the svg layer,
// with a fake fetch serving checked-in fixtures (no network).

import { test } from "node:test";
import assert from "node:assert/strict";
import * as node from "../src/node.js";
import { materialIconUrl, parseMaterialRef } from "../src/material.js";
import { fakeFetch, readFixture, opaquePixels, findInkBounds, expectColorNear } from "./helpers.js";

const GREY = { r: 0x84, g: 0x84, b: 0x84 };
const RED = { r: 255, g: 0, b: 0 };

// Fixture served for each ref (raw gstatic form, no fill).
const { fetch, calls } = fakeFetch({
    [materialIconUrl(parseMaterialRef("home"))]: readFixture("material-home.svg"),
    [materialIconUrl(parseMaterialRef("add?weight=200"))]: readFixture("material-add-wght200.svg"),
});

// A Node resolver whose `@` downloads through the fake fetch, memory cache only.
const resolverFor = (material = {}) => node.createNodeSvgResolver({ material: { fetch, cache: null, ...material } });
const resolveSvg = resolverFor();

const draw = (layer, options = {}) =>
    node.render({ layers: [{ type: "svg", ...layer }] }, 72, 72, { resolveSvg, channels: 4, ...options });

/** Assert there is at least `min` opaque ink pixels and all of it is `color`. */
function expectInk(result, color, min = 100)
{
    let ink = opaquePixels(result);
    assert.ok(ink.length >= min, `too little ink (${ink.length})`);
    for (let p of ink)
        expectColorNear(p, color, 2);
}

test("@home with color: red renders red ink only", async () =>
{
    expectInk(await draw({ src: "@home", color: "red" }), RED);
    assert.ok(calls.length > 0, "fake fetch was not used");
});

test("@home with no colour renders #848484 ink", async () =>
{
    expectInk(await draw({ src: "@home" }), GREY);
});

test("@home with colors { #848484: red } matches color: red pixel for pixel", async () =>
{
    let byColor = await draw({ src: "@home", color: "red" });
    let byMap = await draw({ src: "@home", colors: { "#848484": "red" } });
    assert.deepEqual(byMap.data, byColor.data);
});

test("@add?weight=200 renders identically to the built-in #add", async () =>
{
    let material = await draw({ src: "@add?weight=200", color: "red" });
    let builtin = await draw({ src: "#add", color: "red" });
    expectInk(material, RED, 50); // thin glyph: ~100 fully opaque pixels
    assert.deepEqual(material.data, builtin.data);
});

test("pad: 0 renders the icon larger than the default padding", async () =>
{
    let padded = findInkBounds(await draw({ src: "@home" }));
    let unpadded = findInkBounds(await draw({ src: "@home" }, { resolveSvg: resolverFor({ pad: 0 }) }));
    let size = b => (b.right - b.left) * (b.bottom - b.top);
    assert.ok(size(unpadded) > size(padded) * 1.4, `pad 0 ${JSON.stringify(unpadded)} vs default ${JSON.stringify(padded)}`);
});
