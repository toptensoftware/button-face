// Tests for src/svgSize.js: natural SVG size from the root width/height/viewBox,
// and padViewBox.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getSvgSize, parseLength, parseViewBox, padViewBox, getViewBox, prepareSvgImage } from "../src/svgSize.js";
import { getRootAttribute, normalizeStyleLengths } from "../src/recolor.js";
import { icons } from "../src/icons.js";
import { listIcons, readIcon, readFixture } from "./helpers.js";

const iconNames = listIcons();
const materialHome = readFixture("material-home.svg");

const NS = `xmlns="http://www.w3.org/2000/svg"`;
const svg = attrs => `<svg ${NS} ${attrs}><rect width="1" height="1"/></svg>`;

describe("parseLength", () =>
{
    test("unitless and px are user units", () =>
    {
        assert.equal(parseLength("24"), 24);
        assert.equal(parseLength("24px"), 24);
        assert.equal(parseLength(" 12.5 "), 12.5);
        assert.equal(parseLength(".5"), 0.5);
        assert.equal(parseLength("1e2"), 100);
        assert.equal(parseLength("24PX"), 24);
    });

    test("absolute units convert at 96 px per inch", () =>
    {
        assert.equal(parseLength("1in"), 96);
        assert.equal(parseLength("72pt"), 96);
        assert.equal(parseLength("1pc"), 16);
        assert.ok(Math.abs(parseLength("2.54cm") - 96) < 1e-9);
        assert.ok(Math.abs(parseLength("25.4mm") - 96) < 1e-9);
    });

    test("percentages, relative units, garbage, zero and negatives are null", () =>
    {
        for (let v of ["100%", "1em", "2ex", "auto", "", "abc", "0", "-5", "12 px", undefined, null])
            assert.equal(parseLength(v), null, String(v));
    });
});

describe("parseViewBox", () =>
{
    test("parses whitespace and comma separated values, negative origins", () =>
    {
        assert.deepEqual(parseViewBox("0 0 19.05 19.05"), { x: 0, y: 0, width: 19.05, height: 19.05 });
        assert.deepEqual(parseViewBox("0 -960 960 960"), { x: 0, y: -960, width: 960, height: 960 });
        assert.deepEqual(parseViewBox(" -144,-1104, 1248 1248 "), { x: -144, y: -1104, width: 1248, height: 1248 });
    });

    test("invalid viewBoxes are null", () =>
    {
        for (let v of ["0 0 10", "0 0 10 10 10", "0 0 0 10", "0 0 10 -1", "a b c d", "", undefined])
            assert.equal(parseViewBox(v), null, String(v));
    });
});

describe("getSvgSize", () =>
{
    test("width/height attributes, unitless or px", () =>
    {
        assert.deepEqual(getSvgSize(svg(`width="24" height="48"`)), { width: 24, height: 48 });
        assert.deepEqual(getSvgSize(svg(`width="24px" height="48px"`)), { width: 24, height: 48 });
        assert.deepEqual(getSvgSize(svg(`width="24px" height="48"`)), { width: 24, height: 48 });
    });

    test("width/height win over the viewBox", () =>
    {
        assert.deepEqual(getSvgSize(svg(`width="72" height="72" viewBox="0 0 19.05 19.05"`)), { width: 72, height: 72 });
    });

    test("absolute units", () =>
    {
        assert.deepEqual(getSvgSize(svg(`width="1in" height="72pt"`)), { width: 96, height: 96 });
    });

    test("negative viewBox origin with width/height (Material Symbols format)", () =>
    {
        assert.deepEqual(getSvgSize(materialHome), { width: 24, height: 24 });
        assert.deepEqual(getSvgSize(svg(`viewBox="0 -960 960 960" width="24"`)), { width: 24, height: 24 });
    });

    test("falls back to the viewBox size", () =>
    {
        assert.deepEqual(getSvgSize(svg(`viewBox="-144 -1104 1248 624"`)), { width: 1248, height: 624 });
    });

    test("one dimension missing (or %) takes the viewBox aspect ratio", () =>
    {
        assert.deepEqual(getSvgSize(svg(`width="48" viewBox="0 0 20 10"`)), { width: 48, height: 24 });
        assert.deepEqual(getSvgSize(svg(`height="48" viewBox="0 0 20 10"`)), { width: 96, height: 48 });
        assert.deepEqual(getSvgSize(svg(`width="100%" height="30" viewBox="0 0 20 10"`)), { width: 60, height: 30 });
    });

    test("no usable size defaults to 300x150 per missing dimension", () =>
    {
        assert.deepEqual(getSvgSize(svg(``)), { width: 300, height: 150 });
        assert.deepEqual(getSvgSize(svg(`width="100%" height="100%"`)), { width: 300, height: 150 });
        assert.deepEqual(getSvgSize(svg(`width="40"`)), { width: 40, height: 150 });
        assert.deepEqual(getSvgSize(svg(`viewBox="0 0 0 0" height="20"`)), { width: 300, height: 20 });
    });

    test("multi-line root tags, prolog, comments and nested <svg> are handled", () =>
    {
        let s = `<?xml version="1.0"?>\n<!-- <svg width="1" height="1"> -->\n<svg\n   width="72"\n   height='36'\n   ${NS}>`
            + `<svg width="5" height="5"/></svg>`;
        assert.deepEqual(getSvgSize(s), { width: 72, height: 36 });
    });

    test("ignores look-alike attributes (data-width, stroke-width)", () =>
    {
        assert.deepEqual(getSvgSize(svg(`data-width="10" stroke-width="2" viewBox="0 0 30 15"`)), { width: 30, height: 15 });
    });

    test("throws when the root element isn't <svg>", () =>
    {
        assert.throws(() => getSvgSize(`<html width="10" height="10"/>`), /svg/);
        assert.throws(() => getSvgSize(``), /svg/);
    });

    test("built-in icons: both families", () =>
    {
        assert.deepEqual(getSvgSize(readIcon("add")), { width: 24, height: 24 });
        assert.deepEqual(getSvgSize(readIcon("home")), { width: 72, height: 72 });
        for (let name of iconNames)
        {
            let { width, height } = getSvgSize(readIcon(name));
            assert.ok(width == height && (width == 24 || width == 72), `${name}: ${width}x${height}`);
        }
    });
});

describe("padViewBox", () =>
{
    test("pads the viewBox by a fraction of its size per side (Material -> built-in padding)", () =>
    {
        let padded = padViewBox(materialHome, 0.15);
        assert.equal(getRootAttribute(padded, "viewBox"), "-144 -1104 1248 1248");
        // Width/height (the natural size) are unchanged; the glyph shrinks instead.
        assert.deepEqual(getSvgSize(padded), { width: 24, height: 24 });
        // Nothing else changes.
        assert.equal(padded.replace(`viewBox="-144 -1104 1248 1248"`, `viewBox="0 -960 960 960"`), materialHome);
    });

    test("non-square viewBox pads each axis by its own size", () =>
    {
        let padded = padViewBox(svg(`viewBox="10 20 100 50"`), 0.1);
        assert.equal(getRootAttribute(padded, "viewBox"), "0 15 120 60");
    });

    test("negative fraction crops; results are free of float noise", () =>
    {
        assert.equal(getRootAttribute(padViewBox(svg(`viewBox="0 0 19.05 19.05"`), 0.1), "viewBox"), "-1.905 -1.905 22.86 22.86");
        assert.equal(getRootAttribute(padViewBox(svg(`viewBox="0 0 100 100"`), -0.25), "viewBox"), "25 25 50 50");
    });

    test("fraction 0 / missing returns the SVG unchanged", () =>
    {
        assert.equal(padViewBox(materialHome, 0), materialHome);
        assert.equal(padViewBox(materialHome), materialHome);
    });

    test("without a viewBox one is created from the natural size", () =>
    {
        let padded = padViewBox(svg(`width="20" height="10"`), 0.5);
        assert.equal(getRootAttribute(padded, "viewBox"), "-10 -5 40 20");
        assert.deepEqual(getSvgSize(padded), { width: 20, height: 10 });
    });

    test("fraction <= -0.5 (nothing left) throws", () =>
    {
        assert.throws(() => padViewBox(materialHome, -0.5), RangeError);
    });
});

describe("getViewBox", () =>
{
    test("returns the parsed root viewBox when valid", () =>
    {
        assert.deepEqual(getViewBox(svg(`width="24" height="24" viewBox="0 -960 960 960"`)), { x: 0, y: -960, width: 960, height: 960 });
    });

    test("without a viewBox falls back to the natural size at the origin", () =>
    {
        assert.deepEqual(getViewBox(svg(`width="20" height="10"`)), { x: 0, y: 0, width: 20, height: 10 });
    });

    test("no viewBox and no size -> 300x150", () =>
    {
        assert.deepEqual(getViewBox(svg(``)), { x: 0, y: 0, width: 300, height: 150 });
    });

    test("an invalid viewBox is treated as missing", () =>
    {
        assert.deepEqual(getViewBox(svg(`width="40" height="30" viewBox="0 0 0 10"`)), { x: 0, y: 0, width: 40, height: 30 });
        assert.deepEqual(getViewBox(svg(`width="40" height="30" viewBox="a b c d"`)), { x: 0, y: 0, width: 40, height: 30 });
    });

    test("throws when the root element isn't <svg>", () =>
    {
        assert.throws(() => getViewBox(`<html width="10" height="10"/>`), /svg/);
    });
});

describe("prepareSvgImage", () =>
{
    test("stamps width/height, replacing px and % values", () =>
    {
        let out = prepareSvgImage(svg(`width="24px" height="100%" viewBox="0 0 24 24"`), 48, 36);
        assert.equal(getRootAttribute(out, "width"), "48");
        assert.equal(getRootAttribute(out, "height"), "36");
        assert.equal(getRootAttribute(out, "viewBox"), "0 0 24 24");
    });

    test("adds a viewBox from the original natural size when missing (before stamping)", () =>
    {
        let out = prepareSvgImage(svg(`width="10" height="5"`), 40, 20);
        assert.equal(getRootAttribute(out, "viewBox"), "0 0 10 5");
        assert.deepEqual(getSvgSize(out), { width: 40, height: 20 });
    });

    test("no size and no viewBox -> viewBox from the 300x150 default", () =>
    {
        assert.equal(getRootAttribute(prepareSvgImage(svg(``), 60, 30), "viewBox"), "0 0 300 150");
    });

    test("an invalid viewBox is replaced by one from the natural size", () =>
    {
        let out = prepareSvgImage(svg(`width="8" height="4" viewBox="0 0 0 0"`), 16, 8);
        assert.equal(getRootAttribute(out, "viewBox"), "0 0 8 4");
    });

    test("a valid viewBox is kept unchanged", () =>
    {
        let out = prepareSvgImage(svg(`viewBox="-144 -1104 1248 1248"`), 72, 72);
        assert.equal(getRootAttribute(out, "viewBox"), "-144 -1104 1248 1248");
    });

    test("adds xmlns only when missing", () =>
    {
        let bare = `<svg width="10" height="10"><rect width="10" height="10"/></svg>`;
        assert.equal(getRootAttribute(prepareSvgImage(bare, 20, 20), "xmlns"), "http://www.w3.org/2000/svg");
        let out = prepareSvgImage(svg(`width="10" height="10"`), 20, 20);
        assert.equal(out.split("xmlns=").length - 1, 1);
    });

    test("applies normalizeStyleLengths", () =>
    {
        let s = `<svg ${NS} width="10" height="10" viewBox="0 0 10 10"><path style="stroke-width:0.7" d="M0 0L10 10"/></svg>`;
        let out = prepareSvgImage(s, 10, 10);
        assert.match(out, /stroke-width:0\.7px/);
        assert.equal(out, normalizeStyleLengths(out));
    });

    test("nested <svg> elements are untouched", () =>
    {
        let s = `<svg ${NS} width="10" height="10"><svg width="5" height="5"><rect width="5" height="5"/></svg></svg>`;
        let out = prepareSvgImage(s, 30, 30);
        assert.match(out, /<svg width="5" height="5"><rect/);
        assert.equal(getRootAttribute(out, "width"), "30");
    });

    test("built-in icon markup keeps its viewBox", () =>
    {
        let out = prepareSvgImage(icons.heart, 96, 96);
        assert.equal(getRootAttribute(out, "viewBox"), getRootAttribute(icons.heart, "viewBox"));
        assert.deepEqual(getSvgSize(out), { width: 96, height: 96 });
    });

    test("throws when the root element isn't <svg>", () =>
    {
        assert.throws(() => prepareSvgImage(`<html/>`, 10, 10), /svg/);
        assert.throws(() => prepareSvgImage(``, 10, 10), /svg/);
    });
});
