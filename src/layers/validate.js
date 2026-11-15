// Property validation shared by the layer types. Errors are `TypeError`s
// prefixed with the layer type, e.g. "svg layer: invalid tint 'nope'".

import { parseColor, formatColor } from "../color.js";

/**
 * Parse a CSS colour property; returns it canonical (#rrggbb / rgba()) so the
 * canvas only ever sees colours parseColor understands.
 * @param {string} type - layer type, for the error message
 * @param {string} name - property name, for the error message
 * @param {unknown} value
 * @returns {string}
 */
export function validColor(type, name, value)
{
    let parsed = parseColor(value);
    if (!parsed)
        throw new TypeError(`${type} layer: invalid ${name} '${value}'`);
    return formatColor(parsed);
}

/**
 * Check a property is a finite number greater than 0.
 * @param {string} type - layer type, for the error message
 * @param {string} name - property name, for the error message
 * @param {unknown} value
 */
export function validatePositive(type, name, value)
{
    if (typeof value != "number" || !(value > 0 && value < Infinity))
        throw new TypeError(`${type} layer: '${name}' must be a positive number; got ${JSON.stringify(value)}`);
}

/**
 * Check a `translate` property: null/undefined or `{ x?, y? }` finite numbers.
 * @param {string} type - layer type, for the error message
 * @param {unknown} t
 */
export function validateTranslate(type, t)
{
    let ok = t == null || (typeof t == "object"
        && ["x", "y"].every(k => t[k] === undefined || Number.isFinite(t[k])));
    if (!ok)
        throw new TypeError(`${type} layer: 'translate' must be { x?: number, y?: number }; got ${JSON.stringify(t)}`);
}
