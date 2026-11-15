// A generic async { get, set } string cache over a Web Storage object
// (browser localStorage). Browser-safe; every access is guarded so private
// mode, quota errors or a missing localStorage just mean "not cached".

/**
 * Create a cache backed by Web Storage (e.g. `localStorage`), matching the
 * `MaterialCache` interface (`get` resolves undefined on a miss or any error;
 * `set` never rejects).
 * @param {object} [options]
 * @param {Pick<Storage, "getItem"|"setItem">} [options.storage] default:
 *   `globalThis.localStorage`, looked up on each access (absent in Node 24 ->
 *   a no-op cache)
 * @param {string} [options.prefix="button-face:material:"] storage key prefix
 * @returns {import("./material.js").MaterialCache}
 */
export function createStorageCache({ storage, prefix = "button-face:material:" } = {})
{
    let attempt = fn =>
    {
        try
        {
            let s = storage ?? globalThis.localStorage;
            return s ? fn(s) : undefined;
        }
        catch
        {
            return undefined;
        }
    };
    return {
        get: async key => attempt(s => s.getItem(prefix + key) ?? undefined),
        set: async (key, value) => { attempt(s => s.setItem(prefix + key, value)); },
    };
}
