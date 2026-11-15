// The text layer (src/layers/text.js) - the old project's
// text, font, textColor, textPadding, textAlign, textVAlign,
// textLineSpacing and textTranslate (old drawText.js).
//
// Fonts differ per machine, so render tests check ink bounds / alignment with
// tolerances, never exact glyphs. Exact layout maths is tested with a fake
// context whose measureText is deterministic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render.js";
import { napiBackend } from "../src/backends/napi.js";
import { lineHeight, layoutText } from "../src/layers/text.js";
import { pixels, findInkBounds, expectColorNear, assertBrowserSafe } from "./helpers.js";

const opts = { backend: napiBackend, channels: 4 };
const draw = (layer, w = 72, h = 72, definition = {}) =>
    render({ ...definition, layers: [{ type: "text", ...layer }] }, w, h, opts);
const ink = async (layer, w, h, definition) =>
{
    let bounds = findInkBounds(await draw(layer, w, h, definition));
    assert.ok(bounds, "expected some ink");
    return bounds;
};
const inkHeight = b => b.bottom - b.top + 1;
const inkWidth = b => b.right - b.left + 1;

// A fake context: each character is 10px wide; "Xy" has the given extent.
function fakeCtx(ascent, descent = 0)
{
    return {
        measureText: s => ({
            width: s.length * 10,
            actualBoundingBoxAscent: s == "Xy" ? ascent : NaN,
            actualBoundingBoxDescent: s == "Xy" ? descent : NaN,
        }),
    };
}

// ---- lineHeight (old heuristic) ---------------------------------------------

test("lineHeight: ascent + descent of 'Xy', x1.1 below 40px", () =>
{
    assert.equal(lineHeight(fakeCtx(8, 2)), 10 * 1.1);
    assert.equal(lineHeight(fakeCtx(30, 9.5)), 39.5 * 1.1);
});

test("lineHeight: small text (< 20px) also gets x1.1 (old dead x1.0 branch)", () =>
{
    assert.equal(lineHeight(fakeCtx(15)), 15 * 1.1);
    assert.equal(lineHeight(fakeCtx(5)), 5 * 1.1);
});

test("lineHeight: x1.2 from 40px", () =>
{
    assert.equal(lineHeight(fakeCtx(40)), 40 * 1.2);
    assert.equal(lineHeight(fakeCtx(45, 5)), 50 * 1.2);
});

test("lineHeight: multiplied by lineSpacing (default 1)", () =>
{
    assert.equal(lineHeight(fakeCtx(10), 2), 10 * 1.1 * 2);
    assert.equal(lineHeight(fakeCtx(50), 0.5), 50 * 1.2 * 0.5);
    assert.equal(lineHeight(fakeCtx(10), 1), lineHeight(fakeCtx(10)));
});

// ---- layoutText (old drawText maths) ----------------------------------------

// 100x50 box, padding t5 r6 b7 l8, line height 10 * 1.1 = 11.
const box = { width: 100, height: 50, padding: { top: 5, right: 6, bottom: 7, left: 8 } };
const layout = (text, extra) => layoutText(fakeCtx(10), text,
    { ...box, align: "center", valign: "center", lineSpacing: 1, translate: { x: 0, y: 0 }, ...extra });

test("layoutText: x per align (left = padLeft, center = middle of space, right = width - padRight)", () =>
{
    assert.equal(layout("a", { align: "left" }).x, 8);
    assert.equal(layout("a", { align: "center" }).x, 8 + (100 - 14) / 2);
    assert.equal(layout("a", { align: "right" }).x, 94);
});

test("layoutText: y per valign", () =>
{
    let ys = valign => layout("a\nb", { valign }).lines.map(l => l.y);
    assert.deepEqual(ys("top"), [5, 16]);
    assert.deepEqual(ys("center"), [5 + (50 - 12 - 22) / 2, 5 + (50 - 12 - 22) / 2 + 11]);
    assert.deepEqual(ys("bottom"), [50 - 22 - 7, 50 - 22 - 7 + 11]);
});

test("layoutText: wraps to the space between the paddings", () =>
{
    // 86px available = 8 characters per line.
    assert.deepEqual(layout("abc def ghi").lines.map(l => l.text), ["abc def", "ghi"]);
    assert.deepEqual(layout("a\r\nb").lines.map(l => l.text), ["a", "b"]);
});

test("layoutText: translate offsets x and every line's y", () =>
{
    let plain = layout("a\nb", { valign: "top", align: "left" });
    let moved = layout("a\nb", { valign: "top", align: "left", translate: { x: 3, y: -4 } });
    assert.equal(moved.x, plain.x + 3);
    assert.deepEqual(moved.lines.map(l => l.y), plain.lines.map(l => l.y - 4));
});

test("layoutText: lineSpacing spreads the lines", () =>
{
    assert.deepEqual(layout("a\nb", { valign: "top", lineSpacing: 2 }).lines.map(l => l.y), [5, 27]);
});

// ---- rendering ---------------------------------------------------------------

test("white text renders white ink, centred by default", async () =>
{
    let result = await draw({ text: "Hi" });
    let b = findInkBounds(result);
    assert.ok(b);
    assert.ok(Math.abs((b.left + b.right) / 2 - 35.5) <= 2, `x centre ${JSON.stringify(b)}`);
    assert.ok(Math.abs((b.top + b.bottom) / 2 - 35.5) <= 4, `y centre ${JSON.stringify(b)}`);
    let solid = [...pixels(result)].map(([, , p]) => p).filter(p => p.a == 255);
    assert.ok(solid.length > 10);
    for (let p of solid)
        expectColorNear(p, { r: 255, g: 255, b: 255 }, 0);
});

test("color", async () =>
{
    let solid = [...pixels(await draw({ text: "Hi", color: "red" }))].map(([, , p]) => p).filter(p => p.a == 255);
    assert.ok(solid.length > 10);
    for (let p of solid)
        expectColorNear(p, { r: 255, g: 0, b: 0 }, 0);
});

test("empty or missing text draws nothing", async () =>
{
    for (let text of ["", undefined, null])
        assert.equal(findInkBounds(await draw({ text })), null, String(text));
});

test("valign: top near the top padding, bottom near the bottom", async () =>
{
    let top = await ink({ text: "Hi", valign: "top" });
    let bottom = await ink({ text: "Hi", valign: "bottom" });
    assert.ok(top.top < bottom.top);
    assert.ok(top.top >= 1 && top.top <= 8, `top ${top.top}`);
    assert.ok(bottom.bottom <= 69 && bottom.bottom >= 62, `bottom ${bottom.bottom}`);
});

test("align: left near the left padding, right near the right", async () =>
{
    let left = await ink({ text: "Hi", align: "left" });
    let right = await ink({ text: "Hi", align: "right" });
    assert.ok(left.left < right.left);
    assert.ok(left.left >= 3 && left.left <= 6, `left ${left.left}`);
    assert.ok(right.right <= 69 && right.right >= 65, `right ${right.right}`);
});

test("long text wraps within the padding", async () =>
{
    let one = await ink({ text: "Long" });
    let wrapped = await ink({ text: "Long text that wraps" });
    assert.ok(inkHeight(wrapped) > 2 * inkHeight(one), `${inkHeight(wrapped)} vs ${inkHeight(one)}`);
    assert.ok(wrapped.left >= 3 && wrapped.right <= 68, JSON.stringify(wrapped));
});

test("\\n forces a break", async () =>
{
    let one = await ink({ text: "A" });
    let two = await ink({ text: "A\nA" });
    assert.ok(inkHeight(two) > 1.8 * inkHeight(one), `${inkHeight(two)} vs ${inkHeight(one)}`);
    assert.ok(inkWidth(two) <= inkWidth(one) + 1);
});

test("lineSpacing increases the gap between lines", async () =>
{
    let normal = await ink({ text: "A\nA" });
    let spaced = await ink({ text: "A\nA", lineSpacing: 2 });
    assert.ok(inkHeight(spaced) > inkHeight(normal) + 10);
});

// Ink movement caused by `change` relative to `base` (glyphs don't start
// exactly at the em box, so compare against a reference render).
async function inkShift(base, change, w, h)
{
    let a = await ink(base, w, h);
    let b = await ink({ ...base, ...change }, w, h);
    return { left: b.left - a.left, top: b.top - a.top, right: b.right - a.right, bottom: b.bottom - a.bottom };
}
const near = (actual, expected, tol, label) =>
    assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);

test("padding is in virtual px (2x device -> 2x offset)", async () =>
{
    let base = { text: "Hi", align: "left", valign: "top", padding: 0 };
    let small = await inkShift(base, { padding: 10 }, 72, 72);
    let big = await inkShift(base, { padding: 10 }, 144, 144);
    near(small.left, 10, 1, "72 left");
    near(small.top, 10, 1, "72 top");
    near(big.left, 20, 1, "144 left");
    near(big.top, 20, 1, "144 top");
});

test("padding forms: [tb, lr] and [t, r, b, l]", async () =>
{
    let tl = await inkShift({ text: "Hi", align: "left", valign: "top", padding: 0 }, { padding: [20, 30] });
    near(tl.left, 30, 1, "left");
    near(tl.top, 20, 1, "top");
    let br = await inkShift({ text: "Hi", align: "right", valign: "bottom", padding: 0 }, { padding: [0, 10, 20, 0] });
    near(br.right, -10, 1, "right");
    near(br.bottom, -20, 1, "bottom");
});

test("translate is in virtual px (2x device -> 2x shift)", async () =>
{
    let shift = async size =>
    {
        let a = await ink({ text: "Hi" }, size, size);
        let b = await ink({ text: "Hi", translate: { x: 10, y: -5 } }, size, size);
        return { x: b.left - a.left, y: b.top - a.top };
    };
    let small = await shift(72);
    let big = await shift(144);
    assert.ok(Math.abs(small.x - 10) <= 1 && Math.abs(small.y + 5) <= 1, JSON.stringify(small));
    assert.ok(Math.abs(big.x - 20) <= 1 && Math.abs(big.y + 10) <= 1, JSON.stringify(big));
});

test("font px size scales by the vertical scale only", async () =>
{
    let base = await ink({ text: "Hi" }, 72, 72);
    let wide = await ink({ text: "Hi" }, 144, 72);   // sx 2, sy 1 -> same font
    let tall = await ink({ text: "Hi" }, 72, 144);   // sx 1, sy 2 -> font doubled
    near(inkHeight(wide), inkHeight(base), 1, "wide height");
    near(inkWidth(wide), inkWidth(base), 1, "wide width");
    near(inkHeight(tall), 2 * inkHeight(base), 3, "tall height");
    near(inkWidth(tall), 2 * inkWidth(base), 3, "tall width");
});

test("virtualSize sets the scale", async () =>
{
    let base = await ink({ text: "Hi" }, 72, 72);
    let half = await ink({ text: "Hi" }, 72, 72, { virtualSize: { width: 144, height: 144 } });
    assert.ok(Math.abs(inkHeight(half) - inkHeight(base) / 2) <= 2);
});

test("defaults: font bold 16px sans-serif, white, padding 3, center/center, lineSpacing 1", async () =>
{
    let text = "Some default text";
    let implicit = await draw({ text });
    let explicit = await draw({ text, font: "bold 16px sans-serif", color: "white", padding: 3,
        align: "center", valign: "center", lineSpacing: 1, translate: { x: 0, y: 0 } });
    assert.deepEqual(implicit.data, explicit.data);
    // ... and they actually matter.
    for (let change of [{ font: "12px sans-serif" }, { padding: 0, align: "left" }, { color: "red" }])
        assert.notDeepEqual((await draw({ text, ...change })).data, implicit.data, JSON.stringify(change));
});

test("numbers are drawn as text", async () =>
{
    assert.ok(findInkBounds(await draw({ text: 42 })));
});

test("invalid properties reject naming the property", async () =>
{
    let cases = [
        [{ text: "a", color: "nope" }, /text layer: invalid color 'nope'/],
        [{ text: "a", align: "middle" }, /text layer: 'align'/],
        [{ text: "a", valign: "middle" }, /text layer: 'valign'/],
        [{ text: "a", font: "bold sans-serif" }, /text layer: .*px/],
        [{ text: "a", font: 16 }, /text layer: 'font'/],
        [{ text: "a", lineSpacing: 0 }, /text layer: 'lineSpacing'/],
        [{ text: "a", lineSpacing: "2" }, /text layer: 'lineSpacing'/],
        [{ text: "a", padding: [1, 2, 3] }, /text layer: .*padding/],
        [{ text: "a", padding: "3" }, /text layer: .*padding/],
        [{ text: "a", translate: { x: "1" } }, /text layer: 'translate'/],
        [{ text: { a: 1 } }, /text layer: 'text'/],
    ];
    for (let [layer, message] of cases)
        await assert.rejects(draw(layer), message, JSON.stringify(layer));
});

test("src/layers/text.js is browser-safe", () =>
{
    assertBrowserSafe("src/layers/text.js");
});
