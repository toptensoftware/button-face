// Google Material Symbols: `@name?settings` reference parsing/validation, the
// pure variant / download URL / cache key builders, and the downloading
// resolver. Browser-safe (no Node imports; uses the global `fetch`); see
// wip/wip-material-icons.md for the verified URL scheme.

import { setRootAttribute } from "./recolor.js";
import { padViewBox } from "./svgSize.js";
import { createStorageCache } from "./storageCache.js";

/**
 * Material Symbols settings (the font's style and variable axes).
 * @typedef {object} MaterialParams
 * @property {"outlined"|"rounded"|"sharp"} style
 * @property {0|1} fill
 * @property {100|200|300|400|500|600|700} weight
 * @property {-25|0|200} grade
 * @property {20|24|40|48} size - optical size (opsz), also the SVG's px size
 */

/**
 * Default settings. Weight 200 (not Google's 400) matches the built-in icons.
 * @type {Readonly<MaterialParams>}
 */
export const MATERIAL_DEFAULTS = Object.freeze({ style: "outlined", fill: 0, weight: 200, grade: 0, size: 24 });

const STYLES = ["outlined", "rounded", "sharp"];
const INTEGERS = {
    weight: [100, 200, 300, 400, 500, 600, 700],
    grade: [-25, 0, 200],
    size: [20, 24, 40, 48],
};
const FILLS = new Map([[0, 0], [1, 1], [false, 0], [true, 1], ["0", 0], ["1", 1], ["false", 0], ["true", 1]]);
const NAME = /^[a-z0-9_]+$/;
const INTEGER = /^-?\d+$/;

/**
 * Normalise one setting value; returns undefined if it isn't allowed.
 * @param {string} key
 * @param {unknown} value
 */
function normalizeSetting(key, value)
{
    if (key == "style")
        return STYLES.includes(value) ? value : undefined;
    if (key == "fill")
        return FILLS.get(value);
    let n = typeof value == "string" && INTEGER.test(value) ? Number(value) : value;
    return INTEGERS[key].includes(n) ? n : undefined;
}

/**
 * Validate and normalise a (partial) settings object, e.g. resolver-level
 * defaults or the settings parsed from a ref. Values may be numbers/booleans
 * or their string forms; `fill` accepts 0, 1, true, false.
 * @param {object|undefined} params
 * @param {string} [where] - error message prefix
 * @returns {Partial<MaterialParams>} only the keys given, normalised
 * @throws {TypeError} not an object, unknown key or empty value
 * @throws {RangeError} value outside the allowed set
 */
export function validateMaterialParams(params, where = "material settings")
{
    if (params == null)
        return {};
    if (typeof params != "object")
        throw new TypeError(`${where}: settings must be an object; got ${JSON.stringify(params)}`);
    let result = {};
    for (let [key, value] of Object.entries(params))
    {
        if (!Object.hasOwn(MATERIAL_DEFAULTS, key))
            throw new TypeError(`${where}: unknown setting '${key}' (expected ${Object.keys(MATERIAL_DEFAULTS).join(", ")})`);
        if (value === "")
            throw new TypeError(`${where}: empty value for '${key}'`);
        let normalized = normalizeSetting(key, value);
        if (normalized === undefined)
        {
            let allowed = key == "style" ? STYLES : key == "fill" ? [0, 1] : INTEGERS[key];
            throw new RangeError(`${where}: invalid ${key} '${value}' (expected ${allowed.join(", ")})`);
        }
        result[key] = normalized;
    }
    return result;
}

/**
 * Parse a Material Symbols reference (the part after the `@` prefix), e.g.
 * `"home"` or `"home?weight=700&fill=1&style=rounded"`.
 * @param {string} ref
 * @param {Partial<MaterialParams>} [defaults] - resolver-level defaults (already
 *   validated), applied over MATERIAL_DEFAULTS and under the query
 * @returns {MaterialParams & {name: string}}
 * @throws {TypeError} bad name, unknown/repeated key or empty value
 * @throws {RangeError} value outside the allowed set
 */
export function parseMaterialRef(ref, defaults)
{
    let where = `material icon '${ref}'`;
    let q = ref.indexOf("?");
    let name = q < 0 ? ref : ref.slice(0, q);
    if (!NAME.test(name))
        throw new TypeError(`${where}: invalid name '${name}' (expected lowercase letters, digits and '_', e.g. 'arrow_back')`);

    let query = {};
    for (let [key, value] of new URLSearchParams(q < 0 ? "" : ref.slice(q + 1)))
    {
        if (Object.hasOwn(query, key))
            throw new TypeError(`${where}: repeated setting '${key}'`);
        query[key] = value;
    }
    return { name, ...MATERIAL_DEFAULTS, ...defaults, ...validateMaterialParams(query, where) };
}

/**
 * The download variant segment: `wght{W}` (omitted for 400), `grad{G}`
 * (`gradN25` / `grad200`, omitted for 0), `fill1` (omitted for 0), in that
 * order; `default` when all are omitted.
 * @param {MaterialParams} params
 * @returns {string}
 */
export function materialVariant({ weight, grade, fill })
{
    let variant = (weight != 400 ? `wght${weight}` : "")
        + (grade != 0 ? `grad${String(grade).replace("-", "N")}` : "")
        + (fill ? "fill1" : "");
    return variant || "default";
}

/**
 * The fonts.gstatic.com download URL for an icon.
 * @param {MaterialParams & {name: string}} params
 * @returns {string}
 */
export function materialIconUrl(params)
{
    return `https://fonts.gstatic.com/s/i/short-term/release/materialsymbols${params.style}/${params.name}/${materialVariant(params)}/${params.size}px.svg`;
}

/**
 * The cache key (canonical download identity): `{style}/{name}/{variant}/{size}`.
 * @param {MaterialParams & {name: string}} params
 * @returns {string}
 */
export function materialCacheKey(params)
{
    return `${params.style}/${params.name}/${materialVariant(params)}/${params.size}`;
}

/**
 * A persistent string cache (e.g. localStorage or a directory). Failures are
 * ignored by the resolver (the icon is just not cached).
 * @typedef {object} MaterialCache
 * @property {(key: string) => Promise<string|undefined>} get
 * @property {(key: string, svg: string) => Promise<void>} set
 */

/** Trimmed, BOM-stripped body if it looks like an SVG, else undefined. */
function asSvg(text)
{
    if (typeof text != "string")
        return undefined;
    let trimmed = text.replace(/^﻿/, "").trim();
    return trimmed.startsWith("<svg") ? trimmed : undefined;
}

/**
 * Create the `@` prefix handler for Google Material Symbols, e.g.
 * `createSvgResolver({ prefixes: { "@": createMaterialResolver() } })` then
 * `"@home?fill=1&weight=700"`.
 *
 * Icons are downloaded with `fetch` (raw SVG cached under
 * `materialCacheKey(params)`, in memory and in `cache`; concurrent requests
 * for the same icon share one download) and normalised for the svg layer:
 * root `fill="currentColor"` (so `color` colours it) and the viewBox padded by
 * `pad` per side (0.15 matches the built-in icons). Note the cache key does
 * not depend on `url`, so a custom `url` shares entries with the default.
 *
 * @param {object} [options]
 * @param {typeof globalThis.fetch} [options.fetch] default: `globalThis.fetch`, looked up per download
 * @param {MaterialCache} [options.cache] persistent cache (default:
 *   `createStorageCache()`, i.e. `localStorage` when available, else memory only)
 * @param {(params: MaterialParams & {name: string}) => string} [options.url] download URL builder (default `materialIconUrl`)
 * @param {Partial<MaterialParams>} [options.defaults] settings used when a ref omits them
 * @param {number} [options.pad=0.15] viewBox padding fraction per side (0 = none; must be > -0.5)
 * @returns {(ref: string) => Promise<string>} `ref` is the part after `@`
 */
export function createMaterialResolver({ fetch, cache = createStorageCache(), url = materialIconUrl, defaults, pad = 0.15 } = {})
{
    let validDefaults = validateMaterialParams(defaults, "material defaults");
    padViewBox(`<svg viewBox="0 0 1 1"/>`, pad);   // validates `pad` (throws RangeError)
    let downloads = new Map();   // cache key -> Promise<raw svg>

    async function download(key, name, href)
    {
        let cached = asSvg(await Promise.resolve(cache?.get(key)).catch(() => undefined));
        if (cached)
            return cached;

        let fail = reason => `could not download material icon '${name}' from ${href}: ${reason}`;
        let response, body;
        try
        {
            response = await (fetch ?? globalThis.fetch)(href);
            body = response.ok ? await response.text() : undefined;
        }
        catch (e)
        {
            throw new Error(fail(e?.message ?? e), { cause: e });
        }
        if (response.status == 404)
            throw new Error(`unknown material icon '${name}' or unsupported settings (HTTP 404 ${href})`);
        if (!response.ok)
            throw new Error(fail(`HTTP ${response.status}`));
        if (!asSvg(body))
            throw new Error(fail("response is not an SVG"));

        await Promise.resolve(cache?.set(key, body)).catch(() => {});
        return asSvg(body);
    }

    return async function resolveMaterialIcon(ref)
    {
        let params = parseMaterialRef(ref, validDefaults);
        let key = materialCacheKey(params);
        let pending = downloads.get(key);
        if (!pending)
        {
            pending = download(key, params.name, url(params));
            downloads.set(key, pending);
            pending.catch(() => downloads.delete(key));
        }
        return padViewBox(setRootAttribute(await pending, "fill", "currentColor"), pad);
    };
}
