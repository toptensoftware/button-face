// SVG layer: draws an SVG icon/image (the old svgCode/svgFile, svgText,
// svgForeColor, svgScale and svgTranslate options).
//   {
//     type: "svg",
//     src?: string,              // reference resolved by options.resolveSvg (e.g. "#heart")
//     svg?: string,              // or inline SVG markup (exactly one of src / svg)
//     text?: string | number,    // replaces every `$(x)` in the SVG (old svgText)
//     colors?: { [from]: to },   // colour map (applyColorMap), e.g. { "#848484": "red" }
//     color?: string = "#848484",// root `color` - what `currentColor` resolves to
//     tint?: string,             // paint every opaque pixel this colour (alpha kept)
//     scale?: number = 1,        // drawn height as a fraction of the button height
//     translate?: { x, y },      // offset from centre, virtual px
//   }
//
// Recolouring is uniform: `currentColor` counts as the effective `color` for
// the colour map. If a `colors` key matches `color` (normalised, first match
// wins) and its value is a colour, the root colour becomes that value. So
// `colors: { "#848484": c }` recolours built-ins (whose grey is already
// `currentColor`) exactly like file/inline SVGs that paint `#848484`, and
// `{ color: "red", colors: { red: "blue" } }` draws `currentColor` blue.
//
// Pipeline: resolve -> substituteText -> applyColorMap -> setRootColor ->
// getSvgSize (aspect only) -> loadSvgImage -> position -> draw (tint via an
// offscreen canvas + `source-in`). Sizes and positions round like the old
// sharp-based renderer; anything outside the button is clipped by the canvas.

import { validColor, validatePositive, validateTranslate } from "./validate.js";
import { applyColorMap, lookupColor, setRootColor, substituteText } from "../recolor.js";
import { parseColor, formatColor } from "../color.js";
import { getSvgSize } from "../svgSize.js";

/** Default `color` - the grey the built-in icons were drawn in. */
const DEFAULT_COLOR = "#848484";

/** @type {import("../render.js").LayerType} */
export async function svgLayer(layer, { width, height, scaler, backend, resolveSvg })
{
    let { text, colors, color = DEFAULT_COLOR, tint, scale = 1, translate } = layer;
    let colorValue = validColor("svg", "color", color);
    let tintValue = tint == null ? null : validColor("svg", "tint", tint);
    validatePositive("svg", "scale", scale);
    validateTranslate("svg", translate);

    let svg = await loadSource(layer, resolveSvg);
    svg = substituteText(svg, text);
    svg = applyColorMap(svg, colors);
    svg = setRootColor(svg, rootColor(colors, colorValue));

    // Height = button height x scale; width keeps the SVG's aspect ratio.
    // Each dimension is rounded, as sharp did when rasterising.
    let natural = getSvgSize(svg);
    let exactHeight = height * scale;
    let svgW = Math.round(exactHeight * natural.width / natural.height);
    let svgH = Math.round(exactHeight);
    if (svgW <= 0 || svgH <= 0)
        return () => {};

    // Centred, plus translate (virtual px).
    let offset = scaler.translate(translate);
    let left = Math.round((width - svgW) / 2 + offset.x);
    let top = Math.round((height - svgH) / 2 + offset.y);

    let image = await backend.loadSvgImage(svg, svgW, svgH);
    if (tintValue)
        image = tintImage(backend, image, svgW, svgH, tintValue);

    return ctx => ctx.drawImage(image, left, top, svgW, svgH);
}

// The root colour (what `currentColor` resolves to): `color`, or the colour
// map's value for it if a key matches and that value is a colour (so
// e.g. `{ "#848484": "currentColor" }` leaves it unchanged).
function rootColor(colors, color)
{
    let mapped = parseColor(lookupColor(colors, color));
    return mapped ? formatColor(mapped) : color;
}

// The layer's SVG markup: inline `svg`, or `src` through the resolver.
async function loadSource({ src, svg }, resolveSvg)
{
    if (src !== undefined && svg !== undefined)
        throw new TypeError("svg layer: 'src' and 'svg' can't both be given");
    if (svg !== undefined)
    {
        if (typeof svg != "string" || !svg.trim())
            throw new TypeError("svg layer: 'svg' must be a non-empty string");
        return svg;
    }
    if (src === undefined)
        throw new TypeError("svg layer: needs 'src' or 'svg'");
    if (typeof src != "string" || !src)
        throw new TypeError("svg layer: 'src' must be a non-empty string");
    if (typeof resolveSvg != "function")
        throw new TypeError(`svg layer: 'src' (${JSON.stringify(src)}) needs options.resolveSvg`);
    return await resolveSvg(src);
}

// Rasterise `image` onto an offscreen canvas and replace its colour with
// `tint`, keeping its alpha (source-in).
function tintImage(backend, image, w, h, tint)
{
    let canvas = backend.createCanvas(w, h);
    let ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, w, h);
    return canvas;
}
