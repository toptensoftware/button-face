// Plan step 3 spike: verify Skia (@napi-rs/canvas) renders the built-in icons
// and the SVG features the renderer relies on. These become icon render tests
// later (merged/renamed in steps 10-12).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { drawSvg, pixels, findInkBounds, expectColorNear } from "./helpers.js";

const root = new URL("../", import.meta.url);
const iconsDir = new URL("icons/", root);
const iconNames = readdirSync(iconsDir).filter(f => f.endsWith(".svg")).map(f => f.slice(0, -4)).sort();
const readIcon = name => readFileSync(new URL(`${name}.svg`, iconsDir), "utf8");
const materialHome = readFileSync(new URL("test/fixtures/material-home.svg", root), "utf8");

// Opaque pixels only
const opaquePixels = result => [...pixels(result)].map(([, , p]) => p).filter(p => p.a == 255);

test("all built-in icons are present", () =>
{
    // The old project has 42 icons (the plan's "45" was a miscount).
    assert.equal(iconNames.length, 42);
    for (let name of ["add", "hdd", "steam", "apple-tv", "square", "circle", "volume-up"])
        assert.ok(iconNames.includes(name), name);
});

for (let name of iconNames)
{
    test(`icon ${name} decodes and draws ink at 72x72`, async () =>
    {
        let result = await drawSvg(readIcon(name), 72, 72);
        assert.ok(findInkBounds(result), `${name} has no visible pixels`);
    });
}

// The #square/#circle colour, currentColor / inherited root fill and
// material-icon-recolour spike tests moved to layers-svg.test.js (step 11),
// where they run through the svg layer.

test("material icon without fill renders black (implicit default)", async () =>
{
    let result = await drawSvg(materialHome, 72, 72);
    let ink = opaquePixels(result);
    assert.ok(ink.length > 100);
    for (let p of ink)
        expectColorNear(p, { r: 0, g: 0, b: 0 }, 2);
});

// The home path spans x 160..800, y -840..-120 in viewBox units.
function expectedBounds(viewBox, size)
{
    let [vx, vy, vw, vh] = viewBox;
    return {
        left: (160 - vx) / vw * size,
        right: (800 - vx) / vw * size,
        top: (-840 - vy) / vh * size,
        bottom: (-120 - vy) / vh * size,
    };
}

function expectBoundsNear(actual, expected, tolerance = 2)
{
    for (let k of ["left", "top", "right", "bottom"])
    {
        assert.ok(Math.abs(actual[k] - expected[k]) <= tolerance,
            `${k}: ${actual[k]} vs expected ${expected[k].toFixed(1)} (${JSON.stringify(actual)})`);
    }
}

test("negative viewBox origin (0 -960 960 960) positions correctly", async () =>
{
    let result = await drawSvg(materialHome, 72, 72);
    expectBoundsNear(findInkBounds(result), expectedBounds([0, -960, 960, 960], 72));
});

test("padded viewBox (-144 -1104 1248 1248) positions correctly", async () =>
{
    let svg = materialHome.replace(`viewBox="0 -960 960 960"`, `viewBox="-144 -1104 1248 1248"`);
    assert.notEqual(svg, materialHome);
    let result = await drawSvg(svg, 72, 72);
    expectBoundsNear(findInkBounds(result), expectedBounds([-144, -1104, 1248, 1248], 72));
});

const distinctColours = result => new Set(opaquePixels(result).map(p => `${p.r},${p.g},${p.b}`));

test("icon steam gradient (xlink:href, userSpaceOnUse) produces non-uniform colour", async () =>
{
    let result = await drawSvg(readIcon("steam"), 72, 72);
    let size = distinctColours(result).size;
    assert.ok(size > 20, `only ${size} distinct opaque colours`);
});

test("icon apple-tv is uniform #848484 (style fill overrides its gradient fill attrs)", async () =>
{
    // Each `fill="url(#SVGID_n_)"` element also has `style="fill:#848484"`,
    // and style wins over presentation attributes - librsvg renders it the same.
    let result = await drawSvg(readIcon("apple-tv"), 72, 72);
    assert.deepEqual([...distinctColours(result)], ["132,132,132"]);
});

// The Skia unitless stroke-width quirk test moved to backend.test.js (step 8).
// "hdd keeps its red" moved to layers-svg.test.js (step 11).
