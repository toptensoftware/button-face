// Live Material Symbols downloads from fonts.gstatic.com. Skipped unless
// BUTTON_FACE_LIVE_TESTS=1 (default `npm test` makes no network requests, so
// CI/offline machines pass). Run manually:
//   BUTTON_FACE_LIVE_TESTS=1 node --test test/material-live.test.js

import { test } from "node:test";
import assert from "node:assert/strict";
import { createMaterialResolver } from "../src/material.js";
import { createFsCache } from "../src/node/fsCache.js";
import { getSvgSize } from "../src/svgSize.js";
import { readIcon, tempDir } from "./helpers.js";

const skip = !process.env.BUTTON_FACE_LIVE_TESTS && "set BUTTON_FACE_LIVE_TESTS=1 to run live network tests";

/** A resolver downloading for real, cached in a fresh temp dir; raw viewBox. */
async function liveResolver(t)
{
    return createMaterialResolver({ cache: createFsCache({ dir: await tempDir(t) }), pad: 0 });
}

/** Every `<path d="...">` in an SVG. */
const pathData = svg => [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m => m[1]);

for (let [ref, size] of [["home", 24], ["home?fill=1&weight=700", 24], ["arrow_back?style=rounded&grade=-25&size=48", 48]])
{
    test(`live: @${ref} downloads a valid SVG`, { skip }, async t =>
    {
        let svg = await (await liveResolver(t))(ref);
        assert.match(svg, /^<svg[^>]*\bfill="currentColor"/);
        assert.ok(pathData(svg).length > 0, "no paths");
        assert.deepEqual(getSvgSize(svg), { width: size, height: size });
    });
}

test("live: unknown icon rejects with the 404 message", { skip }, async t =>
{
    await assert.rejects((await liveResolver(t))("hoem"), /unknown material icon 'hoem' or unsupported settings \(HTTP 404 /);
});

test("live: @add?weight=200 has the same path as icons/add.svg", { skip }, async t =>
{
    let svg = await (await liveResolver(t))("add?weight=200");
    assert.deepEqual(pathData(svg), pathData(readIcon("add")));
});
