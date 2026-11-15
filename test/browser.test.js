// Real-browser tests: run the core renderer with `browserBackend` inside each
// available browser engine (Playwright: chromium via installed Chrome/Edge,
// firefox, webkit) and assert on the returned pixels in Node. Engines that
// can't be launched are skipped with a reason; see test/browser/launch.js
// for BUTTON_FACE_BROWSER_TESTS (0 = skip all, 1 = fail if none launch).

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../scripts/static-server.js";
import { findBrowsers, closeBrowsers, openTestPage, callPage, pageOps } from "./browser/launch.js";
import { backendOps } from "./browser/ops.js";
import { backendCases } from "./backend-cases.js";
import { napiBackend } from "../src/backends/napi.js";
import { pixelAt, expectAllPixels } from "./helpers.js";

const browsers = await findBrowsers();
after(() => closeBrowsers(browsers));

let server;
before(async () =>
{
    if (browsers.some(b => b.browser))
        server = await startStaticServer({ root: fileURLToPath(new URL("../", import.meta.url)) });
});
after(() => server?.close());

for (let { name, label, browser, skip } of browsers)
{
    describe(`browser: ${label}`, { skip }, () =>
    {
        let page;
        before(async () => { page = await openTestPage(browser, server); });
        after(() => page?.close());

        test("test page loads the core entry and exposes window.bf (= backendOps)", async () =>
        {
            assert.deepEqual(await page.evaluate(() => Object.keys(window.bf).sort()),
                Object.keys(backendOps(napiBackend)).sort());
        });

        test("browserBackend implements the backend contract (in-page)", async () =>
        {
            let shape = await page.evaluate(async () =>
            {
                let { browserBackend } = await import("/src/index.js");
                return [typeof browserBackend.createCanvas, typeof browserBackend.loadSvgImage, Object.isFrozen(browserBackend)];
            });
            assert.deepEqual(shape, ["function", "function", true]);
        });

        // Shared backend contract cases (also run against napiBackend in backend.test.js).
        for (let { name: caseName, run } of backendCases)
            test(`browserBackend: ${caseName}`, () => run(pageOps(page)));

        test("bf.render of a single fill returns the fill colour (RGBA and RGB)", async () =>
        {
            let def = { layers: [{ type: "fill", color: "#3366cc" }] };
            let rgba = await callPage(page, "render", def, 8, 6, 4);
            assert.ok(rgba.data instanceof Uint8Array);
            assert.deepEqual([rgba.width, rgba.height, rgba.channels, rgba.data.length], [8, 6, 4, 8 * 6 * 4]);
            expectAllPixels(rgba, { r: 0x33, g: 0x66, b: 0xcc, a: 255 }, 0);
            let rgb = await callPage(page, "render", def, 8, 6, 3);
            assert.deepEqual([rgb.channels, rgb.data.length], [3, 8 * 6 * 3]);
            assert.deepEqual(pixelAt(rgb, 7, 5), { r: 0x33, g: 0x66, b: 0xcc, a: 255 });
        });

        test(`in-page errors reject with the browser's message (${name})`, async () =>
        {
            await assert.rejects(callPage(page, "render", { layers: [{ type: "nope" }] }, 4, 4, 4), /nope/);
        });
    });
}
