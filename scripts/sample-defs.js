// Sample button definitions for human visual review, shared by the Node
// sample renderer (scripts/render-samples.js), the browser demo page
// (scripts/browser-demo/) and browser-vs-Node comparison tests.
//
// Browser-safe: imports only the portable core (enforced by
// test/samples.test.js). No sample uses an `@name` reference, so rendering
// them never touches the network.

import { icons } from "../src/index.js";

const fill = color => ({ type: "fill", color });
const icon = (src, more) => ({ type: "svg", src, ...more });
const text = (value, more) => ({ type: "text", text: value, ...more });

// An old-style user SVG: grey (#848484) body plus a fixed red dot.
const userSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="3" y="5" width="18" height="14" rx="3" fill="#848484"/>
  <circle cx="18" cy="6" r="4" style="fill:red"/>
</svg>`;

// A user SVG with a `$(x)` text placeholder (old svgText).
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="11" fill="#848484"/>
  <text x="12" y="16.5" font-family="sans-serif" font-weight="bold" font-size="12" text-anchor="middle" fill="white">$(x)</text>
</svg>`;

// The old project's typical button: icon nudged up, label at the bottom.
const labelled = (src, label, color = "white", back = "black") => [
    fill(back),
    icon(src, { color, translate: { y: -7 } }),
    text(label, { valign: "bottom" }),
];

const example = [
    fill("black"),
    icon("#heart", { color: "red", translate: { x: 0, y: -7 } }),
    text("Hello!", { color: "white", valign: "bottom" }),
];

const iconNames = Object.keys(icons);
const wrapText = "Wrap this label";

/**
 * @typedef {{ label: string, layers: object[], size?: number|[number, number], channels?: 3|4, virtualSize?: object }} Sample
 * @typedef {{ name: string, samples: Sample[] }} SampleGroup
 */

/** @type {SampleGroup[]} */
export const groups = [
    {
        name: "icons-default",
        samples: iconNames.map(n => ({ label: n, layers: [fill("black"), icon(`#${n}`)] })),
    },
    {
        name: "icons-color",
        samples: iconNames.map(n => ({ label: n, layers: [fill("white"), icon(`#${n}`, { color: "#1565c0" })] })),
    },
    {
        name: "icon-categories",
        samples: [
            ["material (fill attr)", "#settings"],
            ["material (outline)", "#heart"],
            ["inkscape (style fill)", "#volume-up"],
            ["stroke->path", "#home"],
            ["stroke->path", "#guide"],
            ["fixed: hdd", "#hdd"],
            ["fixed: steam", "#steam"],
            ["fixed: playstation", "#playstation"],
            ["fixed: apple-tv", "#apple-tv"],
        ].map(([label, src]) => ({ label, size: 144, layers: [fill("#202020"), icon(src, { color: "gold" })] })),
    },
    {
        name: "recolour",
        samples: [
            { label: "color red", layers: [fill("black"), icon("#heart", { color: "red" })] },
            { label: "color rgb()", layers: [fill("black"), icon("#home", { color: "rgb(0 200 255)" })] },
            { label: "color hsl()", layers: [fill("black"), icon("#check", { color: "hsl(120 100% 40%)" })] },
            { label: "color white", layers: [fill("#1565c0"), icon("#power", { color: "white" })] },
            { label: "user svg as-is", layers: [fill("black"), { type: "svg", svg: userSvg }] },
            { label: "colors grey->lime", layers: [fill("black"), { type: "svg", svg: userSvg, colors: { "#848484": "lime" } }] },
            { label: "colors 2 swaps", layers: [fill("black"), { type: "svg", svg: userSvg, colors: { "#848484": "white", red: "blue" } }] },
            { label: "colors rgb() key", layers: [fill("black"), { type: "svg", svg: userSvg, colors: { "rgb(132,132,132)": "orange" } }] },
            { label: "tint steam white", layers: [fill("black"), icon("#steam", { tint: "white" })] },
            { label: "tint hdd yellow", layers: [fill("black"), icon("#hdd", { tint: "yellow" })] },
            { label: "tint ps cyan", layers: [fill("black"), icon("#playstation", { tint: "cyan" })] },
            { label: "tint 50% alpha", layers: [fill("black"), { type: "svg", svg: userSvg, tint: "rgba(255,255,255,0.5)" }] },
            { label: "opacity 0.4", layers: [fill("black"), icon("#star", { color: "gold", opacity: 0.4 })] },
            { label: "color+text $(x)", layers: [fill("black"), { type: "svg", svg: badgeSvg, color: "red", colors: { "#848484": "#c62828" }, text: "42" }] },
        ],
    },
    {
        name: "text-align",
        samples: ["top", "center", "bottom"].flatMap(valign => ["left", "center", "right"].map(align => (
            { label: `${valign} ${align}`, layers: [fill("#263238"), text(wrapText, { align, valign, font: "bold 12px sans-serif" })] }))),
    },
    {
        name: "text-misc",
        samples: [
            { label: "single line", layers: [fill("black"), text("OK")] },
            { label: "\\n break", layers: [fill("black"), text("Line 1\nLine 2")] },
            { label: "long word", layers: [fill("black"), text("Supercalifragilistic")] },
            { label: "4 lines wrap", layers: [fill("black"), text("The quick brown fox jumps over")] },
            { label: "lineSpacing 1.5", layers: [fill("black"), text("Two\nLines", { lineSpacing: 1.5 })] },
            { label: "padding [12,2]", layers: [fill("black"), text(wrapText, { padding: [12, 2], valign: "top" })] },
            { label: "translate 8,8", layers: [fill("black"), text("Moved", { translate: { x: 8, y: 8 } })] },
            { label: "12px serif", layers: [fill("black"), text("Serif text here", { font: "12px serif" })] },
            { label: "bold 28px", layers: [fill("black"), text("BIG", { font: "bold 28px sans-serif", color: "yellow" })] },
            { label: "italic 14px", layers: [fill("white"), text("Italic dark", { font: "italic 14px sans-serif", color: "#333" })] },
            { label: "text 144", size: 144, layers: [fill("black"), text(wrapText)] },
            { label: "text 144 top-left", size: 144, layers: [fill("black"), text(wrapText, { align: "left", valign: "top" })] },
        ],
    },
    {
        name: "combos",
        samples: [
            { label: "old test.js", layers: labelled("#apple-tv", "Hello!", "#404040") },
            { label: "mute", layers: labelled("#volume-mute", "Mute", "red") },
            { label: "play", layers: labelled("#play", "Play", "lime") },
            { label: "settings", layers: labelled("#settings", "Setup") },
            { label: "blue back", layers: labelled("#home", "Home", "white", "#0d47a1") },
            { label: "text on top", layers: [fill("black"), icon("#refresh", { translate: { y: 7 } }), text("Reload", { valign: "top" })] },
            { label: "small icon", layers: [fill("black"), icon("#star", { color: "gold", scale: 0.5, translate: { y: -10 } }), text("Favourite", { valign: "bottom" })] },
            { label: "stacked svgs", layers: [fill("black"), icon("#circle", { color: "lime" }), icon("#check", { color: "lime", scale: 0.5 })] },
            { label: "hdd + text", layers: labelled("#hdd", "Disk") },
            { label: "mute 144", size: 144, layers: labelled("#volume-mute", "Mute", "red") },
            { label: "old test.js 144", size: 144, layers: labelled("#apple-tv", "Hello!", "#404040") },
        ],
    },
    {
        name: "sizes",
        samples: [
            ...[72, 96, 144].map(size => ({ label: `example ${size} rgb`, size, layers: example })),
            ...[72, 144].map(size => ({ label: `example ${size} rgba`, size, channels: 4, layers: example.slice(1) })),
            { label: "icon only rgba", channels: 4, layers: [icon("#heart", { color: "red" })] },
            { label: "half-alpha rgba", channels: 4, layers: [fill("rgba(0,128,255,0.5)"), text("50%")] },
            { label: "144x72 wide", size: [144, 72], virtualSize: { width: 144, height: 72 }, layers: labelled("#next-track", "Next track") },
        ],
    },
];

/**
 * A sample's output size in device pixels (default 72x72).
 * @param {Sample} sample
 * @returns {[number, number]}
 */
export function sampleSize(sample)
{
    return Array.isArray(sample.size) ? [...sample.size] : [sample.size ?? 72, sample.size ?? 72];
}

/**
 * A sample's output channel count (default 3).
 * @param {Sample} sample
 * @returns {3|4}
 */
export function sampleChannels(sample)
{
    return sample.channels ?? 3;
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * The PNG file name for the sample at `index` in its group:
 * `<nn>-<slug(label)>[-rgba].png` (nn is 1-based, zero-padded).
 * @param {number} index 0-based
 * @param {Sample} sample
 * @returns {string}
 */
export function sampleFileName(index, sample)
{
    return `${String(index + 1).padStart(2, "0")}-${slug(sample.label)}${sampleChannels(sample) == 4 ? "-rgba" : ""}.png`;
}

/**
 * Whether a sample draws text (a `text` layer, or an svg layer with `text`
 * substitution) - font rendering differs between backends, so such samples
 * get looser comparison tolerances.
 * @param {Sample} sample
 * @returns {boolean}
 */
export function isTextSample(sample)
{
    return sample.layers.some(l => l.type == "text" || (l.type == "svg" && l.text !== undefined));
}

/**
 * A render result's pixels as RGBA (RGB expanded with opaque alpha), ready
 * for `ImageData` / `putImageData`.
 * @param {{ data: ArrayLike<number>, width: number, height: number, channels: number }} result
 * @returns {Uint8ClampedArray}
 */
export function toRgba({ data, width, height, channels })
{
    let out = new Uint8ClampedArray(width * height * 4);
    for (let i = 0, j = 0; i < out.length; i += 4, j += channels)
    {
        out[i] = data[j];
        out[i + 1] = data[j + 1];
        out[i + 2] = data[j + 2];
        out[i + 3] = channels == 4 ? data[j + 3] : 255;
    }
    return out;
}

/**
 * Render a sample with the given render options (backend, channels default
 * to the sample's).
 * @param {(def: object, w: number, h: number, options: object) => Promise<object>} render
 * @param {Sample} sample
 * @param {object} [options] extra render options (e.g. `{ backend }`)
 */
export function renderSample(render, sample, options = {})
{
    let [w, h] = sampleSize(sample);
    return render({ virtualSize: sample.virtualSize, layers: sample.layers }, w, h, { channels: sampleChannels(sample), ...options });
}
