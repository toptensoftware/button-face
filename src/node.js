// Node entry ("@toptensoftware/button-face/node"): everything from the core
// entry, plus the @napi-rs/canvas backend and a file-aware SVG resolver, with
// a `render` that uses them by default.

import { render as renderCore } from "./render.js";
import { createSvgResolver } from "./resolve.js";
import { napiBackend } from "./backends/napi.js";
import { createFileResolver } from "./node/fileResolver.js";
import { createFsCache } from "./node/fsCache.js";
import { createMaterialResolver } from "./material.js";

export * from "./index.js";
export { napiBackend, createFileResolver, createFsCache };

/**
 * Create an SVG resolver for Node: built-in `#name` icons, `@name?...` Google
 * Material Symbols (downloaded, cached on disk) and any extra `prefixes`, with
 * every other reference read as a file path.
 * @param {object} [options]
 * @param {string} [options.baseDir] Directory relative file paths resolve
 *   against (default: the current working directory at resolve time).
 * @param {Parameters<typeof createSvgResolver>[0]["prefixes"]} [options.prefixes]
 *   Extra/replacement handlers; these win over the defaults (`"@": null`
 *   removes the Material handler).
 * @param {false | Parameters<typeof createMaterialResolver>[0] & { cacheDir?: string }} [options.material]
 *   Options for the `@` handler (`createMaterialResolver`), plus `cacheDir`
 *   for its `createFsCache` (default `<os.tmpdir()>/button-face/material`);
 *   `false` = don't register `@`.
 * @returns {(src: string) => Promise<string>}
 */
export function createNodeSvgResolver({ baseDir, prefixes, material } = {})
{
    let defaults = [];
    if (material !== false)
    {
        let { cacheDir, ...options } = material ?? {};
        defaults.push(["@", createMaterialResolver({ cache: createFsCache({ dir: cacheDir }), ...options })]);
    }
    let extra = prefixes instanceof Map ? prefixes : Object.entries(prefixes ?? {});
    return createSvgResolver({ prefixes: new Map([...defaults, ...extra]), fallback: createFileResolver({ baseDir }) });
}

/**
 * The default Node resolver: `#name` built-ins, `@name?...` Material Symbols
 * (cached in `<os.tmpdir()>/button-face/material`), else file paths
 * (cwd-relative).
 */
export const resolveSvg = createNodeSvgResolver();

/**
 * Render a button definition with Node defaults: `backend` = `napiBackend`,
 * `resolveSvg` = the default Node resolver. Same result as the core `render`.
 * @param {import("./render.js").Definition} definition
 * @param {number} width
 * @param {number} height
 * @param {Partial<import("./render.js").RenderOptions>} [options]
 * @returns {Promise<import("./render.js").RenderResult>}
 */
export function render(definition, width, height, options = {})
{
    return renderCore(definition, width, height, {
        ...options,
        backend: options.backend ?? napiBackend,
        resolveSvg: options.resolveSvg ?? resolveSvg,
    });
}
