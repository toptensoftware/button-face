// Text layer: word-wrapped, aligned text (the old text, font, textColor,
// textPadding, textAlign, textVerticalAlign, textLineSpacing and
// textTranslate options; old drawText.js).
//   {
//     type: "text",
//     text?: string | number,          // nothing drawn when empty/missing
//     font?: string = "bold 16px sans-serif", // CSS font; px size is virtual (scaled by Y only)
//     color?: string = "white",
//     align?: "left" | "center" | "right" = "center",
//     valign?: "top" | "center" | "bottom" = "center",
//     lineSpacing?: number = 1,        // line height multiplier
//     padding?: number | [tb, lr] | [t, r, b, l] = 3,  // virtual px
//     translate?: { x, y },            // virtual px
//   }
//
// Text is measured and drawn on the same canvas context (the painter's), so
// wrapping always matches the font engine that draws it.

import { wrapLines } from "../wrapLines.js";
import { scaleFont } from "../scale.js";
import { validColor, validateTranslate } from "./validate.js";

const ALIGN = ["left", "center", "right"];
const VALIGN = ["top", "center", "bottom"];

/**
 * Line height for the context's current font - the old heuristic: the ink
 * height of "Xy" (ascent + descent), x1.1 below 40px else x1.2, x lineSpacing.
 * (The old code's "< 20px -> x1.0" branch never took effect, so small text
 * gets x1.1 too.)
 * @param {{ measureText(s: string): { actualBoundingBoxAscent: number, actualBoundingBoxDescent: number } }} ctx
 * @param {number} [lineSpacing]
 * @returns {number}
 */
export function lineHeight(ctx, lineSpacing = 1)
{
    let m = ctx.measureText("Xy");
    let h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    return h * (h < 40 ? 1.1 : 1.2) * lineSpacing;
}

/**
 * Lay out text in a box (all values device px), as old drawText.js did, using
 * the context's current font for measuring. `x` is the anchor for
 * `textAlign = align`; each line's `y` is its top (`textBaseline = "top"`).
 * @param {{ measureText(s: string): TextMetrics }} ctx
 * @param {string} text
 * @param {object} box
 * @param {number} box.width
 * @param {number} box.height
 * @param {import("../scale.js").Box} box.padding
 * @param {"left"|"center"|"right"} box.align
 * @param {"top"|"center"|"bottom"} box.valign
 * @param {number} box.lineSpacing
 * @param {{x: number, y: number}} box.translate
 * @returns {{ x: number, lines: { text: string, y: number }[] }}
 */
export function layoutText(ctx, text, { width, height, padding, align, valign, lineSpacing, translate })
{
    let hSpace = width - padding.left - padding.right;
    let vSpace = height - padding.top - padding.bottom;
    let lines = wrapLines(text, s => ctx.measureText(s).width, hSpace);

    let step = lineHeight(ctx, lineSpacing);
    let total = lines.length * step;
    let y = valign == "top" ? padding.top
        : valign == "bottom" ? height - total - padding.bottom
        : padding.top + (vSpace - total) / 2;
    let x = align == "left" ? padding.left
        : align == "right" ? width - padding.right
        : padding.left + hSpace / 2;

    return {
        x: x + translate.x,
        lines: lines.map((line, i) => ({ text: line, y: y + translate.y + i * step })),
    };
}

/** @type {import("../render.js").LayerType} */
export function textLayer(layer, { width, height, scaler })
{
    let {
        text, font = "bold 16px sans-serif", color = "white", align = "center",
        valign = "center", lineSpacing = 1, padding = 3, translate,
    } = layer;

    if (text != null && typeof text != "string" && typeof text != "number")
        throw new TypeError(`text layer: 'text' must be a string or number; got ${JSON.stringify(text)}`);
    let fillStyle = validColor("text", "color", color);
    if (!ALIGN.includes(align))
        throw new TypeError(`text layer: 'align' must be one of ${ALIGN.join(", ")}; got ${JSON.stringify(align)}`);
    if (!VALIGN.includes(valign))
        throw new TypeError(`text layer: 'valign' must be one of ${VALIGN.join(", ")}; got ${JSON.stringify(valign)}`);
    if (typeof lineSpacing != "number" || !(lineSpacing > 0 && lineSpacing < Infinity))
        throw new TypeError(`text layer: 'lineSpacing' must be a positive number; got ${JSON.stringify(lineSpacing)}`);
    if (typeof font != "string")
        throw new TypeError(`text layer: 'font' must be a CSS font string; got ${JSON.stringify(font)}`);
    validateTranslate("text", translate);

    let box = {
        width, height, align, valign, lineSpacing,
        padding: prefixErrors(() => scaler.padding(padding)),
        translate: scaler.translate(translate),
    };
    // Font size follows the button height only (as the old renderer did).
    let deviceFont = prefixErrors(() => scaleFont(font, scaler.sy));

    text = text == null ? "" : String(text);
    if (!text)
        return () => {};

    return ctx =>
    {
        ctx.font = deviceFont;
        ctx.fillStyle = fillStyle;
        ctx.textAlign = align;
        ctx.textBaseline = "top";
        let { x, lines } = layoutText(ctx, text, box);
        for (let line of lines)
            ctx.fillText(line.text, x, line.y);
    };
}

// Run fn, rethrowing any error as a TypeError prefixed "text layer: ".
function prefixErrors(fn)
{
    try
    {
        return fn();
    }
    catch (e)
    {
        throw new TypeError(`text layer: ${e.message}`);
    }
}
