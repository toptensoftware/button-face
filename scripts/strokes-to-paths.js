// Converts every stroke in the given SVG files to a filled path, in place,
// using Inkscape's command line (1.x). The stroke colour becomes the new
// path's fill, so recolouring keys such as #848484 survive.
//
// Built-in icons must be filled paths only (see test/icons.test.js): some
// renderers, e.g. Skia via @napi-rs/canvas, mishandle strokes.
//
// Usage: node scripts/strokes-to-paths.js icons/foo.svg [icons/bar.svg ...]
// Env:   INKSCAPE=<path to inkscape(.com)> (default: inkscape on Windows'
//        standard install path, else `inkscape` on PATH)
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const files = process.argv.slice(2);
if (!files.length)
{
    console.error("usage: node scripts/strokes-to-paths.js file.svg [...]");
    process.exit(1);
}

const windowsDefault = "C:\\Program Files\\Inkscape\\bin\\inkscape.com";
const inkscape = process.env.INKSCAPE ?? (existsSync(windowsDefault) ? windowsDefault : "inkscape");

// select-all:no-groups = every leaf object (not groups/layers), so strokes on
// shapes nested in groups are converted. Saving to the same file keeps the
// Inkscape SVG format (and so viewBox/width/height) unchanged.
const actions = [
    "select-all:no-groups",
    "object-stroke-to-path",
    "export-type:svg",
    "export-overwrite",
    "export-do",
].join(";");

for (let file of files)
{
    execFileSync(inkscape, [`--actions=${actions}`, file], { stdio: "inherit" });
    console.log(`converted ${file}`);
}
