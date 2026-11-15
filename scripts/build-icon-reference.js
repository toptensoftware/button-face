// Generates test/fixtures/icon-reference.json: per-icon ink statistics of the
// ORIGINAL built-in icons rendered at 72x72 by librsvg (sharp), as used by the
// old node-buttonImage project. `test/icons.test.js` checks that our icons, as
// rendered by Skia (@napi-rs/canvas), still look like this.
//
// sharp is deliberately NOT a dependency of this project: it is borrowed from
// the old project's node_modules. Re-run only if the reference must change.
//
// Usage: node scripts/build-icon-reference.js [oldProjectDir]
//   oldProjectDir defaults to ../node-buttonImage (needs `npm install` there);
//   icons are read from <oldProjectDir>/images.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { inkStats } from "../test/helpers.js";

const root = new URL("../", import.meta.url);
const oldDir = resolve(process.argv[2] ?? fileURLToPath(new URL("../node-buttonImage", root)));
const sharp = createRequire(pathToFileURL(resolve(oldDir, "index.js")))("sharp");
const imagesDir = resolve(oldDir, "images");
const size = 72; // must match test/icons.test.js

let reference = {};
for (let file of readdirSync(imagesDir).filter(f => f.endsWith(".svg")).sort())
{
    let svg = readFileSync(resolve(imagesDir, file));
    let meta = await sharp(svg).metadata();
    let data = await sharp(svg, { density: 72 * size / meta.height })
        .resize(size, size, { fit: "fill" }).ensureAlpha().raw().toBuffer();
    reference[file.slice(0, -4)] = inkStats({ data, width: size, height: size, channels: 4 });
}

let out = new URL("test/fixtures/icon-reference.json", root);
writeFileSync(out, JSON.stringify(reference, null, 2) + "\n");
console.log(`wrote ${Object.keys(reference).length} icons to test/fixtures/icon-reference.json`);
