import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const licence = readFileSync(new URL("LICENSE", root), "utf8");

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
