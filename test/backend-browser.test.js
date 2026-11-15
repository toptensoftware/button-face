// Browser rendering backend (src/backends/browser.js), exercised with fake
// browser globals injected through createBrowserBackend(env). No real browser
// here - see the browser tests for that.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrowserBackend, browserBackend } from "../src/backends/browser.js";
import { prepareSvgImage } from "../src/svgSize.js";

const SVG = `<svg width="10" height="10"><rect width="10" height="10" fill="red"/></svg>`;

/**
 * A fake browser environment. `decode` controls every Image's decode().
 * @param {{ offscreen?: boolean, document?: boolean, image?: boolean,
 *   decode?: (img: object) => Promise<void> }} [options]
 */
function fakeEnv({ offscreen = true, document = true, image = true, decode = async () => {} } = {})
{
    let log = { created: [], revoked: [], images: [], blobs: [], elements: [] };
    let env = {
        Blob: class
        {
            constructor(parts, options)
            {
                this.parts = parts;
                this.type = options?.type;
                log.blobs.push(this);
            }
        },
        URL: {
            createObjectURL(blob)
            {
                let url = `blob:fake/${log.created.length + 1}`;
                log.created.push({ url, blob });
                return url;
            },
            revokeObjectURL(url) { log.revoked.push(url); },
        },
    };
    if (offscreen)
    {
        env.OffscreenCanvas = class
        {
            constructor(width, height) { this.width = width; this.height = height; this.kind = "offscreen"; }
        };
    }
    if (document)
    {
        env.document = {
            createElement(tag)
            {
                let el = { tag, width: 300, height: 150, kind: "element" };
                log.elements.push(el);
                return el;
            },
        };
    }
    if (image)
    {
        env.Image = class
        {
            constructor()
            {
                this.src = "";
                this.revokedAtDecode = null;
                log.images.push(this);
            }
            async decode()
            {
                this.revokedAtDecode = log.revoked.includes(this.src);
                return decode(this);
            }
        };
    }
    return { env, log };
}

test("browserBackend implements the backend contract and is frozen", () =>
{
    for (let backend of [browserBackend, createBrowserBackend(fakeEnv().env)])
    {
        assert.equal(typeof backend.createCanvas, "function");
        assert.equal(typeof backend.loadSvgImage, "function");
        assert.ok(Object.isFrozen(backend));
    }
});

test("createCanvas prefers OffscreenCanvas", () =>
{
    let { env, log } = fakeEnv();
    let canvas = createBrowserBackend(env).createCanvas(30, 20);
    assert.ok(canvas instanceof env.OffscreenCanvas);
    assert.equal(canvas.width, 30);
    assert.equal(canvas.height, 20);
    assert.equal(log.elements.length, 0);
});

test("createCanvas falls back to document.createElement('canvas') with width/height set", () =>
{
    let { env, log } = fakeEnv({ offscreen: false });
    let canvas = createBrowserBackend(env).createCanvas(30, 20);
    assert.deepEqual(log.elements, [canvas]);
    assert.equal(canvas.tag, "canvas");
    assert.equal(canvas.width, 30);
    assert.equal(canvas.height, 20);
});

test("createCanvas throws a clear error with neither OffscreenCanvas nor document", () =>
{
    let { env } = fakeEnv({ offscreen: false, document: false });
    assert.throws(() => createBrowserBackend(env).createCanvas(4, 4), /OffscreenCanvas/);
});

test("globals are looked up at call time (module imports in Node; createCanvas throws there)", () =>
{
    let env = {};
    let backend = createBrowserBackend(env);
    assert.throws(() => backend.createCanvas(4, 4), /OffscreenCanvas/);
    Object.assign(env, fakeEnv().env);
    assert.equal(backend.createCanvas(4, 4).width, 4);

    // Node has no OffscreenCanvas or document.
    if (typeof globalThis.OffscreenCanvas == "undefined" && typeof globalThis.document == "undefined")
        assert.throws(() => browserBackend.createCanvas(4, 4), /OffscreenCanvas/);
});

test("loadSvgImage decodes the prepared SVG as an image/svg+xml Blob via an object URL", async () =>
{
    let { env, log } = fakeEnv();
    let img = await createBrowserBackend(env).loadSvgImage(SVG, 20, 30);
    assert.deepEqual(log.images, [img]);
    assert.equal(log.blobs.length, 1);
    assert.equal(log.blobs[0].type, "image/svg+xml");
    assert.deepEqual(log.blobs[0].parts, [prepareSvgImage(SVG, 20, 30)]);
    assert.equal(log.created.length, 1);
    assert.equal(log.created[0].blob, log.blobs[0]);
    assert.equal(img.src, log.created[0].url);
    assert.equal(img.revokedAtDecode, false, "URL revoked before decode finished");
    assert.deepEqual(log.revoked, [img.src], "URL not revoked after decode");
});

test("loadSvgImage revokes the object URL when decode() rejects, and rejects", async () =>
{
    let { env, log } = fakeEnv({ decode: async () => { throw new Error("EncodingError"); } });
    await assert.rejects(createBrowserBackend(env).loadSvgImage(SVG, 10, 10), /EncodingError/);
    assert.equal(log.created.length, 1);
    assert.deepEqual(log.revoked, [log.created[0].url]);
});

for (let [label, svg] of [["empty string", ""], ["whitespace", "  "], ["number", 42], ["undefined", undefined]])
{
    test(`loadSvgImage rejects with TypeError on non-string/empty input (${label})`, async () =>
    {
        let { env, log } = fakeEnv();
        await assert.rejects(createBrowserBackend(env).loadSvgImage(svg, 10, 10), TypeError);
        assert.equal(log.created.length, 0);
    });
}

test("loadSvgImage rejects on non-SVG markup without creating a URL", async () =>
{
    let { env, log } = fakeEnv();
    await assert.rejects(createBrowserBackend(env).loadSvgImage("this is not an svg", 10, 10));
    await assert.rejects(createBrowserBackend(env).loadSvgImage("<div></div>", 10, 10));
    assert.equal(log.created.length, 0);
});

test("loadSvgImage rejects clearly when there is no Image (e.g. a Web Worker), without leaking a URL", async () =>
{
    let { env, log } = fakeEnv({ image: false });
    await assert.rejects(createBrowserBackend(env).loadSvgImage(SVG, 10, 10), /Image/);
    assert.equal(log.created.length, 0);
});
