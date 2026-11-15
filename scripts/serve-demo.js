// Serve the repo root and print the URL of the browser demo page
// (scripts/browser-demo/), which renders every sample from
// scripts/sample-defs.js with `browserBackend` - beside the Node renders from
// `npm run samples` (scratch/samples/) when they exist.
//
// Usage: node scripts/serve-demo.js [port]     (npm run samples:browser)
// Port: argv, else the PORT env var, else 8080 (0 = any free port).
// Loopback only; stop with Ctrl+C.

import { fileURLToPath } from "node:url";
import { startStaticServer } from "./static-server.js";

const portArg = process.argv[2] ?? process.env.PORT ?? "8080";
const port = Number(portArg);
if (!Number.isInteger(port) || port < 0 || port > 65535)
{
    console.error(`serve-demo: invalid port ${JSON.stringify(portArg)}`);
    process.exit(1);
}

const server = await startStaticServer({ root: fileURLToPath(new URL("../", import.meta.url)), port });
console.log(`Browser demo: ${server.url}scripts/browser-demo/`);
console.log("(run `npm run samples` first to show the Node renders alongside; Ctrl+C to stop)");
