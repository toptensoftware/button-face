// Fill layer: paints the whole button one colour (the old `backColor`).
//   { type: "fill", color?: string = "black" }

import { validColor } from "./validate.js";

/** @type {import("../render.js").LayerType} */
export function fillLayer(layer, { width, height })
{
    let { color = "black" } = layer;
    let fillStyle = validColor("fill", "color", color);
    return ctx =>
    {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(0, 0, width, height);
    };
}
