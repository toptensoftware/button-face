// Plan step 9: async, prefix-keyed SVG source resolver (src/resolve.js) and
// the Node-only file resolver (src/node/fileResolver.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSvgResolver, resolveBuiltinIcon } from "../src/resolve.js";
import { createFileResolver } from "../src/node/fileResolver.js";
import { icons } from "../src/icons.js";

const root = new URL("../", import.meta.url);
const fixturesDir = fileURLToPath(new URL("test/fixtures/", root));
const materialHome = readFileSync(join(fixturesDir, "material-home.svg"), "utf8");
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`;

// ---- Built-in icons ('#') --------------------------------------------------

test("resolveBuiltinIcon returns the built-in icon source", () =>
{
    assert.equal(resolveBuiltinIcon("heart"), icons.heart);
});

test("resolveBuiltinIcon throws for an unknown or inherited name", () =>
{
    assert.throws(() => resolveBuiltinIcon("nope"), /unknown built-in icon '#nope'/);
    assert.throws(() => resolveBuiltinIcon("toString"), /unknown built-in icon/);
    assert.throws(() => resolveBuiltinIcon(""), /unknown built-in icon/);
});

test("default resolver: '#name' resolves built-in icons", async () =>
{
    let resolve = createSvgResolver();
    assert.equal(await resolve("#heart"), icons.heart);
    for (let name of Object.keys(icons))
        assert.equal(await resolve(`#${name}`), icons[name]);
});

test("default resolver: unknown '#name' rejects", async () =>
{
    await assert.rejects(createSvgResolver()("#nope"), /unknown built-in icon '#nope'/);
});

// ---- Prefixes --------------------------------------------------------------

test("custom prefix handler is called with the remainder", async () =>
{
    let calls = [];
    let resolve = createSvgResolver({ prefixes: { "lib:": rest => { calls.push(rest); return SVG; } } });
    assert.equal(await resolve("lib:folder/icon"), SVG);
    assert.deepEqual(calls, ["folder/icon"]);
});

test("'@' prefix receives the remainder including any ?query verbatim", async () =>
{
    let calls = [];
    let resolve = createSvgResolver({ prefixes: { "@": rest => { calls.push(rest); return SVG; } } });
    await resolve("@home?fill=1");
    await resolve("@home?weight=700&fill=1&style=rounded");
    await resolve("@arrow_back");
    assert.deepEqual(calls, ["home?fill=1", "home?weight=700&fill=1&style=rounded", "arrow_back"]);
});

test("custom prefixes keep the built-in '#' prefix", async () =>
{
    let resolve = createSvgResolver({ prefixes: { "@": () => SVG } });
    assert.equal(await resolve("#heart"), icons.heart);
    assert.equal(await resolve("@x"), SVG);
});

test("prefix handlers may be async", async () =>
{
    let resolve = createSvgResolver({
        prefixes: { "@": async rest => { await new Promise(r => setTimeout(r, 5)); return `<svg id="${rest}"/>`; } },
    });
    assert.equal(await resolve("@home"), `<svg id="home"/>`);
});

test("handler rejections and throws propagate unchanged", async () =>
{
    let rejection = new Error("could not download");
    let thrown = new Error("bad name");
    let resolve = createSvgResolver({
        prefixes: {
            "@": async () => { throw rejection; },
            "!": () => { throw thrown; },
        },
    });
    await assert.rejects(resolve("@home"), err => err === rejection);
    // A synchronous throw still becomes a rejection, not a synchronous throw.
    let promise = resolve("!x");
    assert.ok(promise instanceof Promise);
    await assert.rejects(promise, err => err === thrown);
});

test("the longest matching prefix wins", async () =>
{
    let resolve = createSvgResolver({
        prefixes: {
            "@": rest => `<svg id="short:${rest}"/>`,
            "@@": rest => `<svg id="long:${rest}"/>`,
        },
    });
    assert.equal(await resolve("@@x"), `<svg id="long:x"/>`);
    assert.equal(await resolve("@x"), `<svg id="short:x"/>`);
});

test("a custom '#' handler replaces the built-ins; null removes a prefix", async () =>
{
    let custom = createSvgResolver({ prefixes: { "#": rest => `<svg id="${rest}"/>` } });
    assert.equal(await custom("#heart"), `<svg id="heart"/>`);

    let none = createSvgResolver({ prefixes: { "#": null } });
    await assert.rejects(none("#heart"), /no SVG resolver for '#heart'/);
});

test("unknown prefix with no fallback rejects", async () =>
{
    let resolve = createSvgResolver();
    await assert.rejects(resolve("@home"), /no SVG resolver for '@home'/);
    await assert.rejects(resolve("icons/home.svg"), /no SVG resolver/);
});

test("fallback receives the whole source when no prefix matches", async () =>
{
    let calls = [];
    let resolve = createSvgResolver({ fallback: src => { calls.push(src); return SVG; } });
    assert.equal(await resolve("icons/home.svg"), SVG);
    assert.equal(await resolve("#heart"), icons.heart); // prefixes take priority
    assert.deepEqual(calls, ["icons/home.svg"]);
});

test("invalid sources reject with TypeError", async () =>
{
    let resolve = createSvgResolver({ fallback: () => SVG });
    for (let src of [undefined, null, "", 42, {}])
        await assert.rejects(resolve(src), TypeError, `src ${String(src)}`);
});

test("a handler result that is not a string rejects with TypeError", async () =>
{
    let resolve = createSvgResolver({ prefixes: { "@": () => undefined, "!": async () => Buffer.from(SVG) } });
    await assert.rejects(resolve("@x"), /did not return an SVG string/);
    await assert.rejects(resolve("!x"), TypeError);
});

test("non-function prefix handlers throw when the resolver is created", () =>
{
    assert.throws(() => createSvgResolver({ prefixes: { "@": "nope" } }), TypeError);
    assert.throws(() => createSvgResolver({ prefixes: { "": () => SVG } }), TypeError);
    assert.throws(() => createSvgResolver({ fallback: 5 }), TypeError);
});

test("prefixes may be given as a Map", async () =>
{
    let resolve = createSvgResolver({ prefixes: new Map([["@", rest => `<svg id="${rest}"/>`]]) });
    assert.equal(await resolve("@a?b=1"), `<svg id="a?b=1"/>`);
    assert.equal(await resolve("#heart"), icons.heart);
});

// ---- Core stays browser-safe -----------------------------------------------

test("src/resolve.js imports no Node modules", () =>
{
    let source = readFileSync(new URL("src/resolve.js", root), "utf8");
    assert.doesNotMatch(source, /from\s+["'](node:|fs|path|@napi-rs)/);
});

// ---- Node file resolver ----------------------------------------------------

test("file resolver reads an SVG file by absolute path", async () =>
{
    let readFile = createFileResolver();
    assert.equal(await readFile(join(fixturesDir, "material-home.svg")), materialHome);
});

test("file resolver resolves relative paths against baseDir", async () =>
{
    let readFile = createFileResolver({ baseDir: fixturesDir });
    assert.equal(await readFile("material-home.svg"), materialHome);
});

test("file resolver plugs in as the fallback", async () =>
{
    let resolve = createSvgResolver({ fallback: createFileResolver({ baseDir: fixturesDir }) });
    assert.equal(await resolve("material-home.svg"), materialHome);
    assert.equal(await resolve("#heart"), icons.heart);
});

test("file resolver strips a UTF-8 BOM", async () =>
{
    let dir = mkdtempSync(join(tmpdir(), "button-face-"));
    try
    {
        writeFileSync(join(dir, "bom.svg"), "﻿" + SVG, "utf8");
        assert.equal(await createFileResolver({ baseDir: dir })("bom.svg"), SVG);
    }
    finally
    {
        rmSync(dir, { recursive: true, force: true });
    }
});

test("file resolver rejects for a missing file", async () =>
{
    await assert.rejects(createFileResolver({ baseDir: fixturesDir })("missing.svg"), { code: "ENOENT" });
});
