// Convert an old node-buttonImage definition (ButtonImage constructor options,
// or a ButtonImage instance) to a layered definition. Pure object mapping, no
// I/O, no validation beyond the input being an object - render() validates.
//
//   old                         -> new
//   virtualSize                 -> definition.virtualSize
//   backColor (default black)   -> { type: "fill", color }      (always first)
//   svgCode (truthy)            -> { type: "svg", svg }        (wins over svgFile)
//   svgFile (truthy)            -> { type: "svg", src }        ("#name" or a path for the resolver)
//   svgText (truthy)            -> svg text
//   svgForeColor (truthy)       -> svg colors: { "#848484": c } (any source)
//   svgScale                    -> svg scale (0/negative copied: old render threw, new rejects)
//   svgTranslate                -> svg translate
//   text (truthy)               -> { type: "text", text: String(text) } (always last)
//   textColor / textAlign / textVAlign / font -> text color / align / valign / font
//   textLineSpacing (truthy)    -> text lineSpacing             (old treated 0 as 1)
//   textPadding / textTranslate -> text padding / translate
//
// Empty/unset old values are omitted so the new defaults reproduce the old
// behaviour. Properties are read by name (not Object.keys) so instances with
// getters / private fields convert too. Ignored: channels (a render option),
// state/states (not supported), onInvalidate and unknown keys.

/** The old recolour key (built-in icons' grey), replaced by svgForeColor. */
const GREY = "#848484";

/**
 * @param {object} old - old ButtonImage options (or instance)
 * @returns {import("./render.js").Definition}
 */
export function convertLegacyDefinition(old)
{
    if (old === null || typeof old != "object" || Array.isArray(old))
        throw new TypeError("convertLegacyDefinition: expected an options object");

    /** @type {any} */
    let def = {};
    setIfSet(def, "virtualSize", old.virtualSize);
    def.layers = [{ type: "fill", color: old.backColor ?? "black" }];

    let svg = svgLayer(old);
    if (svg)
        def.layers.push(svg);
    if (old.text)
        def.layers.push(textLayer(old));
    return def;
}

// The text layer (only called for a truthy `text`).
function textLayer(old)
{
    /** @type {any} */
    let layer = { type: "text", text: String(old.text) };
    setIfSet(layer, "color", old.textColor);
    setIfSet(layer, "align", old.textAlign);
    setIfSet(layer, "valign", old.textVAlign);
    setIfSet(layer, "font", old.font);
    setIfSet(layer, "lineSpacing", old.textLineSpacing, Boolean);
    setIfSet(layer, "padding", old.textPadding);
    setIfSet(layer, "translate", old.textTranslate);
    return layer;
}

// The svg layer, or null when there is no (truthy) svgCode/svgFile.
function svgLayer(old)
{
    /** @type {any} */
    let layer = { type: "svg" };
    if (old.svgCode)
        layer.svg = old.svgCode;
    else if (old.svgFile)
        layer.src = old.svgFile;
    else
        return null;
    setIfSet(layer, "text", old.svgText, Boolean);
    if (old.svgForeColor)
        layer.colors = { [GREY]: old.svgForeColor };
    setIfSet(layer, "scale", old.svgScale);
    setIfSet(layer, "translate", old.svgTranslate);
    return layer;
}

/** @param {unknown} value */
const isSet = value => value != null;

// Copy `value` to `target[key]` if `when(value)` (default: not null/undefined;
// pass `Boolean` where the old code ignored any falsy value). Arrays and
// objects are copied (one level - enough for sizes, translates and padding)
// so the output never shares the caller's objects.
function setIfSet(target, key, value, when = isSet)
{
    if (!when(value))
        return;
    if (Array.isArray(value))
        value = [...value];
    else if (typeof value == "object")
        value = { ...value };
    target[key] = value;
}
