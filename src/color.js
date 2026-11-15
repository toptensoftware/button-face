// CSS colour parsing and normalisation. Pure, dependency-free and browser-safe.
//
// Shared by the SVG recolouring (colour-map matching), the icon generator and
// the tests (pixel assertions).

/**
 * A normalised colour: r, g, b are integers 0..255, a is 0..1.
 * @typedef {{ r: number, g: number, b: number, a: number }} Color
 */

/**
 * The 148 CSS named colours (CSS Color Module Level 4), name -> `#rrggbb`.
 * Names are lower case. `transparent` is handled separately (it has alpha).
 * @type {Readonly<Record<string, string>>}
 */
export const namedColors = Object.freeze({
    aliceblue: "#f0f8ff", antiquewhite: "#faebd7", aqua: "#00ffff", aquamarine: "#7fffd4",
    azure: "#f0ffff", beige: "#f5f5dc", bisque: "#ffe4c4", black: "#000000",
    blanchedalmond: "#ffebcd", blue: "#0000ff", blueviolet: "#8a2be2", brown: "#a52a2a",
    burlywood: "#deb887", cadetblue: "#5f9ea0", chartreuse: "#7fff00", chocolate: "#d2691e",
    coral: "#ff7f50", cornflowerblue: "#6495ed", cornsilk: "#fff8dc", crimson: "#dc143c",
    cyan: "#00ffff", darkblue: "#00008b", darkcyan: "#008b8b", darkgoldenrod: "#b8860b",
    darkgray: "#a9a9a9", darkgreen: "#006400", darkgrey: "#a9a9a9", darkkhaki: "#bdb76b",
    darkmagenta: "#8b008b", darkolivegreen: "#556b2f", darkorange: "#ff8c00", darkorchid: "#9932cc",
    darkred: "#8b0000", darksalmon: "#e9967a", darkseagreen: "#8fbc8f", darkslateblue: "#483d8b",
    darkslategray: "#2f4f4f", darkslategrey: "#2f4f4f", darkturquoise: "#00ced1", darkviolet: "#9400d3",
    deeppink: "#ff1493", deepskyblue: "#00bfff", dimgray: "#696969", dimgrey: "#696969",
    dodgerblue: "#1e90ff", firebrick: "#b22222", floralwhite: "#fffaf0", forestgreen: "#228b22",
    fuchsia: "#ff00ff", gainsboro: "#dcdcdc", ghostwhite: "#f8f8ff", gold: "#ffd700",
    goldenrod: "#daa520", gray: "#808080", green: "#008000", greenyellow: "#adff2f",
    grey: "#808080", honeydew: "#f0fff0", hotpink: "#ff69b4", indianred: "#cd5c5c",
    indigo: "#4b0082", ivory: "#fffff0", khaki: "#f0e68c", lavender: "#e6e6fa",
    lavenderblush: "#fff0f5", lawngreen: "#7cfc00", lemonchiffon: "#fffacd", lightblue: "#add8e6",
    lightcoral: "#f08080", lightcyan: "#e0ffff", lightgoldenrodyellow: "#fafad2", lightgray: "#d3d3d3",
    lightgreen: "#90ee90", lightgrey: "#d3d3d3", lightpink: "#ffb6c1", lightsalmon: "#ffa07a",
    lightseagreen: "#20b2aa", lightskyblue: "#87cefa", lightslategray: "#778899", lightslategrey: "#778899",
    lightsteelblue: "#b0c4de", lightyellow: "#ffffe0", lime: "#00ff00", limegreen: "#32cd32",
    linen: "#faf0e6", magenta: "#ff00ff", maroon: "#800000", mediumaquamarine: "#66cdaa",
    mediumblue: "#0000cd", mediumorchid: "#ba55d3", mediumpurple: "#9370db", mediumseagreen: "#3cb371",
    mediumslateblue: "#7b68ee", mediumspringgreen: "#00fa9a", mediumturquoise: "#48d1cc", mediumvioletred: "#c71585",
    midnightblue: "#191970", mintcream: "#f5fffa", mistyrose: "#ffe4e1", moccasin: "#ffe4b5",
    navajowhite: "#ffdead", navy: "#000080", oldlace: "#fdf5e6", olive: "#808000",
    olivedrab: "#6b8e23", orange: "#ffa500", orangered: "#ff4500", orchid: "#da70d6",
    palegoldenrod: "#eee8aa", palegreen: "#98fb98", paleturquoise: "#afeeee", palevioletred: "#db7093",
    papayawhip: "#ffefd5", peachpuff: "#ffdab9", peru: "#cd853f", pink: "#ffc0cb",
    plum: "#dda0dd", powderblue: "#b0e0e6", purple: "#800080", rebeccapurple: "#663399",
    red: "#ff0000", rosybrown: "#bc8f8f", royalblue: "#4169e1", saddlebrown: "#8b4513",
    salmon: "#fa8072", sandybrown: "#f4a460", seagreen: "#2e8b57", seashell: "#fff5ee",
    sienna: "#a0522d", silver: "#c0c0c0", skyblue: "#87ceeb", slateblue: "#6a5acd",
    slategray: "#708090", slategrey: "#708090", snow: "#fffafa", springgreen: "#00ff7f",
    steelblue: "#4682b4", tan: "#d2b48c", teal: "#008080", thistle: "#d8bfd8",
    tomato: "#ff6347", turquoise: "#40e0d0", violet: "#ee82ee", wheat: "#f5deb3",
    white: "#ffffff", whitesmoke: "#f5f5f5", yellow: "#ffff00", yellowgreen: "#9acd32",
});

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// A CSS <number>, optionally followed by a unit / %
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?`;
const COMPONENT = new RegExp(String.raw`^(${NUMBER})(%|deg|grad|rad|turn)?$`);

// Split the inside of `fn(...)` into [components, alpha]. Accepts the legacy
// comma syntax (3 or 4 values) and the modern space syntax with optional
// `/ alpha`. Returns null if malformed.
function splitArgs(args)
{
    let parts, alpha;
    if (args.includes(","))
    {
        if (args.includes("/"))
            return null;
        parts = args.split(",").map(s => s.trim());
        if (parts.length == 4)
            alpha = parts.pop();
    }
    else
    {
        let slash = args.split("/");
        if (slash.length > 2)
            return null;
        parts = slash[0].trim().split(/\s+/);
        if (slash.length == 2)
            alpha = slash[1].trim();
    }
    if (parts.length != 3)
        return null;
    let comps = parts.map(p => COMPONENT.exec(p));
    if (comps.includes(null))
        return null;
    let a = 1;
    if (alpha !== undefined)
    {
        let m = COMPONENT.exec(alpha);
        if (!m || (m[2] && m[2] != "%"))
            return null;
        a = clamp(m[2] ? m[1] / 100 : Number(m[1]), 0, 1);
    }
    return [comps.map(m => ({ value: Number(m[1]), unit: m[2] ?? "" })), a];
}

function parseRgb(args)
{
    let split = splitArgs(args);
    if (!split)
        return null;
    let [comps, a] = split;
    if (comps.some(c => c.unit && c.unit != "%"))
        return null;
    let [r, g, b] = comps.map(c => Math.round(clamp(c.unit ? c.value * 255 / 100 : c.value, 0, 255)));
    return { r, g, b, a };
}

const HUE_UNITS = { "": 1, deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

function parseHsl(args)
{
    let split = splitArgs(args);
    if (!split)
        return null;
    let [[h, s, l], a] = split;
    if (h.unit == "%" || s.unit != "%" || l.unit != "%")
        return null;
    let hue = (((h.value * HUE_UNITS[h.unit]) % 360) + 360) % 360;
    let sat = clamp(s.value / 100, 0, 1);
    let light = clamp(l.value / 100, 0, 1);
    // CSS Color 4 hslToRgb
    let f = n =>
    {
        let k = (n + hue / 30) % 12;
        let amount = sat * Math.min(light, 1 - light);
        return Math.round(255 * (light - amount * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return { r: f(0), g: f(8), b: f(4), a };
}

function parseHex(hex)
{
    if (!/^[0-9a-f]+$/.test(hex))
        return null;
    if (hex.length == 3 || hex.length == 4)
        hex = hex.replace(/./g, "$&$&");
    if (hex.length != 6 && hex.length != 8)
        return null;
    let byte = i => parseInt(hex.substr(i * 2, 2), 16);
    return { r: byte(0), g: byte(1), b: byte(2), a: hex.length == 8 ? byte(3) / 255 : 1 };
}

const FUNCTIONS = { rgb: parseRgb, rgba: parseRgb, hsl: parseHsl, hsla: parseHsl };

/**
 * Parse a CSS colour string into a normalised `{ r, g, b, a }`.
 *
 * Supports `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (any case), `rgb()`/`rgba()`
 * and `hsl()`/`hsla()` (comma or space syntax, `/ alpha`, percentages), the
 * 148 named colours and `transparent`. Returns null for anything else,
 * including `none`, `currentColor`, `url(...)`, and non-strings.
 * @param {string} css
 * @returns {Color|null}
 */
export function parseColor(css)
{
    if (typeof css != "string")
        return null;
    let s = css.trim().toLowerCase();
    if (s.startsWith("#"))
        return parseHex(s.slice(1));
    if (s == "transparent")
        return { r: 0, g: 0, b: 0, a: 0 };
    if (Object.hasOwn(namedColors, s))
        return parseHex(namedColors[s].slice(1));
    let fn = /^([a-z]+)\((.*)\)$/.exec(s);
    if (fn && Object.hasOwn(FUNCTIONS, fn[1]))
        return FUNCTIONS[fn[1]](fn[2]);
    return null;
}

/**
 * True if two colours are the same after normalisation: RGB exactly, alpha
 * compared at 8-bit precision (so `#ff000080` equals `rgba(255,0,0,0.5)`).
 * Each argument may be a CSS string or a parsed `Color`. Non-colours (`none`,
 * `currentColor`, `url(...)`, garbage) never match anything.
 * @param {string|Color} a
 * @param {string|Color} b
 */
export function colorsEqual(a, b)
{
    let ca = typeof a == "string" ? parseColor(a) : a;
    let cb = typeof b == "string" ? parseColor(b) : b;
    if (!ca || !cb)
        return false;
    return ca.r == cb.r && ca.g == cb.g && ca.b == cb.b
        && Math.round(ca.a * 255) == Math.round(cb.a * 255);
}

/**
 * Format a colour as `#rrggbb` when opaque (a missing or 1), otherwise as
 * `rgba(r, g, b, a)` with alpha rounded to 3 decimals.
 * @param {{ r: number, g: number, b: number, a?: number }} color
 * @returns {string}
 */
export function formatColor({ r, g, b, a = 1 })
{
    if (a >= 1)
        return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}
