// Fill layer: paints the whole button one colour (the old `backColor`).
//   { type: "fill", color?: string = "black" }

import { parseColor, formatColor } from "../color.js";

/** @type {import("../render.js").LayerType} */
export function fillLayer(layer, { width, height })
{
    let { color = "black" } = layer;
    let parsed = parseColor(color);
    if (!parsed)
        throw new TypeError(`fill layer: invalid color '${color}'`);
    let fillStyle = formatColor(parsed);
    return ctx =>
    {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(0, 0, width, height);
    };
}
