// createFsCache: a generic async { get, set } cache storing one file per key
// under a directory (Node only). Uses a temp dir, removed after each test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFsCache } from "../src/node/fsCache.js";
import { tempDir } from "./helpers.js";

/** Every file under `dir`, as forward-slash paths relative to it. */
async function listFiles(dir)
{
    let entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries.filter(e => e.isFile())
        .map(e => join(e.parentPath, e.name).slice(dir.length + 1).replaceAll("\\", "/"))
        .sort();
}

test("createFsCache: miss -> undefined; set then get round-trips", async (t) =>
{
    let dir = await tempDir(t);
    let cache = createFsCache({ dir });
    assert.equal(cache.dir, dir);
    assert.equal(await cache.get("outlined/home/default/24"), undefined);
    assert.equal(await cache.set("outlined/home/default/24", "<svg/>"), undefined);
    assert.equal(await cache.get("outlined/home/default/24"), "<svg/>");
});

test("createFsCache: files land at <dir>/<key>.svg, dirs created, no temp files left", async (t) =>
{
    let dir = await tempDir(t);
    let cache = createFsCache({ dir: join(dir, "a", "b") });
    await cache.set("outlined/home/default/24", "<svg>1</svg>");
    await cache.set("outlined/home/default/24", "<svg>2</svg>");   // overwrite
    await cache.set("rounded/arrow_back/wght700fill1/48", "<svg>3</svg>");
    assert.deepEqual(await listFiles(dir), [
        "a/b/outlined/home/default/24.svg",
        "a/b/rounded/arrow_back/wght700fill1/48.svg",
    ]);
    assert.equal(await readFile(join(dir, "a/b/outlined/home/default/24.svg"), "utf8"), "<svg>2</svg>");
});

test("createFsCache: concurrent sets of the same key both succeed", async (t) =>
{
    let dir = await tempDir(t);
    let cache = createFsCache({ dir });
    let values = Array.from({ length: 8 }, (_, i) => `<svg>${i}</svg>`);
    await Promise.all(values.map(v => cache.set("outlined/home/default/24", v)));
    assert.ok(values.includes(await cache.get("outlined/home/default/24")));
    assert.deepEqual(await listFiles(dir), ["outlined/home/default/24.svg"]);
});

test("createFsCache: invalid keys reject (no path traversal)", async (t) =>
{
    let dir = await tempDir(t);
    let cache = createFsCache({ dir });
    for (let key of ["", "../x", "a/../b", "/abs", "C:/x", "a\\b", "a//b", "a/", "Home", "a.b", "a b", "a/./b"])
    {
        await assert.rejects(cache.get(key), TypeError, `get '${key}'`);
        await assert.rejects(cache.set(key, "<svg/>"), TypeError, `set '${key}'`);
    }
    assert.deepEqual(await listFiles(dir), []);
});

test("createFsCache: unreadable entry -> undefined", async (t) =>
{
    let dir = await tempDir(t);
    await mkdir(join(dir, "k.svg"));   // a directory where the file should be
    assert.equal(await createFsCache({ dir }).get("k"), undefined);
});

test("createFsCache: default dir is <tmpdir>/button-face/material", () =>
{
    assert.equal(createFsCache().dir, join(tmpdir(), "button-face", "material"));
});
