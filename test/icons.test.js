// Built-in icon source checks (icons/*.svg). Step 7 adds the generated
// src/icons.js module tests here too.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { drawSvg, inkStats } from "./helpers.js";
import { applyColorMap, findPaintValues } from "../src/recolor.js";

const root = new URL("../", import.meta.url);
const iconsDir = new URL("icons/", root);
const iconNames = readdirSync(iconsDir).filter(f => f.endsWith(".svg")).map(f => f.slice(0, -4)).sort();
const readIcon = name => readFileSync(new URL(`${name}.svg`, iconsDir), "utf8");

// librsvg (old project) render stats of the original icons at 72x72; see
// scripts/build-icon-reference.js.
const reference = JSON.parse(readFileSync(new URL("test/fixtures/icon-reference.json", root), "utf8"));
const SIZE = 72;

// Every `stroke` paint value (attributes, style attributes, <style>).
const strokeValues = svg => findPaintValues(svg).filter(p => p.name == "stroke").map(p => p.value);

// Built-in icons must be filled paths only: some renderers (e.g. Skia via
// @napi-rs/canvas) mishandle strokes (unitless stroke-width in style), so
// strokes are converted to paths with scripts/strokes-to-paths.js.
for (let name of iconNames)
{
    test(`icon ${name} paints no strokes`, () =>
    {
        let painted = strokeValues(readIcon(name)).filter(v => v != "none");
        assert.deepEqual(painted, [], `${name} has stroke paint - run scripts/strokes-to-paths.js`);
    });
}

test("icon reference covers every icon", () =>
{
    assert.deepEqual(Object.keys(reference).sort(), iconNames);
});

// Loose visual confidence check: Skia output of each icon is close to the
// original librsvg output (ink amount, extent and average colour).
for (let name of iconNames)
{
    test(`icon ${name} renders like the librsvg reference`, async () =>
    {
        let actual = inkStats(await drawSvg(readIcon(name), SIZE, SIZE));
        let expected = reference[name];
        let coverageDiff = Math.abs(actual.coverage - expected.coverage);
        assert.ok(coverageDiff <= Math.max(10, expected.coverage * 0.05),
            `coverage ${actual.coverage} vs reference ${expected.coverage}`);
        for (let k of ["left", "top", "right", "bottom"])
        {
            assert.ok(Math.abs(actual.bounds[k] - expected.bounds[k]) <= 1,
                `bounds ${JSON.stringify(actual.bounds)} vs reference ${JSON.stringify(expected.bounds)}`);
        }
        expectColorClose(actual.color, expected.color);
    });
}

function expectColorClose(actual, expected, tolerance = 4)
{
    for (let ch of ["r", "g", "b"])
    {
        assert.ok(Math.abs(actual[ch] - expected[ch]) <= tolerance,
            `colour ${JSON.stringify(actual)} vs expected ${JSON.stringify(expected)}`);
    }
}

// Single-colour icons are entirely #848484, so swapping that key recolours all
// of their ink (guards against stroke->path conversion losing the key colour).
const GREY = { r: 132, g: 132, b: 132 };
for (let name of iconNames.filter(n => JSON.stringify(reference[n].color) == JSON.stringify(GREY)))
{
    test(`icon ${name} recolours via #848484`, async () =>
    {
        let svg = applyColorMap(readIcon(name), { "#848484": "#ff0000" });
        expectColorClose(inkStats(await drawSvg(svg, SIZE, SIZE)).color, { r: 255, g: 0, b: 0 });
    });
}
