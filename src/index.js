// Public, portable core entry ("@toptensoftware/button-face"). Browser-safe:
// nothing here (or reachable from here) imports Node built-ins or native
// modules. `render` needs a backend passed in options; Node users can import
// "@toptensoftware/button-face/node" for ready-made defaults.

export { render, layerTypes } from "./render.js";
export { createSvgResolver, resolveBuiltinIcon } from "./resolve.js";
export { icons } from "./icons.js";
export { parseColor, colorsEqual, formatColor, namedColors } from "./color.js";
export {
    applyColorMap, mapPaintValues, findPaintValues, getRootAttribute,
    setRootAttribute, setRootColor, substituteText, normalizeStyleLengths,
} from "./recolor.js";
export { getSvgSize, padViewBox, parseViewBox, parseLength } from "./svgSize.js";
export { createScaler, scaleFont, DEFAULT_VIRTUAL_SIZE } from "./scale.js";
export { wrapLines } from "./wrapLines.js";
