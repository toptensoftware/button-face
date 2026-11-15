// SVG source resolution: turns an svg layer's `src` reference (e.g. "#heart")
// into SVG markup. Portable - no Node imports; Node-only resolvers (files)
// live under src/node/.

import { icons } from "./icons.js";

/**
 * Resolver contract. A resolver turns a reference into SVG markup:
 *
 * - It returns an SVG **string** (or a Promise of one); anything else is
 *   rejected by `createSvgResolver`. Errors (unknown icon, download failure,
 *   missing file) are reported by throwing / rejecting - never by returning an
 *   empty or placeholder SVG.
 * - Sources of **monochrome icons normalise their foreground to
 *   `currentColor`** before returning (built-ins: `#848484` -> `currentColor`
 *   at generate time; e.g. a Material Symbols resolver injects root
 *   `fill="currentColor"` with `setRootAttribute`), so the svg layer's `color`
 *   colours every icon source the same way. Arbitrary user SVGs (files) are
 *   returned unchanged.
 * - It may be async (e.g. download + cache); callers always `await` it.
 *
 * @callback SvgSourceResolver
 * @param {string} ref For a prefix handler: the reference with the prefix
 *   removed, otherwise verbatim (e.g. `"@home?fill=1"` -> `"home?fill=1"`).
 *   For the fallback: the whole reference.
 * @returns {string | Promise<string>} SVG markup.
 */

/**
 * Resolve a built-in icon by name (the `#` prefix handler).
 * @param {string} name e.g. `"heart"` for `"#heart"`.
 * @returns {string}
 */
export function resolveBuiltinIcon(name)
{
    if (!Object.hasOwn(icons, name))
        throw new Error(`unknown built-in icon '#${name}'`);
    return icons[name];
}

/**
 * Create an async resolver for svg layer `src` references.
 *
 * The longest registered prefix that `src` starts with selects the handler,
 * which receives the rest of the string (query strings etc. untouched). The
 * built-in `#` prefix is registered by default; `prefixes` entries add to or
 * replace it (a `null` value removes a prefix). When no prefix matches,
 * `fallback` (if any) gets the whole `src`, e.g. a file resolver in Node.
 *
 * @example
 * let resolve = createSvgResolver({
 *     prefixes: { "@": createMaterialResolver() },   // "@home?fill=1"
 *     fallback: createFileResolver(),                  // "icons/foo.svg"
 * });
 * let svg = await resolve("#heart");
 *
 * @param {object} [options]
 * @param {Record<string, SvgSourceResolver | null> | Map<string, SvgSourceResolver | null>} [options.prefixes]
 * @param {SvgSourceResolver} [options.fallback] Handles references with no matching prefix.
 * @returns {(src: string) => Promise<string>}
 */
export function createSvgResolver({ prefixes, fallback } = {})
{
    let handlers = new Map([["#", resolveBuiltinIcon]]);
    for (let [prefix, handler] of prefixes instanceof Map ? prefixes : Object.entries(prefixes ?? {}))
    {
        if (typeof prefix != "string" || !prefix)
            throw new TypeError("createSvgResolver: prefixes must be non-empty strings");
        if (handler == null)
            handlers.delete(prefix);
        else if (typeof handler != "function")
            throw new TypeError(`createSvgResolver: handler for prefix '${prefix}' is not a function`);
        else
            handlers.set(prefix, handler);
    }
    if (fallback != null && typeof fallback != "function")
        throw new TypeError("createSvgResolver: fallback is not a function");

    // Longest first, so "@@" beats "@".
    let ordered = [...handlers].sort(([a], [b]) => b.length - a.length);

    return async function resolveSvg(src)
    {
        if (typeof src != "string" || !src)
            throw new TypeError("resolveSvg: src must be a non-empty string");

        let match = ordered.find(([prefix]) => src.startsWith(prefix));
        let svg;
        if (match)
            svg = await match[1](src.slice(match[0].length));
        else if (fallback)
            svg = await fallback(src);
        else
            throw new Error(`no SVG resolver for '${src}'`);

        if (typeof svg != "string")
            throw new TypeError(`resolveSvg: resolver for '${src}' did not return an SVG string`);
        return svg;
    };
}
