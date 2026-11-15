// Google Material Symbols support (src/material.js): ref parsing/validation
// and the pure variant / URL / cache-key builders. No network.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    MATERIAL_DEFAULTS, parseMaterialRef, validateMaterialParams,
    materialVariant, materialIconUrl, materialCacheKey, createMaterialResolver,
} from "../src/material.js";
import { createSvgResolver } from "../src/resolve.js";
import { setRootAttribute } from "../src/recolor.js";
import { padViewBox } from "../src/svgSize.js";
import { assertBrowserSafe, readFixture, fakeFetch } from "./helpers.js";

test("material.js is browser-safe", () =>
{
    assertBrowserSafe("src/material.js");
});

// ---- Defaults --------------------------------------------------------------

test("MATERIAL_DEFAULTS are outlined / fill 0 / weight 200 / grade 0 / size 24", () =>
{
    assert.deepEqual({ ...MATERIAL_DEFAULTS }, { style: "outlined", fill: 0, weight: 200, grade: 0, size: 24 });
    assert.ok(Object.isFrozen(MATERIAL_DEFAULTS));
});

// ---- parseMaterialRef ------------------------------------------------------

test("parseMaterialRef: bare name gets the defaults", () =>
{
    assert.deepEqual(parseMaterialRef("home"),
        { name: "home", style: "outlined", fill: 0, weight: 200, grade: 0, size: 24 });
});

test("parseMaterialRef: query settings override the defaults", () =>
{
    assert.deepEqual(parseMaterialRef("home?weight=700&fill=1&style=rounded"),
        { name: "home", style: "rounded", fill: 1, weight: 700, grade: 0, size: 24 });
    assert.deepEqual(parseMaterialRef("arrow_back?grade=-25&size=48&style=sharp"),
        { name: "arrow_back", style: "sharp", fill: 0, weight: 200, grade: -25, size: 48 });
    assert.deepEqual(parseMaterialRef("10k?grade=200&size=20"),
        { name: "10k", style: "outlined", fill: 0, weight: 200, grade: 200, size: 20 });
});

test("parseMaterialRef: resolver-level defaults (partial) apply under the query", () =>
{
    let defaults = { weight: 400, style: "rounded" };
    assert.deepEqual(parseMaterialRef("home", defaults),
        { name: "home", style: "rounded", fill: 0, weight: 400, grade: 0, size: 24 });
    assert.deepEqual(parseMaterialRef("home?weight=100", defaults),
        { name: "home", style: "rounded", fill: 0, weight: 100, grade: 0, size: 24 });
});

test("parseMaterialRef: fill accepts 0, 1, true, false", () =>
{
    assert.equal(parseMaterialRef("home?fill=1").fill, 1);
    assert.equal(parseMaterialRef("home?fill=0").fill, 0);
    assert.equal(parseMaterialRef("home?fill=true").fill, 1);
    assert.equal(parseMaterialRef("home?fill=false").fill, 0);
});

test("parseMaterialRef: every weight 100..700 step 100 is accepted", () =>
{
    for (let w of [100, 200, 300, 400, 500, 600, 700])
        assert.equal(parseMaterialRef(`home?weight=${w}`).weight, w);
});

test("parseMaterialRef: bad names throw a TypeError naming the ref", () =>
{
    for (let ref of ["Home", "ho-me", "ho me", "home/x", "../home", "", "?fill=1", "hôme"])
        assert.throws(() => parseMaterialRef(ref),
            e => e instanceof TypeError && e.message.includes(`'${ref}'`) && /name/.test(e.message),
            ref);
});

test("parseMaterialRef: unknown, repeated and empty keys throw a TypeError naming the ref", () =>
{
    let cases = {
        "home?colour=red": /unknown setting 'colour'/,
        "home?fill=1&fill=0": /repeated setting 'fill'/,
        "home?weight=": /empty value for 'weight'/,
        "home?fill": /empty value for 'fill'/,
        "home?name=x": /unknown setting 'name'/,
    };
    for (let [ref, re] of Object.entries(cases))
        assert.throws(() => parseMaterialRef(ref),
            e => e instanceof TypeError && e.message.includes(`'${ref}'`) && re.test(e.message),
            ref);
});

test("parseMaterialRef: out-of-range values throw a RangeError naming the ref", () =>
{
    let cases = {
        "home?weight=250": /weight '250'/,
        "home?weight=800": /weight '800'/,
        "home?weight=abc": /weight 'abc'/,
        "home?weight=200.0": /weight '200.0'/,
        "home?weight=2e2": /weight '2e2'/,
        "home?weight=%20200": /weight ' 200'/,
        "home?grade=1": /grade '1'/,
        "home?size=18": /size '18'/,
        "home?style=filled": /style 'filled'/,
        "home?fill=2": /fill '2'/,
        "home?fill=yes": /fill 'yes'/,
    };
    for (let [ref, re] of Object.entries(cases))
        assert.throws(() => parseMaterialRef(ref),
            e => e instanceof RangeError && e.message.includes(`'${ref}'`) && re.test(e.message),
            ref);
});

// ---- validateMaterialParams ------------------------------------------------

test("validateMaterialParams normalises a partial settings object", () =>
{
    assert.deepEqual(validateMaterialParams({}), {});
    assert.deepEqual(validateMaterialParams({ fill: true, weight: 700 }), { fill: 1, weight: 700 });
    assert.deepEqual(validateMaterialParams({ fill: false, grade: -25, size: 48, style: "sharp" }),
        { fill: 0, grade: -25, size: 48, style: "sharp" });
    assert.deepEqual(validateMaterialParams({ weight: "300", grade: "200" }), { weight: 300, grade: 200 });
    assert.deepEqual(validateMaterialParams(undefined), {});
});

test("validateMaterialParams rejects bad creation-time defaults", () =>
{
    assert.throws(() => validateMaterialParams({ weight: 250 }), RangeError);
    assert.throws(() => validateMaterialParams({ weight: 200.5 }), RangeError);
    assert.throws(() => validateMaterialParams({ fill: 2 }), RangeError);
    assert.throws(() => validateMaterialParams({ size: "24px" }), RangeError);
    assert.throws(() => validateMaterialParams({ name: "home" }), /unknown setting 'name'/);
    assert.throws(() => validateMaterialParams({ colour: "red" }), TypeError);
    assert.throws(() => validateMaterialParams("weight=200"), TypeError);
    assert.throws(() => validateMaterialParams({ weight: 250 }, "material defaults"),
        /material defaults/);
});

// ---- Variant / URL / cache key ---------------------------------------------

const params = (overrides) => ({ ...parseMaterialRef("home"), weight: 400, ...overrides });

test("materialVariant: canonical wght -> grad -> fill order, omitting defaults", () =>
{
    let cases = [
        [{}, "default"],
        [{ fill: 1 }, "fill1"],
        [{ weight: 700 }, "wght700"],
        [{ weight: 700, fill: 1 }, "wght700fill1"],
        [{ weight: 300, grade: -25, fill: 1 }, "wght300gradN25fill1"],
        [{ weight: 700, grade: 200, fill: 1 }, "wght700grad200fill1"],
        [{ grade: 200 }, "grad200"],
        [{ weight: 200 }, "wght200"],
    ];
    for (let [overrides, expected] of cases)
        assert.equal(materialVariant(params(overrides)), expected, JSON.stringify(overrides));
});

test("materialIconUrl builds the fonts.gstatic.com URL", () =>
{
    assert.equal(materialIconUrl(params({})),
        "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/home/default/24px.svg");
    assert.equal(materialIconUrl(parseMaterialRef("arrow_back?style=rounded&weight=700&fill=1&size=48")),
        "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/arrow_back/wght700fill1/48px.svg");
    assert.equal(materialIconUrl(parseMaterialRef("add")),
        "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/add/wght200/24px.svg");
});

test("materialCacheKey is style/name/variant/size", () =>
{
    assert.equal(materialCacheKey(parseMaterialRef("home?weight=700&fill=1")), "outlined/home/wght700fill1/24");
    assert.equal(materialCacheKey(parseMaterialRef("home?style=sharp&grade=-25&size=40")),
        "sharp/home/wght200gradN25/40");
});

test("materialCacheKey: explicit weight=400 and a default weight of 400 share a key", () =>
{
    assert.equal(materialCacheKey(parseMaterialRef("home?weight=400")),
        materialCacheKey(parseMaterialRef("home", { weight: 400 })));
    assert.equal(materialCacheKey(parseMaterialRef("home?weight=400")), "outlined/home/default/24");
});

// ---- createMaterialResolver (fake fetch + cache, no network) ---------------

const homeSvg = readFixture("material-home.svg");
const HOME_URL = "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/home/wght200/24px.svg";
/** A fake async `{ get, set }` cache over a Map. */
function fakeCache(entries = {})
{
    let map = new Map(Object.entries(entries));
    return { map, get: async key => map.get(key), set: async (key, svg) => { map.set(key, svg); } };
}

const normalized = (svg, pad = 0.15) => padViewBox(setRootAttribute(svg, "fill", "currentColor"), pad);

test("createMaterialResolver: downloads, adds root fill=currentColor and pads the viewBox", async () =>
{
    let { fetch, calls } = fakeFetch({ [HOME_URL]: homeSvg });
    let svg = await createMaterialResolver({ fetch })("home");
    assert.deepEqual(calls, [HOME_URL]);
    assert.equal(svg, normalized(homeSvg));
    assert.match(svg, /fill="currentColor"/);
    assert.match(svg, /viewBox="-144 -1104 1248 1248"/);
});

test("createMaterialResolver: pad option (0 = only the fill change)", async () =>
{
    let { fetch } = fakeFetch({ [HOME_URL]: homeSvg });
    assert.equal(await createMaterialResolver({ fetch, pad: 0 })("home"), setRootAttribute(homeSvg, "fill", "currentColor"));
    assert.equal(await createMaterialResolver({ fetch, pad: 0.25 })("home"), normalized(homeSvg, 0.25));
    assert.throws(() => createMaterialResolver({ fetch, pad: -0.5 }), RangeError);
    assert.throws(() => createMaterialResolver({ fetch, pad: "x" }), RangeError);
});

test("createMaterialResolver: url option receives the parsed params; defaults option applies", async () =>
{
    let seen = [];
    let url = params => { seen.push(params); return `https://example.test/${params.name}.svg`; };
    let { fetch, calls } = fakeFetch({ "https://example.test/home.svg": homeSvg });
    await createMaterialResolver({ fetch, url, defaults: { weight: 700, fill: true } })("home?style=rounded");
    assert.deepEqual(calls, ["https://example.test/home.svg"]);
    assert.deepEqual(seen, [{ name: "home", style: "rounded", fill: 1, weight: 700, grade: 0, size: 24 }]);
});

test("createMaterialResolver: bad defaults throw at creation", () =>
{
    assert.throws(() => createMaterialResolver({ defaults: { weight: 250 } }),
        e => e instanceof RangeError && /material defaults/.test(e.message));
    assert.throws(() => createMaterialResolver({ defaults: { name: "x" } }), TypeError);
});

test("createMaterialResolver: validation errors reject before any fetch", async () =>
{
    let { fetch, calls } = fakeFetch();
    let resolve = createMaterialResolver({ fetch });
    await assert.rejects(resolve("Home"), TypeError);
    await assert.rejects(resolve("home?weight=250"), RangeError);
    assert.deepEqual(calls, []);
});

test("createMaterialResolver: cache hit skips fetch; miss stores the raw body", async () =>
{
    let cache = fakeCache({ "outlined/home/wght200/24": homeSvg });
    let { fetch, calls } = fakeFetch();
    assert.equal(await createMaterialResolver({ fetch, cache })("home"), normalized(homeSvg));
    assert.deepEqual(calls, []);

    let empty = fakeCache();
    let served = fakeFetch({ [HOME_URL]: homeSvg });
    await createMaterialResolver({ fetch: served.fetch, cache: empty })("home");
    assert.deepEqual([...empty.map], [["outlined/home/wght200/24", homeSvg]]);
});

test("createMaterialResolver: corrupt cached entry is re-fetched and overwritten", async () =>
{
    let cache = fakeCache({ "outlined/home/wght200/24": "<html>garbage" });
    let { fetch, calls } = fakeFetch({ [HOME_URL]: homeSvg });
    assert.equal(await createMaterialResolver({ fetch, cache })("home"), normalized(homeSvg));
    assert.equal(calls.length, 1);
    assert.equal(cache.map.get("outlined/home/wght200/24"), homeSvg);
});

test("createMaterialResolver: failing cache get/set don't fail the resolve", async () =>
{
    let cache = { get: async () => { throw new Error("read"); }, set: async () => { throw new Error("write"); } };
    let { fetch } = fakeFetch({ [HOME_URL]: homeSvg });
    assert.equal(await createMaterialResolver({ fetch, cache })("home"), normalized(homeSvg));
});

test("createMaterialResolver: concurrent and repeated identical icons fetch once", async () =>
{
    let { fetch, calls } = fakeFetch({ [HOME_URL]: homeSvg });
    let resolve = createMaterialResolver({ fetch });
    // weight=200 is the default, so all three share the cache key.
    let results = await Promise.all([resolve("home"), resolve("home?weight=200"), resolve("home?fill=0")]);
    assert.ok(results.every(svg => svg == normalized(homeSvg)));
    await resolve("home");
    assert.equal(calls.length, 1);
});

test("createMaterialResolver: 404 gives an 'unknown icon' error, not persisted, retried next time", async () =>
{
    let cache = fakeCache();
    let { fetch, calls } = fakeFetch();
    let resolve = createMaterialResolver({ fetch, cache });
    let url = "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/hoem/wght200/24px.svg";
    for (let i = 0; i < 2; i++)
        await assert.rejects(resolve("hoem"), e => e.message ==
            `unknown material icon 'hoem' or unsupported settings (HTTP 404 ${url})`);
    assert.equal(calls.length, 2);
    assert.equal(cache.map.size, 0);
});

test("createMaterialResolver: network errors, other HTTP errors and non-SVG bodies", async () =>
{
    let routes = { [HOME_URL]: new Error("getaddrinfo ENOTFOUND") };
    let { fetch, calls } = fakeFetch(routes);
    let cache = fakeCache();
    let resolve = createMaterialResolver({ fetch, cache });
    await assert.rejects(resolve("home"),
        e => e.message == `could not download material icon 'home' from ${HOME_URL}: getaddrinfo ENOTFOUND`
            && e.cause === routes[HOME_URL]);

    // A rejected download is dropped from memory: a retry fetches again.
    routes[HOME_URL] = homeSvg;
    assert.equal(await resolve("home"), normalized(homeSvg));
    assert.equal(calls.length, 2);

    let status500 = async () => ({ ok: false, status: 500, text: async () => "oops" });
    await assert.rejects(createMaterialResolver({ fetch: status500 })("home"),
        e => e.message == `could not download material icon 'home' from ${HOME_URL}: HTTP 500`);

    let notSvg = fakeFetch({ [HOME_URL]: "<html>captive portal</html>" });
    let otherCache = fakeCache();
    await assert.rejects(createMaterialResolver({ fetch: notSvg.fetch, cache: otherCache })("home"),
        /could not download material icon 'home' from .*: response is not an SVG/);
    assert.equal(otherCache.map.size, 0, "bad body not persisted");
});

test("createMaterialResolver: accepts a BOM / leading whitespace before <svg", async () =>
{
    let { fetch } = fakeFetch({ [HOME_URL]: "﻿\n" + homeSvg });
    assert.match(await createMaterialResolver({ fetch, pad: 0 })("home"), /<svg[^>]*fill="currentColor"/);
});

test("createMaterialResolver: fetch defaults to globalThis.fetch, looked up at call time", async (t) =>
{
    let resolve = createMaterialResolver();
    let { fetch, calls } = fakeFetch({ [HOME_URL]: homeSvg });
    t.mock.property(globalThis, "fetch", fetch);
    assert.equal(await resolve("home"), normalized(homeSvg));
    assert.deepEqual(calls, [HOME_URL]);
});

test("createMaterialResolver plugs into createSvgResolver under '@'", async () =>
{
    let { fetch } = fakeFetch({ [HOME_URL]: homeSvg });
    let resolve = createSvgResolver({ prefixes: { "@": createMaterialResolver({ fetch }) } });
    assert.equal(await resolve("@home"), normalized(homeSvg));
    await assert.rejects(resolve("@Home"), /material icon 'Home'/);
});
