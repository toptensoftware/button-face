// The shared static file server (scripts/static-server.js) used by the browser
// demo page and the browser tests. Loopback only, port 0.

import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tempDir } from "./helpers.js";
import { startStaticServer } from "../scripts/static-server.js";

/**
 * GET a raw path (not normalised, unlike fetch) from the server.
 * @returns {Promise<{ status: number, type: string|undefined, cache: string|undefined, body: string }>}
 */
function get(url, path)
{
    let { hostname, port } = new URL(url);
    return new Promise((resolve, reject) =>
    {
        request({ hostname, port, path, method: "GET" }, res =>
        {
            let chunks = [];
            res.on("data", c => chunks.push(c));
            res.on("end", () => resolve({
                status: res.statusCode,
                type: res.headers["content-type"],
                cache: res.headers["cache-control"],
                body: Buffer.concat(chunks).toString("utf8"),
            }));
        }).on("error", reject).end();
    });
}

/** A temp dir with `site/` (the served root) and a `secret.txt` beside it. */
async function startSite(t)
{
    let dir = await tempDir(t);
    let root = join(dir, "site");
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(dir, "secret.txt"), "SECRET");
    let files = {
        "index.html": "<!doctype html><title>x</title>",
        "a.js": "export {};",
        "b.css": "body{}",
        "c.svg": "<svg/>",
        "d.png": "png",
        "e.json": "{}",
        "sub/f.js": "export const f = 1;",
        "my file.txt": "spaced",
    };
    for (let [name, body] of Object.entries(files))
        await writeFile(join(root, name), body);
    let server = await startStaticServer({ root });
    t.after(() => server.close());
    return server;
}

test("startStaticServer resolves { url, close } on a loopback port", async t =>
{
    let server = await startSite(t);
    assert.equal(typeof server.close, "function");
    let url = new URL(server.url);
    assert.equal(url.protocol, "http:");
    assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), url.hostname);
    assert.ok(Number(url.port) > 0);
    assert.ok(server.url.endsWith("/"));
});

test("serves files with the right MIME types and no-store caching", async t =>
{
    let server = await startSite(t);
    let cases = {
        "/index.html": "text/html",
        "/a.js": "text/javascript",
        "/b.css": "text/css",
        "/c.svg": "image/svg+xml",
        "/d.png": "image/png",
        "/e.json": "application/json",
        "/sub/f.js": "text/javascript",
    };
    for (let [path, type] of Object.entries(cases))
    {
        let res = await get(server.url, path);
        assert.equal(res.status, 200, path);
        assert.equal(res.type.split(";")[0], type, path);
        assert.equal(res.cache, "no-store", path);
    }
    assert.equal((await get(server.url, "/sub/f.js")).body, "export const f = 1;");
});

test("serves URL-encoded paths and ignores query strings", async t =>
{
    let server = await startSite(t);
    assert.equal((await get(server.url, "/my%20file.txt")).body, "spaced");
    assert.equal((await get(server.url, "/a.js?v=1")).body, "export {};");
});

test("serves index.html for a directory path", async t =>
{
    let server = await startSite(t);
    let res = await get(server.url, "/");
    assert.equal(res.status, 200);
    assert.match(res.body, /<title>x<\/title>/);
});

test("404 for missing files and directories without index.html", async t =>
{
    let server = await startSite(t);
    assert.equal((await get(server.url, "/nope.js")).status, 404);
    assert.equal((await get(server.url, "/sub/")).status, 404);
    assert.equal((await get(server.url, "/sub")).status, 404);
});

test("refuses paths escaping the root", async t =>
{
    let server = await startSite(t);
    for (let path of ["/../secret.txt", "/sub/../../secret.txt", "/%2e%2e/secret.txt", "/%2E%2E%2Fsecret.txt", "/..%5csecret.txt", "/%00"])
    {
        let res = await get(server.url, path);
        assert.ok(res.status == 403 || res.status == 404 || res.status == 400, `${path} -> ${res.status}`);
        assert.doesNotMatch(res.body, /SECRET/, path);
    }
});

test("close() stops the server", async () =>
{
    let server = await startStaticServer({ root: "." });
    await server.close();
    await assert.rejects(get(server.url, "/package.json"));
});
