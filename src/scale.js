// Virtual pixel -> device pixel maths. The only place this lives: the svg and
// text layers both use it. Pure and browser-safe.
//
// Size-based layer properties (translate, padding, font px size) are given in
// virtual pixels of a `virtualSize` button (default 72x72) and scaled per axis
// to the device size, as in the old project's drawButton.js.

import { NUMBER } from "./color.js";

/** The default virtual button size. */
export const DEFAULT_VIRTUAL_SIZE = Object.freeze({ width: 72, height: 72 });

/**
 * @typedef {{ top: number, right: number, bottom: number, left: number }} Box
 * @typedef {number | [number, number] | [number, number, number, number]} Padding
 *   number (all sides) | [topBottom, leftRight] | [top, right, bottom, left]
 *
 * @typedef {object} Scaler
 * @property {number} sx - device px per virtual px horizontally
 * @property {number} sy - device px per virtual px vertically
 * @property {(v: number) => number} x - scale a horizontal virtual length
 * @property {(v: number) => number} y - scale a vertical virtual length
 * @property {(t?: {x?: number, y?: number}|null) => {x: number, y: number}} translate
 *   - scale an offset (missing parts are 0)
 * @property {(p?: Padding|null) => Box} padding - normalise and scale padding
 *   (top/bottom by sy, left/right by sx; missing is 0)
 */

/**
 * Create a scaler from virtual pixels to a `width` x `height` device button.
 * @param {{width: number, height: number}|null|undefined} virtualSize - default 72x72
 * @param {number} width - device width (px)
 * @param {number} height - device height (px)
 * @returns {Scaler}
 */
export function createScaler(virtualSize, width, height)
{
    let { width: vw, height: vh } = virtualSize ?? DEFAULT_VIRTUAL_SIZE;
    if (!(vw > 0 && vh > 0))
        throw new RangeError(`createScaler: invalid virtualSize ${JSON.stringify(virtualSize)}`);

    let sx = width / vw;
    let sy = height / vh;
    let x = v => v * sx;
    let y = v => v * sy;

    return {
        sx, sy, x, y,
        translate: t => ({ x: x(t?.x ?? 0), y: y(t?.y ?? 0) }),
        padding(p)
        {
            let [top, right, bottom, left] = normalizePadding(p ?? 0);
            return { top: y(top), right: x(right), bottom: y(bottom), left: x(left) };
        },
    };
}

// number | [tb, lr] | [t, r, b, l] -> [t, r, b, l]
function normalizePadding(p)
{
    if (!Array.isArray(p))
        return [p, p, p, p];
    if (p.length == 2)
        return [p[0], p[1], p[0], p[1]];
    if (p.length == 4)
        return [...p];
    throw new TypeError(`padding must be a number, [topBottom, leftRight] or [top, right, bottom, left]; got ${JSON.stringify(p)}`);
}

// The first `<number>px` in a CSS font string (not part of a longer word).
const FONT_PX = new RegExp(String.raw`(?<![\w.])(${NUMBER})px\b`, "i");

/**
 * Scale the (first) px font size in a CSS font string, e.g.
 * `scaleFont("bold 16px sans-serif", 2)` -> `"bold 32px sans-serif"`.
 * @param {string} font
 * @param {number} scale
 * @returns {string}
 * @throws if the font string has no px size
 */
export function scaleFont(font, scale)
{
    let match = FONT_PX.exec(font);
    if (!match)
        throw new Error(`Font string must contain a pixel size (NNpx): "${font}"`);
    return font.slice(0, match.index) + `${parseFloat(match[1]) * scale}px` + font.slice(match.index + match[0].length);
}
