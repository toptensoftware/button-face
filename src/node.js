// Node entry ("@toptensoftware/button-face/node"): everything from the core
// entry, plus the @napi-rs/canvas backend and a file-aware SVG resolver, with
// a `render` that uses them by default.

import { render as renderCore } from "./render.js";
import { createSvgResolver } from "./resolve.js";
import { napiBackend } from "./backends/napi.js";
import { createFileResolver } from "./node/fileResolver.js";

export * from "./index.js";
export { napiBackend, createFileResolver };

/**
 * Create an SVG resolver for Node: built-in `#name` icons (plus any extra
 * `prefixes`), with every other reference read as a file path.
 * @param {object} [options]
 * @param {string} [options.baseDir] Directory relative file paths resolve
 *   against (default: the current working directory at resolve time).
 * @param {Parameters<typeof createSvgResolver>[0]["prefixes"]} [options.prefixes]
 * @returns {(src: string) => Promise<string>}
 */
export function createNodeSvgResolver({ baseDir, prefixes } = {})
{
    return createSvgResolver({ prefixes, fallback: createFileResolver({ baseDir }) });
}

/** The default Node resolver: `#name` built-ins, else file paths (cwd-relative). */
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
