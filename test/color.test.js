// Plan step 4: CSS colour parsing / normalisation (src/color.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, colorsEqual, formatColor, namedColors } from "../src/color.js";
import { drawSvg, pixelAt, expectColorNear } from "./helpers.js";

const EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`;

// Paint a 1x1 canvas with `css` (via canvas fillStyle) and read the pixel back.
const canvasColor = async css => pixelAt(await drawSvg(EMPTY_SVG, 1, 1, css), 0, 0);

// parseColor's alpha is 0..1, canvas pixels are 0..255
const toPixel = c => ({ r: c.r, g: c.g, b: c.b, a: Math.round(c.a * 255) });

test("parseColor: hex forms, any case", () =>
{
    assert.deepEqual(parseColor("#848484"), { r: 132, g: 132, b: 132, a: 1 });
    assert.deepEqual(parseColor("#ABCDEF"), { r: 0xab, g: 0xcd, b: 0xef, a: 1 });
    assert.deepEqual(parseColor("#f00"), { r: 255, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor("#F00"), { r: 255, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor("#f008"), { r: 255, g: 0, b: 0, a: 0x88 / 255 });
    assert.deepEqual(parseColor("#848484FF"), { r: 132, g: 132, b: 132, a: 1 });
    assert.deepEqual(parseColor("#ff000080"), { r: 255, g: 0, b: 0, a: 0x80 / 255 });
    assert.deepEqual(parseColor("  #848484 "), { r: 132, g: 132, b: 132, a: 1 });
});

test("parseColor: invalid hex is null", () =>
{
    for (let s of ["#", "#12", "#12345", "#1234567", "#123456789", "#ggg", "848484", "#84 84 84"])
        assert.equal(parseColor(s), null, s);
});

test("parseColor: rgb()/rgba() comma syntax", () =>
{
    assert.deepEqual(parseColor("rgb(132,132,132)"), { r: 132, g: 132, b: 132, a: 1 });
    assert.deepEqual(parseColor("rgb( 1 , 2 , 3 )"), { r: 1, g: 2, b: 3, a: 1 });
    assert.deepEqual(parseColor("rgba(255, 0, 0, 0.5)"), { r: 255, g: 0, b: 0, a: 0.5 });
    assert.deepEqual(parseColor("RGBA(255, 0, 0, .25)"), { r: 255, g: 0, b: 0, a: 0.25 });
    assert.deepEqual(parseColor("rgba(255, 0, 0, 50%)"), { r: 255, g: 0, b: 0, a: 0.5 });
    // rgb() and rgba() are aliases (CSS Color 4)
    assert.deepEqual(parseColor("rgb(255, 0, 0, 0.5)"), { r: 255, g: 0, b: 0, a: 0.5 });
    assert.deepEqual(parseColor("rgba(255, 0, 0)"), { r: 255, g: 0, b: 0, a: 1 });
});

test("parseColor: rgb() space syntax, / alpha, percentages, clamping", () =>
{
    assert.deepEqual(parseColor("rgb(132 132 132)"), { r: 132, g: 132, b: 132, a: 1 });
    assert.deepEqual(parseColor("rgb(255 0 0 / 0.5)"), { r: 255, g: 0, b: 0, a: 0.5 });
    assert.deepEqual(parseColor("rgb(255 0 0/25%)"), { r: 255, g: 0, b: 0, a: 0.25 });
    assert.deepEqual(parseColor("rgb(100%, 0%, 50%)"), { r: 255, g: 0, b: 128, a: 1 });
    assert.deepEqual(parseColor("rgb(100% 0% 50% / 1)"), { r: 255, g: 0, b: 128, a: 1 });
    assert.deepEqual(parseColor("rgb(127.6, 0, 0)"), { r: 128, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor("rgb(300, -5, 0, 2)"), { r: 255, g: 0, b: 0, a: 1 });
});

test("parseColor: malformed rgb() is null", () =>
{
    for (let s of ["rgb()", "rgb(1,2)", "rgb(1,2,3,4,5)", "rgb(1 2 3 4)", "rgb(1, 2 3)",
        "rgb(1 2 3 / )", "rgb(a, b, c)", "rgb(1,2,3", "rgb 1,2,3", "rgb(1,2,3) x"])
        assert.equal(parseColor(s), null, s);
});

test("parseColor: hsl()/hsla()", () =>
{
    assert.deepEqual(parseColor("hsl(0, 100%, 50%)"), { r: 255, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor("hsl(120 100% 50%)"), { r: 0, g: 255, b: 0, a: 1 });
    assert.deepEqual(parseColor("hsl(240deg, 100%, 50%)"), { r: 0, g: 0, b: 255, a: 1 });
    assert.deepEqual(parseColor("hsl(0.5turn 100% 25%)"), { r: 0, g: 128, b: 128, a: 1 });
    assert.deepEqual(parseColor("hsla(0, 0%, 51.76%, 0.5)"), { r: 132, g: 132, b: 132, a: 0.5 });
    assert.deepEqual(parseColor("hsl(0 0% 100% / 25%)"), { r: 255, g: 255, b: 255, a: 0.25 });
    assert.deepEqual(parseColor("hsl(-120, 100%, 50%)"), { r: 0, g: 0, b: 255, a: 1 });
    assert.equal(parseColor("hsl(0, 100, 50)"), null);
});

test("parseColor: named colours and transparent", () =>
{
    assert.equal(Object.keys(namedColors).length, 148);
    assert.ok(Object.isFrozen(namedColors));
    assert.deepEqual(parseColor("red"), { r: 255, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor("Red"), { r: 255, g: 0, b: 0, a: 1 });
    assert.deepEqual(parseColor("rebeccapurple"), { r: 0x66, g: 0x33, b: 0x99, a: 1 });
    assert.deepEqual(parseColor("grey"), parseColor("gray"));
    assert.deepEqual(parseColor("LightGoldenrodYellow"), { r: 0xfa, g: 0xfa, b: 0xd2, a: 1 });
    assert.deepEqual(parseColor("transparent"), { r: 0, g: 0, b: 0, a: 0 });
});

test("parseColor: non-colours are null", () =>
{
    for (let s of ["none", "currentColor", "currentcolor", "url(#x)", "url(#A) red", "inherit",
        "", "  ", "garbage", "redd", "toString", "constructor", "__proto__", null, undefined, 42, {}])
        assert.equal(parseColor(s), null, String(s));
});

test("parseColor: every named colour matches canvas (Skia)", async () =>
{
    for (let [name, hex] of Object.entries(namedColors))
    {
        assert.match(hex, /^#[0-9a-f]{6}$/, name);
        expectColorNear(await canvasColor(name), toPixel(parseColor(name)), 0, `${name}: `);
    }
});

test("parseColor: functional forms match canvas (Skia)", async () =>
{
    for (let css of ["rgb(132,132,132)", "rgba(10, 20, 30, 0.5)", "rgb(100%, 0%, 50%)",
        "hsl(30, 100%, 50%)", "hsl(200, 50%, 40%)", "hsla(300, 75%, 60%, 0.75)", "hsl(90, 20%, 80%)"])
    {
        expectColorNear(await canvasColor(css), toPixel(parseColor(css)), 1, `${css}: `);
    }
});

test("colorsEqual compares RGB + alpha after normalisation", () =>
{
    assert.ok(colorsEqual("#848484", "#848484FF"));
    assert.ok(colorsEqual("#848484", "rgb(132, 132, 132)"));
    assert.ok(colorsEqual("#848484", parseColor("rgb(132 132 132 / 1)")));
    assert.ok(colorsEqual("red", "#F00"));
    assert.ok(colorsEqual("#ff000080", "rgba(255, 0, 0, 0.5)"), "alpha compared at 8-bit precision");
    assert.ok(colorsEqual("transparent", "rgba(0,0,0,0)"));
    assert.ok(!colorsEqual("#848484", "#848485"));
    assert.ok(!colorsEqual("#848484", "#84848480"));
    assert.ok(!colorsEqual("red", "rgba(255, 0, 0, 0.9)"));
    assert.ok(!colorsEqual("none", "none"), "non-colours never match");
    assert.ok(!colorsEqual("red", "currentColor"));
    assert.ok(!colorsEqual(null, null));
});

test("formatColor: #rrggbb when opaque, rgba() otherwise", () =>
{
    assert.equal(formatColor({ r: 132, g: 132, b: 132, a: 1 }), "#848484");
    assert.equal(formatColor({ r: 255, g: 0, b: 10 }), "#ff000a");
    assert.equal(formatColor({ r: 255, g: 0, b: 0, a: 0.5 }), "rgba(255, 0, 0, 0.5)");
    assert.equal(formatColor({ r: 0, g: 0, b: 0, a: 0 }), "rgba(0, 0, 0, 0)");
    assert.equal(formatColor(parseColor("#ff000080")), "rgba(255, 0, 0, 0.502)");
});

test("formatColor round-trips through parseColor", () =>
{
    for (let css of ["#848484", "red", "hsl(30, 100%, 50%)", "rgba(1, 2, 3, 0.25)", "transparent"])
        assert.ok(colorsEqual(parseColor(formatColor(parseColor(css))), css), css);
});
