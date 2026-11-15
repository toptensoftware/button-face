// Tiny static file server (Node only) for the browser demo page
// (scripts/serve-demo.js) and the browser tests. Serves files under `root`
// with `Cache-Control: no-store`, refuses paths that escape it, and serves
// `index.html` for directory paths. Not for production use.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/plain; charset=utf-8",
};

/**
 * Map a request URL path to a file under `root`, or null if it escapes the
 * root or is malformed.
 * @param {string} root absolute root directory
 * @param {string} urlPath raw request path (may include a query)
 * @returns {string|null}
 */
function resolvePath(root, urlPath)
{
    let pathname;
    try
    {
        pathname = decodeURIComponent(urlPath.split(/[?#]/)[0]);
    }
    catch
    {
        return null;
    }
    if (pathname.includes("\0"))
        return null;
    let file = resolve(root, `.${sep}${pathname}`);
    return file == root || file.startsWith(root + sep) ? file : null;
}

/**
 * Start serving `root` over HTTP on the loopback interface.
 * @param {{ root: string, port?: number, host?: string }} options `port` 0
 *   (default) picks a free port
 * @returns {Promise<{ url: string, close: () => Promise<void> }>} `url` ends
 *   with "/"
 */
export async function startStaticServer({ root, port = 0, host = "127.0.0.1" })
{
    let absRoot = resolve(root);
    let server = createServer(async (req, res) =>
    {
        let send = (status, body, type = "text/plain; charset=utf-8") =>
        {
            res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
            res.end(req.method == "HEAD" ? undefined : body);
        };
        if (req.method != "GET" && req.method != "HEAD")
            return send(405, "Method not allowed");
        let file = resolvePath(absRoot, req.url ?? "/");
        if (!file)
            return send(403, "Forbidden");
        try
        {
            if ((await stat(file)).isDirectory())
                file = join(file, "index.html");
            let body = await readFile(file);
            send(200, body, MIME_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        }
        catch
        {
            send(404, "Not found");
        }
    });
    await new Promise((ok, fail) =>
    {
        server.once("error", fail);
        server.listen(port, host, () => ok());
    });
    let address = /** @type {import("node:net").AddressInfo} */ (server.address());
    return {
        url: `http://${host}:${address.port}/`,
        close: () => new Promise(ok =>
        {
            server.close(() => ok());
            server.closeAllConnections();
        }),
    };
}
