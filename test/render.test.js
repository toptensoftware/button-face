// The render core (src/render.js) - output format, layer
// dispatch and the shared per-layer handling (visible, opacity). Uses fill
// layers as the simplest real layer type.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render.js";
import { napiBackend } from "../src/backends/napi.js";
import { pixelAt, expectAllPixels, expectColorNear, assertBrowserSafe, importGraph } from "./helpers.js";

const opts = { backend: napiBackend };
const BLACK = { r: 0, g: 0, b: 0, a: 255 };
const RED = { r: 255, g: 0, b: 0, a: 255 };
const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };
const red = { type: "fill", color: "red" };

// ---- output format ---------------------------------------------------------

test("returns { data: Uint8Array, width, height, channels }, RGB by default", async () =>
{
    let result = await render({ layers: [red] }, 6, 4, opts);
    assert.ok(result.data instanceof Uint8Array);
    assert.equal(result.width, 6);
    assert.equal(result.height, 4);
    assert.equal(result.channels, 3);
    assert.equal(result.data.length, 6 * 4 * 3);
    expectAllPixels(result, RED, 0);
});

test("channels 4 -> RGBA, w*h*4 bytes", async () =>
{
    let result = await render({ layers: [red] }, 6, 4, { ...opts, channels: 4 });
    assert.ok(result.data instanceof Uint8Array);
    assert.equal(result.channels, 4);
    assert.equal(result.data.length, 6 * 4 * 4);
    expectAllPixels(result, RED, 0);
});

test("channels other than 3 or 4 rejects", async () =>
{
    for (let channels of [0, 1, 2, 5, "4", null])
        await assert.rejects(render({ layers: [red] }, 4, 4, { ...opts, channels }), RangeError, `channels ${channels}`);
});

test("empty / missing layers -> RGB all black, RGBA all transparent", async () =>
{
    for (let definition of [{}, { layers: [] }])
    {
        expectAllPixels(await render(definition, 5, 3, opts), BLACK, 0);
        expectAllPixels(await render(definition, 5, 3, { ...opts, channels: 4 }), TRANSPARENT, 0);
    }
});

test("RGB output composites translucent pixels over black", async () =>
{
    let result = await render({ layers: [{ type: "fill", color: "rgba(255, 0, 0, 0.5)" }] }, 4, 4, opts);
    expectAllPixels(result, { r: 128, g: 0, b: 0 }, 2);
});

test("RGBA output is not premultiplied", async () =>
{
    let result = await render({ layers: [{ type: "fill", color: "rgba(255, 0, 0, 0.5)" }] }, 4, 4, { ...opts, channels: 4 });
    expectAllPixels(result, { r: 255, g: 0, b: 0, a: 128 }, 2);
});

// ---- layer order and shared per-layer options -----------------------------

test("layers paint bottom to top: the last fill wins", async () =>
{
    let result = await render({ layers: [red, { type: "fill", color: "blue" }] }, 4, 4, opts);
    expectAllPixels(result, { r: 0, g: 0, b: 255 }, 0);
});

test("opacity: 0.5 fill over black -> ~half red", async () =>
{
    let layers = [{ type: "fill", color: "black" }, { ...red, opacity: 0.5 }];
    expectAllPixels(await render({ layers }, 4, 4, opts), { r: 128, g: 0, b: 0 }, 2);
});

test("opacity applies on top of the colour's own alpha", async () =>
{
    let layers = [{ type: "fill", color: "rgba(255, 0, 0, 0.5)", opacity: 0.5 }];
    expectAllPixels(await render({ layers }, 4, 4, { ...opts, channels: 4 }), { r: 255, g: 0, b: 0, a: 64 }, 2);
});

test("opacity does not leak into later layers", async () =>
{
    let layers = [{ ...red, opacity: 0.5 }, { type: "fill", color: "blue" }];
    expectAllPixels(await render({ layers }, 4, 4, { ...opts, channels: 4 }), { r: 0, g: 0, b: 255, a: 255 }, 0);
});

test("opacity 0 and visible: false skip the layer", async () =>
{
    for (let hidden of [{ ...red, visible: false }, { ...red, opacity: 0 }])
    {
        let result = await render({ layers: [{ type: "fill", color: "blue" }, hidden] }, 4, 4, opts);
        expectAllPixels(result, { r: 0, g: 0, b: 255 }, 0);
    }
});

test("visible: false skips the layer without validating it", async () =>
{
    let layers = [red, { type: "fill", color: "not-a-colour", visible: false }];
    expectAllPixels(await render({ layers }, 4, 4, opts), RED, 0);
});

test("visible: true and opacity: 1 are the defaults", async () =>
{
    let result = await render({ layers: [{ ...red, visible: true, opacity: 1 }] }, 4, 4, { ...opts, channels: 4 });
    expectAllPixels(result, RED, 0);
});

test("invalid opacity / visible rejects", async () =>
{
    for (let bad of [{ opacity: -0.1 }, { opacity: 1.5 }, { opacity: "0.5" }, { opacity: NaN }, { visible: "no" }])
        await assert.rejects(render({ layers: [{ ...red, ...bad }] }, 4, 4, opts), TypeError, JSON.stringify(bad));
});

// ---- dispatch and validation ----------------------------------------------

test("unknown layer type rejects, naming the type", async () =>
{
    await assert.rejects(render({ layers: [{ type: "blur" }] }, 4, 4, opts), /unknown layer type 'blur'/);
});

test("a layer must be an object with a string type", async () =>
{
    for (let layer of [null, "fill", {}, { type: 3 }])
        await assert.rejects(render({ layers: [layer] }, 4, 4, opts), TypeError, JSON.stringify(layer));
});

test("definition must be an object and layers an array", async () =>
{
    for (let definition of [null, undefined, "x", { layers: red }])
        await assert.rejects(render(definition, 4, 4, opts), TypeError, JSON.stringify(definition));
});

test("width and height must be positive integers", async () =>
{
    for (let [w, h] of [[0, 4], [4, 0], [-1, 4], [4.5, 4], [4, NaN], ["4", 4]])
        await assert.rejects(render({ layers: [red] }, w, h, opts), RangeError, `${w}x${h}`);
});

test("a backend is required", async () =>
{
    await assert.rejects(render({ layers: [red] }, 4, 4), TypeError);
    await assert.rejects(render({ layers: [red] }, 4, 4, { backend: {} }), TypeError);
});

test("invalid virtualSize rejects", async () =>
{
    await assert.rejects(render({ virtualSize: { width: 0, height: 72 }, layers: [red] }, 4, 4, opts), RangeError);
});

test("a validation error in a later layer rejects before anything is drawn", async () =>
{
    // All layers are prepared before any is painted; an error anywhere rejects the whole render.
    await assert.rejects(render({ layers: [red, { type: "fill", color: "nope" }] }, 4, 4, opts), /nope/);
});

test("the definition is not modified", async () =>
{
    let definition = { layers: [{ ...red, opacity: 0.5 }] };
    let copy = structuredClone(definition);
    await render(definition, 4, 4, opts);
    assert.deepEqual(definition, copy);
});

test("larger render: every pixel painted", async () =>
{
    let result = await render({ layers: [red] }, 144, 96, opts);
    expectColorNear(pixelAt(result, 0, 0), RED, 0);
    expectColorNear(pixelAt(result, 143, 95), RED, 0);
    expectAllPixels(result, RED, 0);
});

test("src/render.js and everything it imports are browser-safe", () =>
{
    for (let file of importGraph("src/render.js").files)
        assertBrowserSafe(file);
});
