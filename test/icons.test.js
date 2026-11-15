// Built-in icons: source checks (icons/*.svg) and the generated src/icons.js
// module (scripts/build-icons.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { drawSvg, inkStats } from "./helpers.js";
import { findPaintValues, mapPaintValues, setRootColor } from "../src/recolor.js";
import { colorsEqual } from "../src/color.js";
import { icons } from "../src/icons.js";
import { generateIconsModule } from "../scripts/build-icons.js";

const root = new URL("../", import.meta.url);
const iconsDir = new URL("icons/", root);
const iconNames = readdirSync(iconsDir).filter(f => f.endsWith(".svg")).map(f => f.slice(0, -4)).sort();
// LF-normalised like the generator (git stores LF, but an old checkout may be CRLF).
const readIcon = name => readFileSync(new URL(`${name}.svg`, iconsDir), "utf8").replace(/\r\n?/g, "\n");

// librsvg (old project) render stats of the original icons at 72x72; see
// scripts/build-icon-reference.js.
const reference = JSON.parse(readFileSync(new URL("test/fixtures/icon-reference.json", root), "utf8"));
const SIZE = 72;
const KEY = "#848484"; // recolour key in icons/*.svg; the old default colour

const paintValues = (svg, name) => findPaintValues(svg).filter(p => p.name == name).map(p => p.value);

// ---- Sources ---------------------------------------------------------------

// Built-in icons must be filled paths only: some renderers (e.g. Skia via
// @napi-rs/canvas) mishandle strokes (unitless stroke-width in style), so
// strokes are converted to paths with scripts/strokes-to-paths.js.
for (let name of iconNames)
{
    test(`icon ${name} paints no strokes`, () =>
    {
        let painted = paintValues(readIcon(name), "stroke").filter(v => v != "none");
        assert.deepEqual(painted, [], `${name} has stroke paint - run scripts/strokes-to-paths.js`);
    });
}

test("icon reference covers every icon", () =>
{
    assert.deepEqual(Object.keys(reference).sort(), iconNames);
});

// ---- Generated module (src/icons.js) ----------------------------------------

test("src/icons.js is up to date (run `npm run build:icons`)", () =>
{
    let checkedIn = readFileSync(new URL("src/icons.js", root), "utf8");
    assert.ok(checkedIn === generateIconsModule(), "src/icons.js is stale - run `npm run build:icons`");
});

test("generated module is marked generated and imports nothing", () =>
{
    let code = generateIconsModule();
    assert.match(code.split("\n")[0], /GENERATED - do not edit/);
    assert.doesNotMatch(code, /^\s*import\b/m);
    assert.doesNotMatch(code, /\r/);
});

test("icons has one entry per icons/*.svg, in sorted order, and is frozen", () =>
{
    assert.equal(iconNames.length, 42);
    assert.deepEqual(Object.keys(icons), iconNames);
    assert.ok(Object.isFrozen(icons));
});

for (let name of iconNames)
{
    test(`icons.${name} uses currentColor instead of ${KEY}`, () =>
    {
        let paints = findPaintValues(icons[name]);
        assert.ok(!paints.some(p => colorsEqual(p.value, KEY)), `${name} still paints ${KEY}`);
        assert.ok(paints.some(p => p.value == "currentColor"), `${name} has no currentColor`);
    });

    // Fixed colours (hdd's red, steam/apple-tv gradient stops, playstation's
    // logo colours) and everything else survive: only the key changes, plus
    // `color` values (inert in the sources, which never use currentColor)
    // become `inherit` so the root `color` reaches every currentColor paint.
    test(`icons.${name} differs from the source only at ${KEY} and color paints`, () =>
    {
        let source = readIcon(name);
        assert.ok(!findPaintValues(source).some(p => p.value.toLowerCase() == "currentcolor"));
        let expected = findPaintValues(source).map(p => ({
            ...p,
            value: p.name == "color" ? "inherit" : colorsEqual(p.value, KEY) ? "currentColor" : p.value,
        }));
        assert.deepEqual(findPaintValues(icons[name]), expected);
        let stripPaint = svg => mapPaintValues(svg, () => "");
        assert.equal(stripPaint(icons[name]), stripPaint(source));
    });
}

test("generator neutralises Inkscape's element-level color (e.g. ok.svg color:#000000)", () =>
{
    assert.match(readIcon("ok"), /color:#000000;/);
    assert.ok(paintValues(icons.ok, "color").length > 0);
    assert.ok(paintValues(icons.ok, "color").every(v => v == "inherit"));
});

test("fixed-colour exceptions are preserved", () =>
{
    assert.ok(paintValues(icons.hdd, "fill").includes("#ff0000"));
    assert.deepEqual(paintValues(icons.steam, "stop-color"), paintValues(readIcon("steam"), "stop-color"));
    assert.ok(paintValues(icons.steam, "stop-color").length > 0);
    assert.match(icons.steam, /fill="url\(#A\)"/);
    assert.deepEqual(paintValues(icons["apple-tv"], "stop-color"), paintValues(readIcon("apple-tv"), "stop-color"));
    assert.ok(paintValues(icons["apple-tv"], "stop-color").length > 0);
    for (let c of ["#de0029", "#f3c202", "#00aa9e", "#326db3"])
        assert.ok(findPaintValues(icons.playstation).some(p => colorsEqual(p.value, c)), `playstation lost ${c}`);
});

// ---- Rendering ---------------------------------------------------------------

function expectColorClose(actual, expected, tolerance = 4)
{
    for (let ch of ["r", "g", "b"])
    {
        assert.ok(Math.abs(actual[ch] - expected[ch]) <= tolerance,
            `colour ${JSON.stringify(actual)} vs expected ${JSON.stringify(expected)}`);
    }
}

// Loose visual confidence check: the generated icon, coloured with the old
// default via root `color`, renders in Skia close to the original librsvg
// output (ink amount, extent and average colour).
for (let name of iconNames)
{
    test(`icons.${name} with color ${KEY} renders like the librsvg reference`, async () =>
    {
        let actual = inkStats(await drawSvg(setRootColor(icons[name], KEY), SIZE, SIZE));
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

// Single-colour icons are entirely #848484 in the original, so root `color`
// recolours all of their ink (guards against the key being lost, e.g. by the
// stroke->path conversion).
const GREY = { r: 132, g: 132, b: 132 };
for (let name of iconNames.filter(n => JSON.stringify(reference[n].color) == JSON.stringify(GREY)))
{
    test(`icons.${name} recolours via root color`, async () =>
    {
        let svg = setRootColor(icons[name], "#ff0000");
        expectColorClose(inkStats(await drawSvg(svg, SIZE, SIZE)).color, { r: 255, g: 0, b: 0 });
    });
}
