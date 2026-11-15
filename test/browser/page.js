// In-page side of the browser tests (loaded by test/browser/blank.html).
// Exposes `window.bf` = `backendOps(browserBackend)` (test/browser/ops.js),
// called from Node through `callPage(page, name, ...args)` / `pageOps(page)`
// (test/browser/launch.js). Pixel results are made plain
// `{ data: <base64 string>, width, height, channels }` so they serialise
// quickly (Playwright serialises a number[] element by element - over 10x
// slower for the sample corpus); `callPage` decodes `data` back to a
// `Uint8Array`. All assertions happen in Node. Must stay browser-safe (no
// Node imports).
//
// Note: `node --test` also picks this file up (everything under test/); it
// does nothing outside a browser.

import { browserBackend } from "../../src/index.js";
import { backendOps } from "./ops.js";

/** Bytes -> base64 (chunked, so `fromCharCode` never gets too many arguments). */
function toBase64(bytes)
{
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

/** Make a result serialisable (typed-array `data` -> base64 string). */
const plain = result => result?.data ? { ...result, data: toBase64(result.data) } : result;

const bf = Object.fromEntries(Object.entries(backendOps(browserBackend))
    .map(([name, fn]) => [name, async (...args) => plain(await fn(...args))]));

if (typeof window != "undefined")
    window.bf = bf;
