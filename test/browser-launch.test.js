// Unit tests for the browser test launcher (test/browser/launch.js) with a
// fake Playwright - no real browser is started here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { browserTestMode, findBrowsers, closeBrowsers, ENGINES } from "./browser/launch.js";

/**
 * A fake `playwright-core` module. `available` maps "<engine>" or
 * "<engine>:<channel>" to true for launches that succeed; everything else
 * rejects. `launches` records every attempt as "<engine>[:<channel>]".
 */
function fakePlaywright(available)
{
    let launches = [];
    let closed = [];
    let engine = name => ({
        async launch(options = {})
        {
            let key = options.channel ? `${name}:${options.channel}` : name;
            launches.push(key);
            if (!available[key])
                throw new Error(`browserType.launch: Executable doesn't exist for ${key}\n  more detail`);
            return { key, close: async () => { closed.push(key); } };
        },
    });
    let playwright = { chromium: engine("chromium"), firefox: engine("firefox"), webkit: engine("webkit") };
    return { load: async () => playwright, launches, closed };
}

test("ENGINES: chromium (chrome -> msedge -> bundled), firefox, webkit", () =>
{
    assert.deepEqual(ENGINES.map(e => e.name), ["chromium", "firefox", "webkit"]);
    assert.deepEqual(ENGINES[0].channels, ["chrome", "msedge", undefined]);
});

test("browserTestMode: unset/empty = auto, 0 = off, 1 = on, anything else throws", () =>
{
    assert.equal(browserTestMode({}), "auto");
    assert.equal(browserTestMode({ BUTTON_FACE_BROWSER_TESTS: "" }), "auto");
    assert.equal(browserTestMode({ BUTTON_FACE_BROWSER_TESTS: "0" }), "off");
    assert.equal(browserTestMode({ BUTTON_FACE_BROWSER_TESTS: "1" }), "on");
    assert.throws(() => browserTestMode({ BUTTON_FACE_BROWSER_TESTS: "yes" }), /BUTTON_FACE_BROWSER_TESTS must be 0 or 1/);
});

test("findBrowsers: first working chromium channel wins; failures become skip reasons", async () =>
{
    let fake = fakePlaywright({ "chromium:msedge": true, webkit: true });
    let found = await findBrowsers({ env: {}, loadPlaywright: fake.load });
    assert.deepEqual(fake.launches, ["chromium:chrome", "chromium:msedge", "firefox", "webkit"]);
    assert.deepEqual(found.map(b => [b.name, b.label, b.browser?.key, b.skip]), [
        ["chromium", "chromium (msedge)", "chromium:msedge", undefined],
        ["firefox", "firefox", undefined, "firefox: browserType.launch: Executable doesn't exist for firefox"],
        ["webkit", "webkit", "webkit", undefined],
    ]);
    await closeBrowsers(found);
    assert.deepEqual(fake.closed, ["chromium:msedge", "webkit"]);
});

test("findBrowsers: bundled chromium is the last resort; all-chromium failure lists every channel", async () =>
{
    let found = await findBrowsers({ env: {}, loadPlaywright: fakePlaywright({ chromium: true }).load });
    assert.equal(found[0].label, "chromium (bundled)");
    found = await findBrowsers({ env: {}, loadPlaywright: fakePlaywright({}).load });
    assert.match(found[0].skip, /^chromium: chrome: .*; msedge: .*; bundled: /);
});

test("findBrowsers: BUTTON_FACE_BROWSER_TESTS=0 skips without loading playwright", async () =>
{
    let found = await findBrowsers({ env: { BUTTON_FACE_BROWSER_TESTS: "0" }, loadPlaywright: () => assert.fail("loaded") });
    assert.deepEqual(found.map(b => b.skip), Array(3).fill("BUTTON_FACE_BROWSER_TESTS=0"));
});

test("findBrowsers: missing playwright-core skips every engine (auto) or throws (on)", async () =>
{
    let loadPlaywright = async () => { throw new Error("Cannot find package 'playwright-core'"); };
    let found = await findBrowsers({ env: {}, loadPlaywright });
    assert.equal(found.length, 3);
    for (let b of found)
        assert.match(b.skip, /playwright-core is not installed/);
    await assert.rejects(findBrowsers({ env: { BUTTON_FACE_BROWSER_TESTS: "1" }, loadPlaywright }), /BUTTON_FACE_BROWSER_TESTS=1 but no browser could be launched/);
});

test("findBrowsers: BUTTON_FACE_BROWSER_TESTS=1 throws only when no engine launches", async () =>
{
    let env = { BUTTON_FACE_BROWSER_TESTS: "1" };
    let found = await findBrowsers({ env, loadPlaywright: fakePlaywright({ firefox: true }).load });
    assert.deepEqual(found.filter(b => b.browser).map(b => b.name), ["firefox"]);
    await assert.rejects(findBrowsers({ env, loadPlaywright: fakePlaywright({}).load }), /no browser could be launched[\s\S]*webkit: /);
});
