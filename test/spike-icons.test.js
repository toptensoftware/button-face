// Plan step 3 spike: verify Skia (@napi-rs/canvas) renders the built-in icons
// and the SVG features the renderer relies on. These become icon render tests
// later (merged/renamed in steps 10-12).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { drawSvg, pixelAt, pixels, findInkBounds, expectColorNear } from "./helpers.js";

const root = new URL("../", import.meta.url);
const iconsDir = new URL("icons/", root);
const iconNames = readdirSync(iconsDir).filter(f => f.endsWith(".svg")).map(f => f.slice(0, -4)).sort();
const readIcon = name => readFileSync(new URL(`${name}.svg`, iconsDir), "utf8");
const materialHome = readFileSync(new URL("test/fixtures/material-home.svg", root), "utf8");

const GREY = { r: 0x84, g: 0x84, b: 0x84 };
const RED = { r: 255, g: 0, b: 0 };

// Spike-local stand-in for step 5's setRootAttribute (one-line root tags only).
const withRootAttrs = (svg, attrs) => svg.replace("<svg ", `<svg ${attrs} `);

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

for (let name of ["square", "circle"])
{
    test(`icon ${name} outline is #848484`, async () =>
    {
        // Both are outlines (hollow), so sample the most opaque pixel on the
        // left half of the middle row. The outline is ~2.6px wide, so it may
        // not cover any pixel fully.
        let result = await drawSvg(readIcon(name), 72, 72);
        let best = pixelAt(result, 0, 36);
        for (let x = 1; x < 36; x++)
        {
            let p = pixelAt(result, x, 36);
            if (p.a > best.a)
                best = p;
        }
        assert.ok(best.a >= 200, `outline too faint on the middle row (alpha ${best.a})`);
        expectColorNear(best, GREY, 2);
    });
}

test("currentColor paint resolves to root color attribute", async () =>
{
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" color="red"><rect width="10" height="10" fill="currentColor"/></svg>`;
    let result = await drawSvg(svg, 20, 20);
    expectColorNear(pixelAt(result, 10, 10), { ...RED, a: 255 });
});

test("root fill=currentColor is inherited by unpainted paths", async () =>
{
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" color="red"><path d="M0 0h10v10H0z"/></svg>`;
    let result = await drawSvg(svg, 20, 20);
    expectColorNear(pixelAt(result, 10, 10), { ...RED, a: 255 });
});

test("material icon with root fill=currentColor + color renders red", async () =>
{
    let result = await drawSvg(withRootAttrs(materialHome, `fill="currentColor" color="red"`), 72, 72);
    let ink = opaquePixels(result);
    assert.ok(ink.length > 100, "too little ink");
    for (let p of ink)
        expectColorNear(p, RED, 2);
});

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

test("hdd keeps its red circle", async () =>
{
    let result = await drawSvg(readIcon("hdd"), 72, 72);
    let reds = opaquePixels(result).filter(p => p.r > 200 && p.g < 40 && p.b < 40);
    assert.ok(reds.length > 100, `only ${reds.length} red pixels`);
});
