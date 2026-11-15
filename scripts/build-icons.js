// Generates src/icons.js (the built-in icons as a name -> SVG string map) from
// icons/*.svg, so the icons work without `fs` (e.g. in the browser).
//
// Each icon is converted to the `currentColor` convention (see toCurrentColor)
// so the svg layer's `color` (default #848484) colours the built-ins, while
// fixed colours such as hdd's red or gradient stops are untouched.
//
// `test/icons.test.js` fails if the checked-in src/icons.js is stale.
//
// Usage: npm run build:icons   (or: node scripts/build-icons.js)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyColorMap, findPaintValues, mapPaintValues } from "../src/recolor.js";

const root = new URL("../", import.meta.url);
const iconsDir = new URL("icons/", root);
const outFile = new URL("src/icons.js", root);

/** The recolour key in icons/*.svg (and the old default icon colour). */
const KEY = "#848484";

/**
 * Convert one source icon to the `currentColor` convention:
 * - the key colour becomes `currentColor` in every paint context;
 * - every `color` value becomes `inherit`. Inkscape writes e.g.
 *   `style="color:#000000;fill:#848484"` on paths; that `color` is inert in
 *   the source (nothing uses currentColor) but would override the root
 *   `color` once the fill is `currentColor`.
 * @param {string} name - for error messages
 * @param {string} svg
 * @returns {string}
 */
function toCurrentColor(name, svg)
{
    if (findPaintValues(svg).some(p => p.value.toLowerCase() == "currentcolor"))
        throw new Error(`icons/${name}.svg already uses currentColor - its color values would not be inert`);
    svg = applyColorMap(svg, { [KEY]: "currentColor" });
    return mapPaintValues(svg, ({ name }) => name == "color" ? "inherit" : undefined);
}

/**
 * Build the source of src/icons.js. Deterministic: icons sorted by name,
 * LF line endings.
 * @returns {string}
 */
export function generateIconsModule()
{
    let names = readdirSync(iconsDir).filter(f => f.endsWith(".svg")).map(f => f.slice(0, -4)).sort();
    let entries = names.map(name =>
    {
        let svg = readFileSync(new URL(`${name}.svg`, iconsDir), "utf8").replace(/\r\n?/g, "\n");
        return `    ${JSON.stringify(name)}: ${JSON.stringify(toCurrentColor(name, svg))},\n`;
    });
    return "// GENERATED - do not edit. Built from icons/*.svg by scripts/build-icons.js\n" +
        "// (run `npm run build:icons`).\n" +
        "\n" +
        "/**\n" +
        " * Built-in icons: name -> SVG source. Monochrome parts paint `currentColor`\n" +
        " * (set the root `color`, default #848484); fixed colours are kept.\n" +
        " * @type {Readonly<Record<string, string>>}\n" +
        " */\n" +
        "export const icons = Object.freeze({\n" +
        entries.join("") +
        "});\n";
}

if (process.argv[1] && import.meta.url == pathToFileURL(process.argv[1]).href)
{
    let code = generateIconsModule();
    writeFileSync(outFile, code);
    console.log(`wrote ${fileURLToPath(outFile)} (${code.length} bytes)`);
}
