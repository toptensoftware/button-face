// The svg layer (src/layers/svg.js) - the old project's
// svgCode/svgFile, svgText, svgForeColor, svgScale and svgTranslate, plus the
// new colour map, root `color` and `tint`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render.js";
import { napiBackend } from "../src/backends/napi.js";
import { createSvgResolver } from "../src/resolve.js";
import { setRootAttribute } from "../src/recolor.js";
import { pixelAt, opaquePixels, findInkBounds, outlinePixel, expectColorNear, expectAllPixels, readFixture } from "./helpers.js";

const opts = { backend: napiBackend, resolveSvg: createSvgResolver(), channels: 4 };
const draw = (layer, w = 72, h = 72, extra = {}) =>
    render({ layers: [{ type: "svg", ...layer }], ...extra.definition }, w, h, { ...opts, ...extra.options });

const GREY = { r: 0x84, g: 0x84, b: 0x84 };
const RED = { r: 255, g: 0, b: 0 };
const LIME = { r: 0, g: 255, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

// A w x h SVG completely covered by one rectangle (so ink bounds = drawn bounds).
const box = (w, h, fill = "#848484") =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`;


// ---- colour ----------------------------------------------------------------

for (let src of ["#square", "#circle"])
{
    test(`${src} renders in the default colour #848484`, async () =>
    {
        expectColorNear(outlinePixel(await draw({ src })), GREY, 2);
    });

    test(`${src} with color: "red" renders red`, async () =>
    {
        expectColorNear(outlinePixel(await draw({ src, color: "red" })), RED, 2);
    });

    // Uniform recolouring: currentColor counts as the effective `color`
    // (default #848484) for the colour map, so built-ins recolour with the
    // same map as file/inline SVGs.
    test(`${src} with colors: { "#848484": "red" } renders red`, async () =>
    {
        expectColorNear(outlinePixel(await draw({ src, colors: { "#848484": "red" } })), RED, 2);
    });

    test(`${src} with colors keyed by another spelling of #848484 renders red`, async () =>
    {
        expectColorNear(outlinePixel(await draw({ src, colors: { "rgb(132, 132, 132)": "red" } })), RED, 2);
    });

    test(`${src} with colors keyed by an explicit color is remapped`, async () =>
    {
        expectColorNear(outlinePixel(await draw({ src, color: "red", colors: { red: "blue" } })), BLUE, 2);
    });

    test(`${src} with colors keyed by #848484 but color: "red" stays red`, async () =>
    {
        expectColorNear(outlinePixel(await draw({ src, color: "red", colors: { "#848484": "blue" } })), RED, 2);
    });

    test(`${src} with colors not matching color stays grey`, async () =>
    {
        expectColorNear(outlinePixel(await draw({ src, colors: { red: "blue", "#000": "lime" } })), GREY, 2);
    });
}

test("colors value that isn't a colour leaves the root colour unchanged", async () =>
{
    // applyColorMap writes fill="currentColor"; root colour stays #848484.
    let result = await draw({ svg: box(10, 10), colors: { "#848484": "currentColor" } });
    expectAllPixels(result, { ...GREY, a: 255 }, 0);
});

test("colors matching color recolours both explicit paints and currentColor", async () =>
{
    let svg = box(10, 10).replace("<rect", `<rect fill="currentColor" width="5" height="10"/><rect x="5"`);
    expectAllPixels(await draw({ svg, colors: { "#848484": "lime" } }), { ...LIME, a: 255 }, 0);
});

test("color accepts any parseColor syntax", async () =>
{
    for (let color of ["lime", "#0f0", "rgb(0 255 0)", "hsl(120, 100%, 50%)"])
        expectColorNear(outlinePixel(await draw({ src: "#square", color })), LIME, 2);
});

test("inline svg with colors map: #848484 -> lime", async () =>
{
    let result = await draw({ svg: box(10, 10), colors: { "#848484": "lime" } });
    expectAllPixels(result, { ...LIME, a: 255 }, 0);
});

test("colors map uses colour matching (any spelling of the source colour)", async () =>
{
    let result = await draw({ svg: box(10, 10, "rgb(132, 132, 132)"), colors: { "#848484": "blue" } });
    expectAllPixels(result, { ...BLUE, a: 255 }, 0);
});

test("colors map does not touch other colours", async () =>
{
    let result = await draw({ svg: box(10, 10, "red"), colors: { "#848484": "blue" } });
    expectAllPixels(result, { ...RED, a: 255 }, 0);
});

test("#hdd keeps its red regardless of color", async () =>
{
    let result = await draw({ src: "#hdd", color: "blue" });
    let reds = opaquePixels(result).filter(p => p.r > 200 && p.g < 40 && p.b < 40);
    assert.ok(reds.length > 100, `only ${reds.length} red pixels`);
});

// The material-icon path (no network): a source normalised to root
// fill="currentColor" with unpainted paths.
const materialHome = setRootAttribute(
    readFixture("material-home.svg"), "fill", "currentColor");

test("root fill=currentColor + unpainted paths: color red -> red ink", async () =>
{
    let ink = opaquePixels(await draw({ svg: materialHome, color: "red" }));
    assert.ok(ink.length > 100, "too little ink");
    for (let p of ink)
        expectColorNear(p, RED, 2);
});

test("root fill=currentColor + unpainted paths: no color -> #848484 ink", async () =>
{
    let ink = opaquePixels(await draw({ svg: materialHome }));
    assert.ok(ink.length > 100, "too little ink");
    for (let p of ink)
        expectColorNear(p, GREY, 2);
});

test("color overrides a root color attribute already in the SVG", async () =>
{
    let svg = setRootAttribute(box(10, 10, "currentColor"), "color", "red");
    expectAllPixels(await draw({ svg, color: "lime" }), { ...LIME, a: 255 }, 0);
});

test("invalid color / colors / tint reject naming the value", async () =>
{
    await assert.rejects(draw({ svg: box(4, 4), color: "nope" }), /svg layer: invalid color 'nope'/);
    await assert.rejects(draw({ svg: box(4, 4), color: "currentColor" }), TypeError);
    await assert.rejects(draw({ svg: box(4, 4), tint: "nope" }), /svg layer: invalid tint 'nope'/);
    await assert.rejects(draw({ svg: box(4, 4), colors: { nope: "red" } }), TypeError);
});

// ---- tint ------------------------------------------------------------------

// 40x20: left half red, right half lime, with a transparent 10px gap between.
const twoTone = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">`
    + `<rect width="15" height="20" fill="red"/><rect x="25" width="15" height="20" fill="lime"/></svg>`;

test("tint turns a multi-colour SVG solid where opaque, keeps transparency", async () =>
{
    // 40x20 button: drawn 40x20 at 0,0.
    let plain = await draw({ svg: twoTone }, 40, 20);
    expectColorNear(pixelAt(plain, 5, 10), { ...RED, a: 255 }, 0);
    expectColorNear(pixelAt(plain, 35, 10), { ...LIME, a: 255 }, 0);

    let tinted = await draw({ svg: twoTone, tint: "blue" }, 40, 20);
    expectColorNear(pixelAt(tinted, 5, 10), { ...BLUE, a: 255 }, 0);
    expectColorNear(pixelAt(tinted, 35, 10), { ...BLUE, a: 255 }, 0);
    expectColorNear(pixelAt(tinted, 20, 10), TRANSPARENT, 0);
    // Same coverage as the untinted render.
    assert.deepEqual(findInkBounds(tinted), findInkBounds(plain));
});

test("tint applies to the layer only (layers below untouched) and honours alpha", async () =>
{
    let layers = [
        { type: "fill", color: "red" },
        { type: "svg", svg: box(10, 10, "lime"), tint: "blue", scale: 0.5 },
    ];
    let result = await render({ layers }, 20, 20, opts);
    expectColorNear(pixelAt(result, 0, 0), { ...RED, a: 255 }, 0);
    expectColorNear(pixelAt(result, 10, 10), { ...BLUE, a: 255 }, 0);

    let half = await draw({ svg: box(10, 10, "lime"), tint: "rgba(0, 0, 255, 0.5)" }, 20, 20);
    expectColorNear(pixelAt(half, 10, 10), { ...BLUE, a: 128 }, 1);
});

// ---- size and position -----------------------------------------------------

test("default scale 1: drawn height = button height, centred", async () =>
{
    // 1:2 SVG on a 72x72 button -> 36x72 at left 18.
    assert.deepEqual(findInkBounds(await draw({ svg: box(10, 20) })), { left: 18, top: 0, right: 53, bottom: 71 });
});

test("scale 0.5 on a 2:1 SVG: height half the button, aspect kept, centred", async () =>
{
    // 72 * 0.5 = 36 high, 72 wide, top (72 - 36) / 2 = 18.
    assert.deepEqual(findInkBounds(await draw({ svg: box(20, 10), scale: 0.5 })), { left: 0, top: 18, right: 71, bottom: 53 });
    // 0.25 -> 18 high, 36 wide at (18, 27).
    assert.deepEqual(findInkBounds(await draw({ svg: box(20, 10), scale: 0.25 })), { left: 18, top: 27, right: 53, bottom: 44 });
});

test("size follows the device height, not the virtual size or the SVG's own size", async () =>
{
    // 24px SVG at scale 0.5 on a 144x96 button -> 48x48 at (48, 24).
    let result = await draw({ svg: box(24, 24), scale: 0.5 }, 144, 96, { definition: { virtualSize: { width: 36, height: 36 } } });
    assert.deepEqual(findInkBounds(result), { left: 48, top: 24, right: 95, bottom: 71 });
});

test("sizes and positions are rounded like the old renderer (Math.round, each dimension)", async () =>
{
    // 10px button, scale 0.45: exact 4.5 x 4.5 -> 5 x 5 (sharp rounded the
    // same way); left/top = round((10 - 5) / 2) = round(2.5) = 3.
    assert.deepEqual(findInkBounds(await draw({ svg: box(10, 10), scale: 0.45 }, 10, 10)), { left: 3, top: 3, right: 7, bottom: 7 });
    // 3:1 SVG, 7px high button, scale 0.5: exact 10.5 x 3.5 -> 11 x 4 at (round(-2), round(1.5)).
    assert.deepEqual(findInkBounds(await draw({ svg: box(30, 10), scale: 0.5 }, 7, 7)), { left: 0, top: 2, right: 6, bottom: 5 });
});

test("translate is in virtual px: {x: 10} on a 144px button shifts ink 20px", async () =>
{
    let layer = { svg: box(10, 10), scale: 0.25 };
    let base = findInkBounds(await draw(layer, 144, 144));
    let moved = findInkBounds(await draw({ ...layer, translate: { x: 10, y: 0 } }, 144, 144));
    assert.deepEqual(base, { left: 54, top: 54, right: 89, bottom: 89 });
    assert.deepEqual(moved, { left: 74, top: 54, right: 109, bottom: 89 });
});

test("translate scales per axis and rounds the final position", async () =>
{
    // virtual 72x36 on 144x72 -> sx 2, sy 2; 36px box at (54 + 2*-3.25, 18 + 2*5) = (47.5 -> 48, 28).
    let result = await draw({ svg: box(10, 10), scale: 0.5, translate: { x: -3.25, y: 5 } }, 144, 72,
        { definition: { virtualSize: { width: 72, height: 36 } } });
    assert.deepEqual(findInkBounds(result), { left: 48, top: 28, right: 83, bottom: 63 });
});

test("oversized / offset SVG is cropped to the button (no throw)", async () =>
{
    expectAllPixels(await draw({ svg: box(10, 10), scale: 3 }, 20, 20), { ...GREY, a: 255 }, 0);
    // 10px box at left 5 - 10 = -5: pushed half off the left edge.
    let result = await draw({ svg: box(10, 10), scale: 0.5, translate: { x: -10, y: 0 } }, 20, 20, { definition: { virtualSize: { width: 20, height: 20 } } });
    assert.deepEqual(findInkBounds(result), { left: 0, top: 5, right: 4, bottom: 14 });
    // Entirely off the button.
    let gone = await draw({ svg: box(10, 10), translate: { x: 100, y: 0 } }, 20, 20);
    assert.equal(findInkBounds(gone), null);
});

test("a scale that rounds to 0 px draws nothing", async () =>
{
    assert.equal(findInkBounds(await draw({ svg: box(10, 10), scale: 0.01 }, 20, 20)), null);
});

test("invalid scale / translate reject", async () =>
{
    for (let scale of [0, -1, "1", NaN, Infinity])
        await assert.rejects(draw({ svg: box(4, 4), scale }), /svg layer: 'scale'/);
    for (let translate of ["1", 5, { x: "1" }])
        await assert.rejects(draw({ svg: box(4, 4), translate }), /svg layer: 'translate'/);
});

// ---- text substitution -----------------------------------------------------

test("text substitutes $(x) before rendering (and before the colour map)", async () =>
{
    let svg = box(10, 10, "$(x)");
    expectAllPixels(await draw({ svg, text: "lime" }), { ...LIME, a: 255 }, 0);
    expectAllPixels(await draw({ svg, text: "#848484", colors: { "#848484": "blue" } }), { ...BLUE, a: 255 }, 0);
});

test("text substitution works inside <text> content", async () =>
{
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20">`
        + `<text x="0" y="16" font-family="sans-serif" font-size="16" fill="red">$(x)</text></svg>`;
    let narrow = findInkBounds(await draw({ svg, text: "i" }, 80, 40));
    let wide = findInkBounds(await draw({ svg, text: "WWW" }, 80, 40));
    assert.ok(narrow && wide);
    assert.ok(wide.right - wide.left > narrow.right - narrow.left + 10, `${JSON.stringify(narrow)} vs ${JSON.stringify(wide)}`);
});

// ---- sources ---------------------------------------------------------------

test("src is resolved through options.resolveSvg", async () =>
{
    let seen = [];
    let resolveSvg = async src => (seen.push(src), box(10, 10, "red"));
    let result = await draw({ src: "custom:thing" }, 10, 10, { options: { resolveSvg } });
    assert.deepEqual(seen, ["custom:thing"]);
    expectAllPixels(result, { ...RED, a: 255 }, 0);
});

test("src without options.resolveSvg rejects clearly", async () =>
{
    await assert.rejects(draw({ src: "#heart" }, 10, 10, { options: { resolveSvg: undefined } }),
        /svg layer: 'src' \("#heart"\) needs options\.resolveSvg/);
});

test("resolver errors propagate (unknown built-in icon)", async () =>
{
    await assert.rejects(draw({ src: "#nope" }), /unknown built-in icon '#nope'/);
});

test("exactly one of src / svg, as a non-empty string", async () =>
{
    await assert.rejects(draw({}), /svg layer: needs 'src' or 'svg'/);
    await assert.rejects(draw({ src: "#heart", svg: box(4, 4) }), /svg layer: 'src' and 'svg' can't both be given/);
    await assert.rejects(draw({ svg: 42 }), /svg layer: 'svg' must be a non-empty string/);
    await assert.rejects(draw({ src: "" }), /svg layer: 'src' must be a non-empty string/);
});

test("svg layer honours opacity (core) and RGB output", async () =>
{
    let result = await render({ layers: [{ type: "svg", svg: box(4, 4, "red"), opacity: 0.5 }] }, 4, 4,
        { ...opts, channels: 3 });
    expectAllPixels(result, { r: 128, g: 0, b: 0 }, 1);
});

test("the layer object is not modified", async () =>
{
    let layer = { type: "svg", src: "#heart", color: "red", colors: { "#000": "red", red: "blue" }, translate: { x: 1, y: 2 }, text: "x" };
    let copy = structuredClone(layer);
    await render({ layers: [layer] }, 16, 16, opts);
    assert.deepEqual(layer, copy);
});
