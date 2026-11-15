// The render core: paints a layered button definition onto a canvas from a
// pluggable backend and returns raw pixels. Browser-safe - the backend and
// SVG resolver come in through options; nothing platform-specific is
// imported here.
//
// Layer types are modules in ./layers/. Each exports a *layer type*: a
// function `(layer, env) => Painter | Promise<Painter>` that validates the
// layer, does any async work (resolving/decoding SVGs, ...) and returns a
// synchronous `Painter` `(ctx) => void` that draws it. Everything common to
// all layers - `visible`, `opacity`, the scaler, backend and resolver - is
// handled here, so a new layer type only needs registering in `layerTypes`.

import { createScaler } from "./scale.js";
import { fillLayer } from "./layers/fill.js";
import { svgLayer } from "./layers/svg.js";
import { textLayer } from "./layers/text.js";

/**
 * @typedef {import("./backend.js").Backend} Backend
 * @typedef {import("./backend.js").Context2D} Context2D
 * @typedef {import("./scale.js").Scaler} Scaler
 *
 * @typedef {object} Layer
 * @property {string} type - a key of `layerTypes` ("fill", "svg", "text")
 * @property {boolean} [visible] - default true; false skips the layer
 * @property {number} [opacity] - 0..1, default 1; multiplies the layer's alpha
 *
 * @typedef {object} Definition
 * @property {{width: number, height: number}} [virtualSize] - default 72x72
 * @property {Layer[]} [layers] - painted bottom to top (array order)
 *
 * @typedef {object} RenderOptions
 * @property {Backend} backend - canvas + SVG decoding for the platform
 * @property {(src: string) => Promise<string>} [resolveSvg] - SVG source
 *   resolver (see resolve.js `createSvgResolver`); needed by svg layers
 *   that use `src`
 * @property {3 | 4} [channels] - 3 = RGB composited over black (default), 4 = RGBA
 *
 * @typedef {object} LayerEnv - what the core passes to every layer type
 * @property {number} width - device width (px)
 * @property {number} height - device height (px)
 * @property {Scaler} scaler - virtual -> device px for this definition and size
 * @property {Backend} backend
 * @property {((src: string) => Promise<string>) | undefined} resolveSvg
 *
 * @typedef {(ctx: Context2D) => void} Painter
 * @typedef {(layer: Layer, env: LayerEnv) => Painter | Promise<Painter>} LayerType
 *
 * @typedef {object} RenderResult
 * @property {Uint8Array} data - row-major pixels, `channels` bytes each
 * @property {number} width
 * @property {number} height
 * @property {3 | 4} channels
 */

/** Registered layer types, keyed by `layer.type`. */
export const layerTypes = Object.freeze({
    fill: fillLayer,
    svg: svgLayer,
    text: textLayer,
});

/**
 * Render a button definition to raw pixels.
 * @param {Definition} definition
 * @param {number} width - device width (px, positive integer)
 * @param {number} height - device height (px, positive integer)
 * @param {RenderOptions} options
 * @returns {Promise<RenderResult>}
 */
export async function render(definition, width, height, { backend, resolveSvg, channels = 3 } = {})
{
    if (!isSize(width) || !isSize(height))
        throw new RangeError(`render: width and height must be positive integers; got ${width}x${height}`);
    if (channels !== 3 && channels !== 4)
        throw new RangeError(`render: channels must be 3 (RGB) or 4 (RGBA); got ${channels}`);
    if (typeof backend?.createCanvas != "function" || typeof backend?.loadSvgImage != "function")
        throw new TypeError("render: options.backend must implement createCanvas and loadSvgImage");
    if (definition === null || typeof definition != "object")
        throw new TypeError("render: definition must be an object");
    let layers = definition.layers ?? [];
    if (!Array.isArray(layers))
        throw new TypeError("render: definition.layers must be an array");

    let env = {
        width,
        height,
        scaler: createScaler(definition.virtualSize, width, height),
        backend,
        resolveSvg,
    };

    // Prepare every layer (validation + async loading, concurrently), then paint in order.
    let painters = await Promise.all(layers.map(layer => prepareLayer(layer, env)));

    let ctx = backend.createCanvas(width, height).getContext("2d");
    for (let painter of painters)
    {
        if (!painter)
            continue;
        ctx.save();
        ctx.globalAlpha = painter.opacity;
        painter.paint(ctx);
        ctx.restore();
    }

    if (channels == 3)
    {
        // Composite everything over black.
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }

    let rgba = ctx.getImageData(0, 0, width, height).data;
    let data = channels == 4
        ? new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength)
        : stripAlpha(rgba);
    return { data, width, height, channels };
}

/**
 * Validate the common layer properties and run the layer type.
 * @returns {Promise<{ opacity: number, paint: Painter } | null>} null when hidden
 */
async function prepareLayer(layer, env)
{
    if (layer === null || typeof layer != "object" || typeof layer.type != "string")
        throw new TypeError(`render: each layer must be an object with a string 'type'; got ${JSON.stringify(layer)}`);
    let layerType = Object.hasOwn(layerTypes, layer.type) ? layerTypes[layer.type] : undefined;
    if (!layerType)
        throw new TypeError(`render: unknown layer type '${layer.type}'`);

    let { visible = true, opacity = 1 } = layer;
    if (typeof visible != "boolean")
        throw new TypeError(`render: ${layer.type} layer 'visible' must be a boolean; got ${JSON.stringify(visible)}`);
    if (typeof opacity != "number" || !(opacity >= 0 && opacity <= 1))
        throw new TypeError(`render: ${layer.type} layer 'opacity' must be a number from 0 to 1; got ${JSON.stringify(opacity)}`);
    if (!visible || opacity == 0)
        return null;

    return { opacity, paint: await layerType(layer, env) };
}

function isSize(n)
{
    return Number.isInteger(n) && n > 0;
}

// RGBA -> RGB (alpha already composited over black).
function stripAlpha(rgba)
{
    let rgb = new Uint8Array(rgba.length / 4 * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3)
    {
        rgb[j] = rgba[i];
        rgb[j + 1] = rgba[i + 1];
        rgb[j + 2] = rgba[i + 2];
    }
    return rgb;
}
