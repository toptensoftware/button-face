// Node-only generic { get, set } string cache: one file per key under a
// directory. Not imported by the portable core; the Node entry uses it as the
// Material Symbols download cache.

import { readFile, writeFile, rename, mkdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const SEGMENT = /^[a-z0-9_-]+$/;
let tempCounter = 0;

/**
 * Create a directory-backed cache matching the `MaterialCache` interface.
 * A key is `/`-separated segments of `[a-z0-9_-]` (e.g.
 * `"outlined/home/default/24"`) stored at `<dir>/<key>.svg`; other keys reject
 * with a TypeError (no path traversal). `get` resolves undefined on a miss or
 * an unreadable entry. `set` writes a temp file then renames it over the
 * entry (atomic; safe with concurrent writers), creating directories as needed.
 *
 * @param {object} [options]
 * @param {string} [options.dir] default: `<os.tmpdir()>/button-face/material`
 * @returns {import("../material.js").MaterialCache & { dir: string }}
 */
export function createFsCache({ dir = join(tmpdir(), "button-face", "material") } = {})
{
    function fileFor(key)
    {
        if (typeof key != "string" || !key.split("/").every(s => SEGMENT.test(s)))
            throw new TypeError(`fs cache: invalid key '${key}' (expected '/'-separated [a-z0-9_-] segments)`);
        return join(dir, `${key}.svg`);
    }

    return {
        dir,

        async get(key)
        {
            let file = fileFor(key);
            try
            {
                return await readFile(file, "utf8");
            }
            catch
            {
                return undefined;
            }
        },

        async set(key, value)
        {
            let file = fileFor(key);
            await mkdir(dirname(file), { recursive: true });
            let temp = `${file}.${process.pid}-${++tempCounter}.tmp`;
            try
            {
                await writeFile(temp, value, "utf8");
                await rename(temp, file);
            }
            catch (e)
            {
                await rm(temp, { force: true });
                // Windows: renaming over a file another writer is replacing can
                // fail (EPERM/EBUSY); their copy of the same entry is as good.
                if (!["EPERM", "EBUSY", "EACCES"].includes(e.code) || !await access(file).then(() => true, () => false))
                    throw e;
            }
        },
    };
}
