// SVG source rewriting: colour maps, root attributes, `$(x)` text substitution
// and unitless style length normalisation. Pure string -> string functions,
// dependency-free apart from color.js, and browser-safe.
//
// All value rewriting goes through one small tokeniser (`rewriteValues`) that
// visits every attribute value and every CSS declaration (in `style="..."`
// attributes and `<style>` elements), so recolouring, paint lookups and length
// normalisation share the same notion of "where values live". Everything the
// visitor doesn't change is preserved byte-for-byte.

import { parseColor, colorsEqual, NUMBER } from "./color.js";

/** Properties (attribute or CSS declaration names) that hold a paint colour. */
const PAINT_PROPERTIES = new Set(["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"]);

// Markup scanner. Alternatives, in priority order: comments, CDATA sections
// and other `<!...>`/`<?...?>` markup (skipped); a whole `<style>` element
// (open tag, body, close tag captured); any other start tag.
const QUOTED = String.raw`(?:"[^"]*"|'[^']*')`;
const ATTRS = String.raw`(?:\s+[^\s=/>"']+\s*=\s*${QUOTED})*`;
const STYLE_TAG = String.raw`(?:[\w.-]+:)?style`;
const MARKUP = new RegExp([
    String.raw`<!--[\s\S]*?-->`,
    String.raw`<!\[CDATA\[[\s\S]*?\]\]>`,
    String.raw`<[!?][^>]*>`,
    String.raw`(<${STYLE_TAG}${ATTRS}\s*>)([\s\S]*?)(<\/${STYLE_TAG}\s*>)`,
    String.raw`<[A-Za-z_][\w.:-]*${ATTRS}\s*\/?>`,
].join("|"), "g");

// One attribute inside a start tag: whitespace, name, `=`, quoted value.
const ATTR = /(\s+)([^\s=/>"']+)(\s*=\s*)(?:"([^"]*)"|'([^']*)')/g;

// The innermost `{...}` blocks of a stylesheet (handles nested @media).
const CSS_BLOCK = /\{([^{}]*)\}/g;

// One declaration in a declaration list: `prop: value [!important]`.
const DECLARATION = /(^|;)(\s*)([-\w]+)(\s*:)([^;]*?)((?:\s*!\s*important)?\s*)(?=;|$)/gi;

/**
 * @typedef {object} SvgValue
 * @property {string} name - attribute name (as written) or CSS property name (lower case)
 * @property {string} value - the value with surrounding whitespace (and `!important`) removed
 * @property {boolean} declaration - true for CSS declarations, false for attributes
 */

/**
 * The shared tokeniser. Calls `visit` for every attribute value and every CSS
 * declaration (style attributes and `<style>` elements) outside comments.
 * If `visit` returns a string it replaces the trimmed value; returning
 * undefined leaves it untouched.
 * @param {string} svg
 * @param {(v: SvgValue) => string|undefined} visit
 * @returns {string}
 */
function rewriteValues(svg, visit)
{
    return svg.replace(MARKUP, (match, styleOpen, styleBody, styleClose) =>
    {
        if (styleOpen !== undefined)
            return rewriteTag(styleOpen, visit) + styleBody.replace(CSS_BLOCK, (m, body) => `{${rewriteDeclarations(body, visit)}}`) + styleClose;
        if (match[1] == "!" || match[1] == "?")
            return match;
        return rewriteTag(match, visit);
    });
}

function rewriteTag(tag, visit)
{
    return tag.replace(ATTR, (match, space, name, equals, doubleQuoted, singleQuoted) =>
    {
        let value = doubleQuoted ?? singleQuoted;
        let rewritten = name == "style"
            ? rewriteDeclarations(value, visit)
            : rewriteTrimmed(value, v => visit({ name, value: v, declaration: false }));
        if (rewritten === value)
            return match;
        let quote = doubleQuoted !== undefined ? `"` : `'`;
        return space + name + equals + quote + rewritten + quote;
    });
}

function rewriteDeclarations(list, visit)
{
    return list.replace(DECLARATION, (match, sep, space, name, colon, value, important) =>
    {
        let rewritten = rewriteTrimmed(value, v => visit({ name: name.toLowerCase(), value: v, declaration: true }));
        return rewritten === value ? match : sep + space + name + colon + rewritten + important;
    });
}

// Apply `fn` to `raw` without its surrounding whitespace, then restore it.
function rewriteTrimmed(raw, fn)
{
    let [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
    if (!core)
        return raw;
    let result = fn(core);
    return result === undefined ? raw : lead + result + trail;
}

/**
 * Every paint value in an SVG: `fill`, `stroke`, `stop-color`, `flood-color`,
 * `lighting-color` and `color`, as attributes or as declarations in style
 * attributes and `<style>` elements. Vendor (`-inkscape-stroke`) and related
 * (`fill-opacity`, `stroke-width`) properties are not included.
 * @param {string} svg
 * @returns {{ name: string, value: string }[]} in document order
 */
export function findPaintValues(svg)
{
    let found = [];
    rewriteValues(svg, ({ name, value }) =>
    {
        if (PAINT_PROPERTIES.has(name))
            found.push({ name, value });
    });
    return found;
}

/**
 * Replace colours in paint contexts (see `findPaintValues`). Values are
 * compared after normalisation (`#848484`, `#848484FF` and
 * `rgb(132,132,132)` are the same colour; alpha must match too), so `url()`,
 * `none`, `currentColor` and ids/hrefs are never touched. Replacements are
 * emitted exactly as given (any CSS colour, or e.g. `currentColor`) and are
 * not themselves re-mapped. The first matching map entry wins.
 * @param {string} svg
 * @param {Record<string, string>|Map<string, string>|null} [map] - from colour -> to value
 * @returns {string}
 */
export function applyColorMap(svg, map)
{
    if (!map)
        return svg;
    let entries = (map instanceof Map ? [...map] : Object.entries(map)).map(([from, to]) =>
    {
        let color = parseColor(from);
        if (!color)
            throw new TypeError(`applyColorMap: "${from}" is not a colour`);
        return [color, String(to)];
    });
    if (entries.length == 0)
        return svg;
    return rewriteValues(svg, ({ name, value }) =>
    {
        if (!PAINT_PROPERTIES.has(name))
            return undefined;
        let color = parseColor(value);
        return color ? entries.find(([from]) => colorsEqual(from, color))?.[1] : undefined;
    });
}

const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", '"': "&quot;", "'": "&apos;" };

/**
 * Set (add or replace) one attribute on the root `<svg>` element. The rest of
 * the document, including the root tag's other attributes, formatting and
 * nested `<svg>` elements, is unchanged. The value is XML-escaped.
 * @param {string} svg
 * @param {string} name - exact attribute name, e.g. `color`, `fill`
 * @param {string} value
 * @returns {string}
 * @throws if the document's root element is not `<svg>`
 */
export function setRootAttribute(svg, name, value)
{
    let root = [...svg.matchAll(MARKUP)].find(m => m[0][1] != "!" && m[0][1] != "?");
    let tag = root?.[1] ?? root?.[0];
    if (!tag || /^<(?:[\w.-]+:)?([^\s/>]+)/.exec(tag)[1] != "svg")
        throw new Error("setRootAttribute: document has no root <svg> element");

    let escape = quote => String(value).replace(quote == `"` ? /[&<"]/g : /[&<']/g, c => XML_ESCAPES[c]);
    let found = false;
    let newTag = tag.replace(ATTR, (match, space, attrName, equals, doubleQuoted) =>
    {
        if (found || attrName != name)
            return match;
        found = true;
        let quote = doubleQuoted !== undefined ? `"` : `'`;
        return space + attrName + equals + quote + escape(quote) + quote;
    });
    if (!found)
        newTag = tag.replace(/\s*\/?>$/, end => ` ${name}="${escape(`"`)}"${end}`);
    return svg.slice(0, root.index) + newTag + svg.slice(root.index + tag.length);
}

/**
 * Set the root `<svg>`'s `color` attribute (what `currentColor` resolves to).
 * @param {string} svg
 * @param {string} color
 */
export const setRootColor = (svg, color) => setRootAttribute(svg, "color", color);

/**
 * Replace every `$(x)` placeholder with `text`, literally (as the old
 * project's `svgText`). Empty/missing text leaves the SVG unchanged. The text
 * is not XML-escaped.
 * @param {string} svg
 * @param {string|number|null} [text]
 * @returns {string}
 */
export function substituteText(svg, text)
{
    if (text == null || text === "")
        return svg;
    return svg.replaceAll("$(x)", () => String(text));
}

/** CSS length properties whose unitless values get `px` (not ratios like stroke-miterlimit). */
const LENGTH_PROPERTIES = new Set(["stroke-width", "stroke-dashoffset", "stroke-dasharray", "font-size"]);
const UNITLESS_NUMBER = new RegExp(String.raw`(^|[\s,])(${NUMBER})(?=$|[\s,])`, "gi");

/**
 * Append `px` to unitless numbers in CSS length declarations (style
 * attributes and `<style>` elements; presentation attributes are left alone).
 * Skia (@napi-rs/canvas) ignores e.g. `style="stroke-width:0.7"`, while
 * browsers and librsvg accept it; `0.7px` works everywhere.
 * @param {string} svg
 * @returns {string}
 */
export function normalizeStyleLengths(svg)
{
    return rewriteValues(svg, ({ name, value, declaration }) =>
        declaration && LENGTH_PROPERTIES.has(name) ? value.replace(UNITLESS_NUMBER, "$1$2px") : undefined);
}
