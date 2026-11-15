import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pkg, readRepoFile, importGraph } from "./helpers.js";

const licence = readRepoFile("LICENSE");

test("package identity and version", () =>
{
    assert.equal(pkg.name, "@toptensoftware/button-face");
    assert.equal(pkg.version, "0.0.1");
    assert.equal(pkg.type, "module");
    assert.equal(pkg.author, "Topten Software");
});

test("licence is MIT with the Topten copyright line", () =>
{
    assert.equal(pkg.license, "MIT");
    assert.match(licence, /^MIT License/);
    assert.ok(licence.includes("Copyright © 2026 Topten Software"));
});

test("targets current Node", () =>
{
    assert.equal(pkg.engines?.node, ">=24");
});

test("the only runtime dependency is @napi-rs/canvas (no sharp / node-canvas)", () =>
{
    assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ["@napi-rs/canvas"]);
});

test("the only devDependency is playwright-core (browser tests; no bundled browsers)", () =>
{
    assert.deepEqual(Object.keys(pkg.devDependencies ?? {}), ["playwright-core"]);
});

test("every module reachable from the exports is shipped (in `files`) and exists", () =>
{
    assert.deepEqual(Object.keys(pkg.exports), [".", "./node"]);
    let shipped = rel => pkg.files.some(f => f.endsWith("/") ? rel.startsWith(f) : rel == f);
    for (let entry of Object.values(pkg.exports))
    {
        for (let file of importGraph(entry.replace(/^\.\//, "")).files)
        {
            assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} missing`);
            assert.ok(shipped(file), `${file} is not covered by package.json files`);
        }
    }
    assert.ok(shipped("LICENSE"));
});
