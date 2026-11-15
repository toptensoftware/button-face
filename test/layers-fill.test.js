// Plan step 10: the fill layer (src/layers/fill.js) - whole-button colour,
// the old project's `backColor`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { render } from "../src/render.js";
import { napiBackend } from "../src/backends/napi.js";
import { expectAllPixels } from "./helpers.js";

const rgba = { backend: napiBackend, channels: 4 };
const fill = (color, extra) => render({ layers: [{ type: "fill", color }] }, 8, 6, { ...rgba, ...extra });

test("fill red -> every pixel red", async () =>
{
    expectAllPixels(await fill("red"), { r: 255, g: 0, b: 0, a: 255 }, 0);
});

test("any CSS colour syntax parseColor supports", async () =>
{
    let lime = { r: 0, g: 255, b: 0, a: 255 };
    for (let color of ["lime", "#0f0", "#00FF00", "#00ff00ff", "rgb(0, 255, 0)", "rgb(0 100% 0)", "hsl(120, 100%, 50%)"])
        expectAllPixels(await fill(color), lime, 1);
});

test("translucent and transparent colours", async () =>
{
    expectAllPixels(await fill("#0000ff80"), { r: 0, g: 0, b: 255, a: 128 }, 1);
    expectAllPixels(await fill("transparent"), { r: 0, g: 0, b: 0, a: 0 }, 0);
});

test("color defaults to black (the old backColor default)", async () =>
{
    let result = await render({ layers: [{ type: "fill" }] }, 8, 6, rgba);
    expectAllPixels(result, { r: 0, g: 0, b: 0, a: 255 }, 0);
});

test("fill over a translucent fill composites source-over", async () =>
{
    let layers = [{ type: "fill", color: "blue" }, { type: "fill", color: "rgba(255, 0, 0, 0.5)" }];
    expectAllPixels(await render({ layers }, 8, 6, rgba), { r: 128, g: 0, b: 127, a: 255 }, 2);
});

test("an invalid colour rejects, naming it", async () =>
{
    for (let color of ["nope", "currentColor", "url(#a)", 42])
        await assert.rejects(fill(color), TypeError, String(color));
    await assert.rejects(fill("nope"), /'nope'/);
});
