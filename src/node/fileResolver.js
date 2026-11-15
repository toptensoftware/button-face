// Node-only SVG file resolver. Not imported by the portable core
// (src/resolve.js); the Node entry registers it as the resolver fallback.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Create a resolver that reads SVG files from disk. The reference is a file
 * path, returned unchanged apart from a leading UTF-8 BOM being removed (user
 * SVGs are not normalised - see the resolver contract in ../resolve.js).
 * Missing/unreadable files reject with the `fs` error (e.g. `code: "ENOENT"`).
 *
 * @param {object} [options]
 * @param {string} [options.baseDir] Directory relative paths are resolved
 *   against (default: the current working directory).
 * @returns {import("../resolve.js").SvgSourceResolver}
 */
export function createFileResolver({ baseDir } = {})
{
    return async function resolveSvgFile(path)
    {
        let svg = await readFile(resolve(baseDir ?? "", path), "utf8");
        return svg.replace(/^﻿/, "");
    };
}
