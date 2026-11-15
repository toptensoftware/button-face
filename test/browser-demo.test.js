// The manual browser demo page (npm run samples:browser). Its visual output is
// checked by eye in a real browser; this only checks the wiring: the npm
// script, that the page module is browser-safe, and that the served HTML
// loads it as an external module script.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pkg, importGraph, assertBrowserSafe } from "./helpers.js";
import { startStaticServer } from "../scripts/static-server.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const DEMO_PATH = "scripts/browser-demo/";

test("package.json has an npm 'samples:browser' script", () =>
{
    assert.equal(pkg.scripts["samples:browser"], "node scripts/serve-demo.js");
});

test("demo.js import graph is browser-safe and uses the core entry + sample defs", () =>
{
    let { files, external } = importGraph(`${DEMO_PATH}demo.js`);
    assert.deepEqual(external, []);
    assert.ok(files.includes("src/index.js"));
    assert.ok(files.includes("scripts/sample-defs.js"));
    assert.ok(!files.includes("src/node.js"));
    for (let file of files)
        assertBrowserSafe(file);
});

test("served demo HTML loads demo.js as an external module script (no inline scripts)", async t =>
{
    let server = await startStaticServer({ root: repoRoot });
    t.after(() => server.close());
    let res = await fetch(new URL(DEMO_PATH, server.url));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^text\/html/);
    let html = await res.text();
    let scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.equal(scripts.length, 1, "expected exactly one <script>");
    let [, attrs, body] = scripts[0];
    assert.match(attrs, /\btype="module"/);
    assert.match(attrs, /\bsrc="demo\.js"/);
    assert.equal(body.trim(), "");
    let js = await fetch(new URL(`${DEMO_PATH}demo.js`, server.url));
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type"), /^text\/javascript/);
});

test("serve-demo.js serves the repo root and prints the demo URL", async t =>
{
    let child = spawn(process.execPath, [fileURLToPath(new URL("../scripts/serve-demo.js", import.meta.url)), "0"], { stdio: ["ignore", "pipe", "pipe"] });
    t.after(() => child.kill());
    let url = await new Promise((resolve, reject) =>
    {
        let out = "";
        child.stdout.on("data", chunk =>
        {
            out += chunk;
            let m = out.match(/http:\/\/\S+/);
            if (m)
                resolve(m[0]);
        });
        child.on("exit", code => reject(new Error(`serve-demo exited (${code}): ${out}`)));
    });
    assert.ok(url.endsWith(`/${DEMO_PATH}`), url);
    let res = await fetch(url);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /demo\.js/);
});
