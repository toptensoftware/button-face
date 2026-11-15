// The sample-render script for human review. Its output is
// checked by eye (scratch/samples/contact-sheet.png); this only proves the
// script runs and writes PNGs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pkg, importGraph, assertBrowserSafe } from "./helpers.js";
import { groups, sampleSize, sampleChannels, sampleFileName, isTextSample, renderSample, toRgba } from "../scripts/sample-defs.js";

const script = fileURLToPath(new URL("../scripts/render-samples.js", import.meta.url));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = file => PNG_SIGNATURE.every((b, i) => readFileSync(file)[i] == b);

test("package.json has an npm 'samples' script", () =>
{
    assert.equal(pkg.scripts.samples, "node scripts/render-samples.js");
});

test("sample-defs.js is browser-safe (whole import graph)", () =>
{
    let { files, external } = importGraph("scripts/sample-defs.js");
    assert.deepEqual(external, []);
    assert.ok(files.includes("src/index.js"), "sample-defs should import the core entry");
    assert.ok(!files.includes("src/node.js"), "sample-defs must not import the node entry");
    for (let file of files)
        assertBrowserSafe(file);
});

test("sample-defs exports non-empty groups with unique names and labelled samples", () =>
{
    assert.ok(Array.isArray(groups) && groups.length > 0);
    let names = groups.map(g => g.name);
    assert.equal(new Set(names).size, names.length, "duplicate group names");
    for (let group of groups)
    {
        assert.match(group.name, /^[a-z0-9-]+$/);
        assert.ok(group.samples.length > 0, `${group.name} has no samples`);
        for (let sample of group.samples)
        {
            assert.equal(typeof sample.label, "string");
            assert.ok(Array.isArray(sample.layers));
        }
    }
});

test("sampleSize defaults to 72 and accepts a number or [w, h]", () =>
{
    assert.deepEqual(sampleSize({}), [72, 72]);
    assert.deepEqual(sampleSize({ size: 144 }), [144, 144]);
    assert.deepEqual(sampleSize({ size: [144, 72] }), [144, 72]);
});

test("sampleChannels defaults to 3", () =>
{
    assert.equal(sampleChannels({}), 3);
    assert.equal(sampleChannels({ channels: 4 }), 4);
    assert.equal(sampleChannels({ channels: 3 }), 3);
});

test("sampleFileName is <nn>-<slug>[-rgba].png", () =>
{
    assert.equal(sampleFileName(0, { label: "color red" }), "01-color-red.png");
    assert.equal(sampleFileName(11, { label: "padding [12,2]", channels: 4 }), "12-padding-12-2-rgba.png");
    assert.equal(sampleFileName(2, { label: "\\n break" }), "03-n-break.png");
    assert.equal(sampleFileName(4, { label: "stroke->path" }), "05-stroke-path.png");
});

test("sample file names are unique within each group", () =>
{
    for (let group of groups)
    {
        let files = group.samples.map((s, i) => sampleFileName(i, s));
        assert.equal(new Set(files).size, files.length, group.name);
    }
});

test("isTextSample detects text layers and svg layers with text", () =>
{
    assert.equal(isTextSample({ layers: [{ type: "fill", color: "black" }] }), false);
    assert.equal(isTextSample({ layers: [{ type: "svg", src: "#heart" }] }), false);
    assert.equal(isTextSample({ layers: [{ type: "fill", color: "black" }, { type: "text", text: "Hi" }] }), true);
    assert.equal(isTextSample({ layers: [{ type: "svg", svg: "<svg/>", text: "42" }] }), true);
    let all = groups.flatMap(g => g.samples);
    assert.ok(all.some(isTextSample) && !all.every(isTextSample));
});

test("renderSample calls render with the sample's definition, size and channels plus extra options", async () =>
{
    let calls = [];
    let fakeRender = async (...args) => (calls.push(args), "result");
    let layers = [{ type: "fill", color: "red" }];
    let virtualSize = { width: 144, height: 72 };
    assert.equal(await renderSample(fakeRender, { label: "x", size: [144, 72], channels: 4, virtualSize, layers }, { backend: "b" }), "result");
    assert.equal(await renderSample(fakeRender, { label: "y", layers }), "result");
    assert.deepEqual(calls, [
        [{ virtualSize, layers }, 144, 72, { channels: 4, backend: "b" }],
        [{ virtualSize: undefined, layers }, 72, 72, { channels: 3 }],
    ]);
});

test("toRgba expands RGB to opaque RGBA and copies RGBA as-is", () =>
{
    let rgb = toRgba({ data: Uint8Array.of(1, 2, 3, 4, 5, 6), width: 2, height: 1, channels: 3 });
    assert.ok(rgb instanceof Uint8ClampedArray);
    assert.deepEqual([...rgb], [1, 2, 3, 255, 4, 5, 6, 255]);
    let rgba = toRgba({ data: Uint8Array.of(1, 2, 3, 0, 4, 5, 6, 128), width: 1, height: 2, channels: 4 });
    assert.deepEqual([...rgba], [1, 2, 3, 0, 4, 5, 6, 128]);
});

test("render-samples writes sample PNGs and a contact sheet to the given directory", () =>
{
    let dir = mkdtempSync(join(tmpdir(), "button-face-samples-"));
    try
    {
        execFileSync(process.execPath, [script, dir], { stdio: "pipe" });
        let files = readdirSync(dir, { recursive: true }).map(f => join(dir, f)).filter(f => f.endsWith(".png"));
        assert.ok(files.length > 100, `only ${files.length} PNGs written`);
        assert.ok(files.includes(join(dir, "contact-sheet.png")), "no contact-sheet.png");
        for (let file of files)
            assert.ok(isPng(file), `${file} is not a PNG`);
        for (let group of groups)
        {
            let expected = group.samples.map((s, i) => sampleFileName(i, s)).sort();
            assert.deepEqual(readdirSync(join(dir, group.name)).sort(), expected, group.name);
        }
    }
    finally
    {
        rmSync(dir, { recursive: true, force: true });
    }
});
