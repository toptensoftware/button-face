// Node-side launcher for the real-browser tests (Playwright via the
// `playwright-core` devDependency, which bundles no browsers).
//
// Engines, each skipped with a reason when it can't be launched:
// - chromium: installed Google Chrome, then Microsoft Edge (`channel`), then a
//   Playwright-managed Chromium (`npx playwright-core install chromium`).
// - firefox, webkit: Playwright-managed builds only (stock Firefox/Safari
//   can't be driven): `npx playwright-core install firefox webkit`.
//
// BUTTON_FACE_BROWSER_TESTS: unset = run what's available, skip the rest;
// 0 = skip all; 1 = throw if no engine at all can be launched (CI).

/** @typedef {{ name: string, label: string, browser?: import("playwright-core").Browser, skip?: string }} FoundBrowser */

/** Engines in test order; `channels` (chromium only) are tried in order, `undefined` = Playwright's own build. */
export const ENGINES = [
    { name: "chromium", channels: ["chrome", "msedge", undefined] },
    { name: "firefox", channels: [undefined] },
    { name: "webkit", channels: [undefined] },
];

const ENV_VAR = "BUTTON_FACE_BROWSER_TESTS";

/**
 * @param {Record<string, string|undefined>} env
 * @returns {"auto"|"off"|"on"}
 */
export function browserTestMode(env = process.env)
{
    let value = env[ENV_VAR] ?? "";
    if (value == "")
        return "auto";
    if (value == "0" || value == "1")
        return value == "0" ? "off" : "on";
    throw new Error(`${ENV_VAR} must be 0 or 1 (got '${value}')`);
}

/** First line of an error message (Playwright's launch errors are long). */
const firstLine = err => String(err?.message ?? err).split("\n")[0].trim();

/**
 * Launch one engine, trying its channels in order.
 * @returns {Promise<FoundBrowser>}
 */
async function launchEngine(playwright, { name, channels })
{
    let failures = [];
    for (let channel of channels)
    {
        try
        {
            let browser = await playwright[name].launch(channel ? { channel } : {});
            let label = channels.length == 1 ? name : `${name} (${channel ?? "bundled"})`;
            return { name, label, browser };
        }
        catch (err)
        {
            failures.push(channels.length == 1 ? firstLine(err) : `${channel ?? "bundled"}: ${firstLine(err)}`);
        }
    }
    return { name, label: name, skip: `${name}: ${failures.join("; ")}` };
}

/**
 * Launch every available engine (headless). The caller must close the
 * returned browsers (`closeBrowsers`).
 * @param {{ env?: Record<string, string|undefined>, loadPlaywright?: () => Promise<any> }} [options]
 *   injectable for tests
 * @returns {Promise<FoundBrowser[]>} one entry per ENGINES item, with either
 *   `browser` or a `skip` reason
 */
export async function findBrowsers({ env = process.env, loadPlaywright = () => import("playwright-core") } = {})
{
    let mode = browserTestMode(env);
    let skipAll = skip => ENGINES.map(({ name }) => ({ name, label: name, skip }));
    if (mode == "off")
        return skipAll(`${ENV_VAR}=0`);

    let found;
    try
    {
        let playwright = await loadPlaywright();
        found = [];
        for (let engine of ENGINES)
            found.push(await launchEngine(playwright, engine));
    }
    catch (err)
    {
        found = skipAll(`playwright-core is not installed (npm install): ${firstLine(err)}`);
    }

    if (mode == "on" && !found.some(b => b.browser))
        throw new Error(`${ENV_VAR}=1 but no browser could be launched:\n${found.map(b => b.skip).join("\n")}`);
    return found;
}

/**
 * Close every launched browser from `findBrowsers`.
 * @param {FoundBrowser[]} found
 */
export async function closeBrowsers(found)
{
    await Promise.all(found.filter(b => b.browser).map(b => b.browser.close()));
}

/**
 * Open a new page on test/browser/blank.html (served from the repo root by
 * `server`, see scripts/static-server.js) and wait for `window.bf`. Page
 * errors and console errors are included if it fails to load.
 * @param {import("playwright-core").Browser} browser
 * @param {{ url: string }} server
 * @returns {Promise<import("playwright-core").Page>}
 */
export async function openTestPage(browser, server)
{
    let page = await browser.newPage();
    let errors = [];
    page.on("pageerror", err => errors.push(firstLine(err)));
    page.on("console", msg => msg.type() == "error" && errors.push(msg.text()));
    try
    {
        await page.goto(new URL("test/browser/blank.html", server.url).href);
        await page.waitForFunction(() => window.bf, null, { timeout: 10000 });
        return page;
    }
    catch (err)
    {
        await page.close();
        throw new Error(`test page failed to load: ${firstLine(err)}${errors.length ? `\n${errors.join("\n")}` : ""}`);
    }
}

/**
 * Call `window.bf[name](...args)` in the page; the result's `data` (base64
 * from test/browser/page.js) comes back as a `Uint8Array` so
 * test/helpers.js pixel helpers work on it.
 * @param {import("playwright-core").Page} page
 * @param {string} name
 * @param {...any} args (must be serialisable)
 * @returns {Promise<{ data: Uint8Array, width: number, height: number, channels: number }>}
 */
export async function callPage(page, name, ...args)
{
    let result = await page.evaluate(([name, args]) => window.bf[name](...args), [name, args]);
    return result?.data ? { ...result, data: new Uint8Array(Buffer.from(result.data, "base64")) } : result;
}

/**
 * The page's `window.bf` (= `backendOps(browserBackend)`, test/browser/ops.js)
 * as a Node-side object: `pageOps(page).render(...)` is `callPage(page,
 * "render", ...)`. Lets test/backend-cases.js run against the browser.
 * @param {import("playwright-core").Page} page
 */
export function pageOps(page)
{
    return new Proxy({}, { get: (_, name) => (...args) => callPage(page, name, ...args) });
}
