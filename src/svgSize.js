// SVG natural size (from the root width/height/viewBox) and viewBox padding.
// Pure string functions, browser-safe; used so scaling maths doesn't depend on
// a renderer's metadata.

import { NUMBER } from "./color.js";
import { getRootAttribute, setRootAttribute } from "./recolor.js";

/** Default size of an SVG with no usable width/height/viewBox (CSS replaced element default). */
const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 150;

// Absolute CSS units -> px as [numerator, denominator] (96 px per inch);
// kept as a ratio so e.g. 72pt is exactly 96px.
const UNITS = { "": [1, 1], px: [1, 1], pt: [96, 72], pc: [16, 1], in: [96, 1], cm: [96, 2.54], mm: [96, 25.4] };
const LENGTH = new RegExp(String.raw`^\s*(${NUMBER})(px|pt|pc|in|cm|mm)?\s*$`, "i");
const FULL_NUMBER = new RegExp(String.raw`^${NUMBER}$`, "i");

/**
 * Parse an SVG width/height attribute into px. Unitless and `px` are user
 * units; `pt`, `pc`, `in`, `cm`, `mm` convert at 96 px per inch.
 * @param {string|null|undefined} value
 * @returns {number|null} null for missing, percentage, relative units
 *   (em/ex/...), unparsable, zero or negative values
 */
export function parseLength(value)
{
    let match = LENGTH.exec(value ?? "");
    if (!match)
        return null;
    let [n, d] = UNITS[(match[2] ?? "").toLowerCase()];
    let px = parseFloat(match[1]) * n / d;
    return px > 0 ? px : null;
}

/**
 * Parse a `viewBox` attribute (whitespace and/or comma separated).
 * @param {string|null|undefined} value
 * @returns {{x: number, y: number, width: number, height: number}|null}
 *   null when missing or invalid (not 4 numbers, or width/height <= 0)
 */
export function parseViewBox(value)
{
    let parts = (value ?? "").trim().split(/[\s,]+/);
    if (parts.length != 4 || !parts.every(p => FULL_NUMBER.test(p)))
        return null;
    let [x, y, width, height] = parts.map(Number);
    return width > 0 && height > 0 ? { x, y, width, height } : null;
}

/**
 * The natural size of an SVG in px, from its root `<svg>`:
 * - `width` and `height` attributes (see `parseLength`) when present;
 * - if only one is usable, the other follows the viewBox aspect ratio;
 * - if neither, the viewBox width/height (its origin is irrelevant);
 * - otherwise 300 (width) / 150 (height) for each missing dimension.
 * @param {string} svg
 * @returns {{width: number, height: number}}
 * @throws if the document's root element is not `<svg>`
 */
export function getSvgSize(svg)
{
    let width = parseLength(getRootAttribute(svg, "width"));
    let height = parseLength(getRootAttribute(svg, "height"));
    let viewBox = parseViewBox(getRootAttribute(svg, "viewBox"));
    if (viewBox)
    {
        if (width == null && height == null)
            return { width: viewBox.width, height: viewBox.height };
        width ??= height * viewBox.width / viewBox.height;
        height ??= width * viewBox.height / viewBox.width;
    }
    return { width: width ?? DEFAULT_WIDTH, height: height ?? DEFAULT_HEIGHT };
}

// Format a viewBox number without float noise (e.g. 143.99999999999997 -> 144).
const tidy = v => String(+v.toPrecision(12));

/**
 * Pad the root viewBox by `fraction` of its width/height on each side
 * (negative crops), keeping width/height - so the content shrinks (grows)
 * inside the same natural size. E.g. Material Symbols `0 -960 960 960` with
 * 0.15 -> `-144 -1104 1248 1248` (the built-in icons' padding). An SVG with no
 * valid viewBox gets one from its natural size (`getSvgSize`) first.
 * @param {string} svg
 * @param {number} [fraction=0]
 * @returns {string} the SVG unchanged when fraction is 0
 * @throws {RangeError} if fraction <= -0.5 (nothing would be left)
 */
export function padViewBox(svg, fraction = 0)
{
    if (!fraction)
        return svg;
    if (!(fraction > -0.5))
        throw new RangeError(`padViewBox: fraction must be > -0.5, got ${fraction}`);
    let { x, y, width, height } = parseViewBox(getRootAttribute(svg, "viewBox")) ?? { x: 0, y: 0, ...getSvgSize(svg) };
    let dx = width * fraction;
    let dy = height * fraction;
    return setRootAttribute(svg, "viewBox", [x - dx, y - dy, width + 2 * dx, height + 2 * dy].map(tidy).join(" "));
}
