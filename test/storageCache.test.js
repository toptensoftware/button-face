// createStorageCache: a generic async { get, set } cache over a Web Storage
// object (browser localStorage). Real browser behaviour (quota, private mode,
// SecurityError) can't be tested in Node - these tests use a fake Storage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createStorageCache } from "../src/storageCache.js";
import { createMaterialResolver } from "../src/material.js";
import { assertBrowserSafe, readFixture } from "./helpers.js";

/** A Map-backed fake of the Web Storage API. */
function fakeStorage(entries = {})
{
    let map = new Map(Object.entries(entries));
    return {
        map,
        getItem: key => map.has(key) ? map.get(key) : null,
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); },
    };
}

const throwing = () => { throw new Error("SecurityError / QuotaExceededError"); };

/**
 * Define `globalThis.localStorage` (a property descriptor) for one test and
 * restore it afterwards (`t.mock.property` needs an existing property; Node 24
 * has none).
 */
function mockLocalStorage(t, descriptor)
{
    let had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", { configurable: true, ...descriptor });
    t.after(() =>
    {
        if (had)
            Object.defineProperty(globalThis, "localStorage", had);
        else
            delete globalThis.localStorage;
    });
}

test("storageCache.js is browser-safe", () =>
{
    assertBrowserSafe("src/storageCache.js");
});

test("createStorageCache: get/set round-trip under the default prefix", async () =>
{
    let storage = fakeStorage();
    let cache = createStorageCache({ storage });
    assert.equal(await cache.get("outlined/home/default/24"), undefined);
    assert.equal(await cache.set("outlined/home/default/24", "<svg/>"), undefined);
    assert.deepEqual([...storage.map], [["button-face:material:outlined/home/default/24", "<svg/>"]]);
    assert.equal(await cache.get("outlined/home/default/24"), "<svg/>");
});

test("createStorageCache: custom prefix", async () =>
{
    let storage = fakeStorage({ "x:k": "v" });
    let cache = createStorageCache({ storage, prefix: "x:" });
    assert.equal(await cache.get("k"), "v");
    await cache.set("j", "w");
    assert.equal(storage.map.get("x:j"), "w");
});

test("createStorageCache: throwing storage methods -> get undefined, set resolves", async () =>
{
    let storage = { getItem: throwing, setItem: throwing, removeItem: throwing };
    let cache = createStorageCache({ storage });
    assert.equal(await cache.get("k"), undefined);
    assert.equal(await cache.set("k", "v"), undefined);
});

test("createStorageCache: defaults to globalThis.localStorage, looked up lazily", async (t) =>
{
    let cache = createStorageCache();
    // Node 24 has no global localStorage: a no-op.
    if (!("localStorage" in globalThis))
    {
        assert.equal(await cache.get("k"), undefined);
        await cache.set("k", "v");
    }
    let storage = fakeStorage();
    mockLocalStorage(t, { value: storage });
    await cache.set("k", "v");
    assert.equal(storage.map.get("button-face:material:k"), "v");
    assert.equal(await cache.get("k"), "v");
});

test("createStorageCache: a throwing localStorage getter -> no-op", async (t) =>
{
    mockLocalStorage(t, { get: throwing });
    let cache = createStorageCache();
    assert.equal(await cache.get("k"), undefined);
    assert.equal(await cache.set("k", "v"), undefined);
});

test("createMaterialResolver: default cache is localStorage", async (t) =>
{
    let homeSvg = readFixture("material-home.svg");
    let storage = fakeStorage({ "button-face:material:outlined/home/wght200/24": homeSvg });
    mockLocalStorage(t, { value: storage });
    let calls = [];
    let fetch = async url => { calls.push(url); throw new Error("offline"); };
    assert.match(await createMaterialResolver({ fetch })("home"), /fill="currentColor"/);
    assert.deepEqual(calls, []);

    // A miss downloads and stores the raw body.
    let fetch2 = async () => ({ ok: true, status: 200, text: async () => homeSvg });
    await createMaterialResolver({ fetch: fetch2 })("home?fill=1");
    assert.equal(storage.map.get("button-face:material:outlined/home/wght200fill1/24"), homeSvg);
});
