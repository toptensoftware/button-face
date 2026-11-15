// The public entry points. "." (src/index.js) is the portable,
// browser-safe core; "./node" (src/node.js) adds the @napi-rs/canvas backend
// and a resolver with built-ins + file fallback as defaults.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as core from "@toptensoftware/button-face";
import * as node from "@toptensoftware/button-face/node";
import { render as coreRender } from "../src/render.js";
import { napiBackend } from "../src/backends/napi.js";
import { icons } from "../src/icons.js";
import { pixelAt, pixels, importGraph, assertBrowserSafe, readFixture, pkg } from "./helpers.js";

const fixturePath = fileURLToPath(new URL("fixtures/material-home.svg", import.meta.url));
const fixtureSvg = readFixture("material-home.svg");

// A typical definition (the old project's usual icon + label layout).
const example = {
    virtualSize: { width: 72, height: 72 },
    layers: [
        { type: "fill", color: "black" },
        { type: "svg", src: "#heart", color: "red", translate: { x: 0, y: -7 } },
        { type: "text", text: "Hello!", color: "white", valign: "bottom" },
    ],
};

// ---- package.json exports --------------------------------------------------

test("package.json exports '.' -> src/index.js and './node' -> src/node.js", () =>
{
    assert.deepEqual(pkg.exports, { ".": "./src/index.js", "./node": "./src/node.js" });
});

// ---- core entry ------------------------------------------------------------

test("core entry exports the portable API", () =>
{
    for (let name of ["render", "layerTypes", "createSvgResolver", "resolveBuiltinIcon",
        "parseColor", "colorsEqual", "formatColor", "applyColorMap", "lookupColor", "mapPaintValues",
        "findPaintValues", "getRootAttribute", "setRootAttribute", "substituteText",
        "normalizeStyleLengths", "getSvgSize", "padViewBox", "createScaler", "scaleFont",
        "DEFAULT_VIRTUAL_SIZE", "wrapLines", "convertLegacyDefinition"])
    {
        assert.ok(name in core, `core is missing '${name}'`);
    }
    assert.equal(core.render, coreRender);
    assert.equal(core.icons, icons);
    assert.equal(Object.keys(core.icons).length, 42);
});

test("core entry exports nothing Node-only", () =>
{
    for (let name of ["napiBackend", "createFileResolver", "createNodeSvgResolver"])
        assert.ok(!(name in core), `core exports Node-only '${name}'`);
});

test("core import graph is browser-safe (no Node or native imports, no external deps)", () =>
{
    let { files, external } = importGraph("src/index.js");
    assert.ok(files.includes("src/render.js") && files.includes("src/layers/text.js") && files.includes("src/icons.js"),
        `import graph not walked: ${files.join(", ")}`);
    assert.ok(!files.some(f => f.startsWith("src/node") || f.startsWith("src/backends/")),
        `core reaches Node modules: ${files.join(", ")}`);
    assert.deepEqual(external, []);
    for (let file of files)
        assertBrowserSafe(file);
});

test("importGraph sees the Node entry's Node-only imports (the check can fail)", () =>
{
    let { files, external } = importGraph("src/node.js");
    assert.ok(files.includes("src/backends/napi.js"));
    assert.ok(files.includes("src/node/fileResolver.js"));
    assert.ok(external.includes("@napi-rs/canvas"));
    assert.ok(external.includes("node:fs/promises"));
});

test("core render still requires a backend", async () =>
{
    await assert.rejects(core.render(example, 72, 72), TypeError);
});

// ---- node entry ------------------------------------------------------------

test("node entry re-exports the core API plus Node extras", () =>
{
    for (let name of Object.keys(core))
    {
        if (name != "render")
            assert.equal(node[name], core[name], `node entry '${name}' differs from core`);
    }
    assert.equal(node.napiBackend, napiBackend);
    assert.equal(typeof node.createFileResolver, "function");
    assert.equal(typeof node.createNodeSvgResolver, "function");
    assert.equal(typeof node.resolveSvg, "function");
    assert.notEqual(node.render, core.render);
});

test("node resolveSvg: built-ins via '#', anything else is a file path", async () =>
{
    assert.equal(await node.resolveSvg("#heart"), icons.heart);
    assert.equal(await node.resolveSvg(fixturePath), fixtureSvg);
    await assert.rejects(node.resolveSvg("#nope"), /unknown built-in icon/);
    await assert.rejects(node.resolveSvg("no-such-file.svg"), { code: "ENOENT" });
});

test("createNodeSvgResolver: baseDir and extra prefixes", async () =>
{
    let resolve = node.createNodeSvgResolver({
        baseDir: fileURLToPath(new URL("fixtures/", import.meta.url)),
        prefixes: { "@": name => `<svg id="${name}"/>` },
    });
    assert.equal(await resolve("material-home.svg"), fixtureSvg);
    assert.equal(await resolve("@home"), `<svg id="home"/>`);
    assert.equal(await resolve("#heart"), icons.heart);
});

test("node render works with no options (napi backend, RGB, default resolver)", async () =>
{
    let result = await node.render({ layers: [{ type: "fill", color: "red" }] }, 4, 4);
    assert.equal(result.channels, 3);
    assert.deepEqual(pixelAt(result, 2, 2), { r: 255, g: 0, b: 0, a: 255 });
});

test("node render resolves file paths through the default resolver", async () =>
{
    // (The Material fixture has no paint and files aren't normalised: black ink.)
    let result = await node.render({ layers: [{ type: "svg", src: fixturePath }] }, 48, 48, { channels: 4 });
    assert.ok([...pixels(result)].some(([, , p]) => p.a > 200));
});

test("node render: options override the defaults; undefined keeps them", async () =>
{
    let calls = [];
    let resolveSvg = async src => { calls.push(src); return icons.square; };
    await node.render({ layers: [{ type: "svg", src: "whatever" }] }, 8, 8, { resolveSvg, backend: undefined });
    assert.deepEqual(calls, ["whatever"]);
});

// ---- end-to-end smoke ------------------------------------------------------

for (let size of [72, 144])
{
    for (let channels of [3, 4])
    {
        test(`smoke: example definition at ${size}x${size}, ${channels} channels`, async () =>
        {
            let result = await node.render(example, size, size, { channels });
            assert.equal(result.width, size);
            assert.equal(result.height, size);
            assert.equal(result.channels, channels);
            assert.equal(result.data.length, size * size * channels);

            let s = size / 72;
            // Heart (an outline) centred, moved up 7 virtual px: red ink there.
            let red = [...pixels(result)].filter(([, , p]) => p.r > 200 && p.g < 40 && p.b < 40 && p.a == 255);
            assert.ok(red.length > 50 * s * s, `only ${red.length} red pixels`);
            let mid = axis => (Math.min(...red.map(axis)) + Math.max(...red.map(axis))) / 2;
            assert.ok(Math.abs(mid(([x]) => x) - size / 2) <= 2 * s, "heart not centred horizontally");
            assert.ok(Math.abs(mid(([, y]) => y) - (size / 2 - 7 * s)) <= 3 * s, "heart not moved up 7 virtual px");
            // Corners are the black fill.
            assert.deepEqual(pixelAt(result, 0, 0), { r: 0, g: 0, b: 0, a: 255 });
            // Bottom-aligned white text: white ink in the bottom quarter only.
            let white = [...pixels(result)].filter(([, , p]) => p.r > 200 && p.g > 200 && p.b > 200);
            assert.ok(white.length > 10 * s * s, `only ${white.length} white pixels`);
            assert.ok(white.every(([, y]) => y >= size * 0.7), "white ink outside the bottom text area");
        });
    }
}
