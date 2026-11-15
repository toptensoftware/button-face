// Pure string tests for src/recolor.js (colour map, root attributes, $(x)
// substitution, unitless style length normalisation, paint-value finder).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
    applyColorMap, findPaintValues, mapPaintValues, normalizeStyleLengths,
    setRootAttribute, setRootColor, substituteText, getRootAttribute,
} from "../src/recolor.js";
import { listIcons, readIcon, readFixture } from "./helpers.js";

const iconNames = listIcons();
const materialHome = readFixture("material-home.svg");

describe("findPaintValues", () =>
{
    test("finds paint attributes, style declarations and <style> rules", () =>
    {
        let svg = `<svg color="red"><style>rect { stroke : blue } .a{fill:#fff !important;opacity:.5}</style>`
            + `<path fill="#848484" stroke-width="2" style="stop-color:#000;stroke-width:3; flood-color: green "/>`
            + `<stop stop-color='lime'/><feDiffuseLighting lighting-color="pink"/></svg>`;
        assert.deepEqual(findPaintValues(svg), [
            { name: "color", value: "red" },
            { name: "stroke", value: "blue" },
            { name: "fill", value: "#fff" },
            { name: "fill", value: "#848484" },
            { name: "stop-color", value: "#000" },
            { name: "flood-color", value: "green" },
            { name: "stop-color", value: "lime" },
            { name: "lighting-color", value: "pink" },
        ]);
    });

    test("ignores non-paint attributes, vendor properties, text and comments", () =>
    {
        let svg = `<svg><!-- <path fill="red"/> --><sodipodi:namedview pagecolor="#ffffff" inkscape:deskcolor="#d1d1d1"/>`
            + `<path id="fill" data-fill="red" style="-inkscape-stroke:none;fill-opacity:1"/>`
            + `<text>fill="red" stroke:blue</text></svg>`;
        assert.deepEqual(findPaintValues(svg), []);
    });

    test("handles prefixed <style> with CDATA and nested @media blocks", () =>
    {
        let svg = `<svg><svg:style type="text/css"><![CDATA[ @media screen { path { fill: red } } ]]></svg:style></svg>`;
        assert.deepEqual(findPaintValues(svg), [{ name: "fill", value: "red" }]);
    });
});

describe("mapPaintValues", () =>
{
    const svg = `<svg color="red" width="10"><style>.a { fill : blue ; opacity:.5 }</style>`
        + `<path style="color:#000; fill:#848484 !important;stroke-width:2" stroke="none" id="fill"/></svg>`;

    test("visits every paint value (not other values) in document order", () =>
    {
        let seen = [];
        assert.equal(mapPaintValues(svg, v => { seen.push(v); }), svg);
        assert.deepEqual(seen, [
            { name: "color", value: "red", declaration: false },
            { name: "fill", value: "blue", declaration: true },
            { name: "color", value: "#000", declaration: true },
            { name: "fill", value: "#848484", declaration: true },
            { name: "stroke", value: "none", declaration: false },
        ]);
    });

    test("replaces values the callback returns, keeping whitespace and !important", () =>
    {
        let out = mapPaintValues(svg, ({ name, declaration }) => name == "color" && declaration ? "inherit" : name == "fill" ? "lime" : undefined);
        assert.equal(out, `<svg color="red" width="10"><style>.a { fill : lime ; opacity:.5 }</style>`
            + `<path style="color:inherit; fill:lime !important;stroke-width:2" stroke="none" id="fill"/></svg>`);
    });
});

describe("applyColorMap", () =>
{
    test("matches any spelling of the colour", () =>
    {
        for (let spelling of ["#848484", "#848484FF", "#848484ff", "rgb(132,132,132)", "rgb(132 132 132 / 100%)"])
        {
            assert.equal(applyColorMap(`<path fill="${spelling}"/>`, { "#848484": "red" }), `<path fill="red"/>`, spelling);
        }
    });

    test("map keys may use any spelling", () =>
    {
        assert.equal(applyColorMap(`<path fill="#ff0000"/>`, { "rgb(255, 0, 0)": "blue" }), `<path fill="blue"/>`);
        assert.equal(applyColorMap(`<path fill="#ff0000"/>`, { red: "blue" }), `<path fill="blue"/>`);
    });

    test("accepts a Map", () =>
    {
        assert.equal(applyColorMap(`<path fill="red"/>`, new Map([["red", "blue"]])), `<path fill="blue"/>`);
    });

    test("alpha must match", () =>
    {
        let svg = `<path fill="#84848480"/>`;
        assert.equal(applyColorMap(svg, { "#848484": "red" }), svg);
        assert.equal(applyColorMap(svg, { "rgba(132,132,132,0.5)": "red" }), `<path fill="red"/>`);
    });

    test("replaces in every paint context", () =>
    {
        let svg = `<svg color="#848484"><style>.a { fill: #848484 } .b{stroke:#848484;}</style>`
            + `<path stroke="#848484" style="fill:#848484;stop-color: #848484 !important"/>`
            + `<stop stop-color="#848484"/><feFlood flood-color="#848484"/><x lighting-color="#848484"/></svg>`;
        assert.equal(applyColorMap(svg, { "#848484": "lime" }), svg.replaceAll("#848484", "lime"));
    });

    test("replacement is emitted as given, including currentColor", () =>
    {
        assert.equal(applyColorMap(`<path fill="#848484"/>`, { "#848484": "currentColor" }), `<path fill="currentColor"/>`);
        assert.equal(applyColorMap(`<path style="fill:#848484"/>`, { "#848484": "rgba(1, 2, 3, 0.5)" }),
            `<path style="fill:rgba(1, 2, 3, 0.5)"/>`);
    });

    test("preserves surrounding whitespace, quotes and !important", () =>
    {
        assert.equal(applyColorMap(`<path fill=' #848484 ' style=" fill : #848484 ! important ; x:y"/>`, { "#848484": "red" }),
            `<path fill=' red ' style=" fill : red ! important ; x:y"/>`);
    });

    test("first matching entry wins and replacements are not re-mapped", () =>
    {
        let svg = `<path fill="red" stroke="blue"/>`;
        assert.equal(applyColorMap(svg, { red: "blue", blue: "red" }), `<path fill="blue" stroke="red"/>`);
    });

    test("never touches url(), href, ids, non-paint attributes, text or comments", () =>
    {
        let svg = `<svg><!-- fill="#848484" --><path id="#848484" fill="url(#848484)" xlink:href="#848484"`
            + ` data-fill="#848484" class="fill:#848484" style="fill:url(#a) #848484;fill-opacity:#848484"/>`
            + `<text>#848484 fill="#848484"</text></svg>`;
        assert.equal(applyColorMap(svg, { "#848484": "red" }), svg);
    });

    test("none, transparent and currentColor values are never matched by other colours", () =>
    {
        let svg = `<path fill="none" stroke="currentColor" stop-color="transparent"/>`;
        assert.equal(applyColorMap(svg, { black: "red", "#848484": "red" }), svg);
    });

    test("transparent can be mapped explicitly", () =>
    {
        assert.equal(applyColorMap(`<path fill="transparent"/>`, { "rgba(0,0,0,0)": "red" }), `<path fill="red"/>`);
    });

    test("throws for map keys that are not colours", () =>
    {
        assert.throws(() => applyColorMap(`<path/>`, { none: "red" }), /not a colour/);
        assert.throws(() => applyColorMap(`<path/>`, { currentColor: "red" }), /not a colour/);
    });

    test("empty or missing map returns the input unchanged", () =>
    {
        let svg = `<path fill="red"/>`;
        assert.equal(applyColorMap(svg, {}), svg);
        assert.equal(applyColorMap(svg, null), svg);
        assert.equal(applyColorMap(svg), svg);
    });
});

describe("applyColorMap on real icons", () =>
{
    for (let name of iconNames)
    {
        test(`${name}: unmatched map is byte-for-byte identity`, () =>
        {
            let svg = readIcon(name);
            assert.equal(applyColorMap(svg, { "#123456": "red" }), svg);
        });

        test(`${name}: #848484 -> currentColor changes only paint values`, () =>
        {
            let svg = readIcon(name);
            assert.ok(!svg.includes("currentColor"));
            let out = applyColorMap(svg, { "#848484": "currentColor" });
            assert.ok(findPaintValues(svg).some(p => p.value == "#848484"), "icon has #848484 paint");
            assert.ok(!findPaintValues(out).some(p => p.value == "#848484"), "no #848484 paint left");
            assert.ok(out.includes("currentColor"));
            assert.equal(out.replaceAll("currentColor", "#848484"), svg);
        });
    }

    test("Inkscape icon: group style fill is recoloured (home)", () =>
    {
        let out = applyColorMap(readIcon("home"), { "#848484": "red" });
        assert.match(out, /style="[^"]*;fill:red;fill-opacity:1;/);
        assert.match(out, /stop-color:#000;/, "unrelated stop-color left alone");
    });

    test("Material icon: root fill attribute is recoloured (add)", () =>
    {
        let svg = readIcon("add");
        assert.equal(applyColorMap(svg, { "#848484": "red" }), svg.replace(`fill="#848484"`, `fill="red"`));
    });

    test("steam: gradient references and stop colours survive", () =>
    {
        let svg = readIcon("steam");
        let out = applyColorMap(svg, { "#848484": "red" });
        assert.ok(out.includes(`fill="url(#A)"`));
        assert.ok(out.includes(`xlink:href="#A"`));
        assert.ok(out.includes(`fill:url(#linearGradient3)`));
        assert.ok(out.includes(`stop-color="#111d2e"`));
        assert.ok(out.includes(`fill="red"`));
    });

    test("hdd: red stays red", () =>
    {
        let out = applyColorMap(readIcon("hdd"), { "#848484": "lime" });
        assert.ok(findPaintValues(out).some(p => p.value.toLowerCase() == "#ff0000"));
    });
});

describe("setRootAttribute / setRootColor", () =>
{
    test("adds the attribute when absent (one-line Material format)", () =>
    {
        assert.equal(setRootAttribute(materialHome, "fill", "currentColor"),
            materialHome.replace(`width="24">`, `width="24" fill="currentColor">`));
    });

    test("replaces the attribute when present", () =>
    {
        let svg = readIcon("add");
        assert.equal(setRootAttribute(svg, "fill", "currentColor"), svg.replace(`fill="#848484"`, `fill="currentColor"`));
    });

    test("multi-line root tag after an XML declaration and comment", () =>
    {
        let svg = readIcon("guide");
        let out = setRootAttribute(svg, "color", "red");
        assert.ok(out.includes(`xmlns:svg="http://www.w3.org/2000/svg" color="red">`));
        assert.equal(out.replace(` color="red"`, ""), svg);
        let commented = `<?xml version="1.0"?>\n<!-- <svg color="x"> -->\n<svg\n   width="1"\n   height="1"\n/>`;
        assert.equal(setRootAttribute(commented, "color", "red"),
            `<?xml version="1.0"?>\n<!-- <svg color="x"> -->\n<svg\n   width="1"\n   height="1" color="red"\n/>`);
    });

    test("only the root is affected, not nested <svg> or children", () =>
    {
        let svg = `<svg color="a"><svg color="b"/><path color="c"/></svg>`;
        assert.equal(setRootAttribute(svg, "color", "red"), `<svg color="red"><svg color="b"/><path color="c"/></svg>`);
        let svg2 = `<svg><svg/><path/></svg>`;
        assert.equal(setRootAttribute(svg2, "color", "red"), `<svg color="red"><svg/><path/></svg>`);
    });

    test("matches the exact attribute name only", () =>
    {
        let svg = `<svg fill-opacity="1" data-fill="x">`;
        assert.equal(setRootAttribute(svg, "fill", "red"), `<svg fill-opacity="1" data-fill="x" fill="red">`);
    });

    test("keeps the existing quote style and escapes the value", () =>
    {
        assert.equal(setRootAttribute(`<svg a='1'/>`, "a", `x"y'&<`), `<svg a='x"y&apos;&amp;&lt;'/>`);
        assert.equal(setRootAttribute(`<svg/>`, "a", `x"y`), `<svg a="x&quot;y"/>`);
    });

    test("throws when the root element is not <svg>", () =>
    {
        assert.throws(() => setRootAttribute(`<html><svg/></html>`, "a", "b"), /root <svg>/);
        assert.throws(() => setRootAttribute(`not svg`, "a", "b"), /root <svg>/);
    });

    test("setRootColor sets the root color attribute", () =>
    {
        assert.equal(setRootColor(`<svg fill="currentColor"><path/></svg>`, "red"),
            `<svg fill="currentColor" color="red"><path/></svg>`);
    });
});

describe("getRootAttribute", () =>
{
    test("reads root attributes (one-line and multi-line root tags)", () =>
    {
        assert.equal(getRootAttribute(materialHome, "viewBox"), "0 -960 960 960");
        assert.equal(getRootAttribute(materialHome, "width"), "24");
        assert.equal(getRootAttribute(readIcon("guide"), "height"), "24px");
        assert.equal(getRootAttribute(readIcon("home"), "viewBox"), "0 0 19.05 19.05");
    });

    test("missing attribute is undefined; exact name only; root only", () =>
    {
        let svg = `<svg data-fill="x" fill-opacity="1"><svg fill="b"/><path fill="c"/></svg>`;
        assert.equal(getRootAttribute(svg, "fill"), undefined);
        assert.equal(getRootAttribute(`<!-- <svg fill="x"> --><svg fill='a'><svg fill="b"/></svg>`, "fill"), "a");
    });

    test("unescapes XML entities (round-trips setRootAttribute)", () =>
    {
        let value = `x"y'&<>`;
        assert.equal(getRootAttribute(setRootAttribute(`<svg/>`, "a", value), "a"), value);
        assert.equal(getRootAttribute(setRootAttribute(`<svg a='1'/>`, "a", value), "a"), value);
    });

    test("throws when the root element is not <svg>", () =>
    {
        assert.throws(() => getRootAttribute(`<html><svg/></html>`, "a"), /root <svg>/);
    });
});

describe("substituteText", () =>
{
    test("replaces every $(x)", () =>
    {
        assert.equal(substituteText(`<text>$(x)</text><text>$(x)!</text>`, "Hi"), `<text>Hi</text><text>Hi!</text>`);
    });

    test("replacement text is literal (no $& / $1 patterns)", () =>
    {
        assert.equal(substituteText(`<text>$(x)</text>`, "$& $1 $$"), `<text>$& $1 $$</text>`);
    });

    test("numbers are converted to strings", () =>
    {
        assert.equal(substituteText(`<text>$(x)</text>`, 42), `<text>42</text>`);
    });

    test("empty or missing text leaves the SVG unchanged (old semantics)", () =>
    {
        let svg = `<text>$(x)</text>`;
        assert.equal(substituteText(svg, ""), svg);
        assert.equal(substituteText(svg, null), svg);
        assert.equal(substituteText(svg), svg);
    });

    test("other placeholders are untouched", () =>
    {
        let svg = `<text>$(y) $x (x)</text>`;
        assert.equal(substituteText(svg, "Hi"), svg);
    });
});

describe("normalizeStyleLengths", () =>
{
    const norm = style => normalizeStyleLengths(`<path style="${style}"/>`);

    test("appends px to unitless stroke-width", () =>
    {
        assert.equal(norm("stroke-width:0.7"), `<path style="stroke-width:0.7px"/>`);
        assert.equal(norm("stroke-width:.5"), `<path style="stroke-width:.5px"/>`);
        assert.equal(norm("stroke-width:1e-1"), `<path style="stroke-width:1e-1px"/>`);
        assert.equal(norm("stroke-width:4"), `<path style="stroke-width:4px"/>`);
        assert.equal(norm("fill:red; stroke-width : 2 !important;x:y"), `<path style="fill:red; stroke-width : 2px !important;x:y"/>`);
    });

    test("other length properties", () =>
    {
        assert.equal(norm("stroke-dashoffset:3"), `<path style="stroke-dashoffset:3px"/>`);
        assert.equal(norm("font-size:12"), `<path style="font-size:12px"/>`);
        assert.equal(norm("stroke-dasharray:2,1"), `<path style="stroke-dasharray:2px,1px"/>`);
        assert.equal(norm("stroke-dasharray:2 1.5, 3"), `<path style="stroke-dasharray:2px 1.5px, 3px"/>`);
        assert.equal(norm("stroke-dasharray:2px,1"), `<path style="stroke-dasharray:2px,1px"/>`);
    });

    test("values with units and keywords are untouched", () =>
    {
        for (let value of ["2px", "1em", "50%", "1.5pt", "inherit", "none", "calc(1px + 2px)"])
        {
            let style = `stroke-width:${value};stroke-dasharray:${value};font-size:${value}`;
            assert.equal(norm(style), `<path style="${style}"/>`, value);
        }
    });

    test("non-length properties are untouched", () =>
    {
        let style = "opacity:0.5;stroke-miterlimit:4;fill-opacity:1;stroke-opacity:.5;line-height:1.25";
        assert.equal(norm(style), `<path style="${style}"/>`);
    });

    test("presentation attributes are untouched", () =>
    {
        let svg = `<path stroke-width="4" stroke-dasharray="2,1" font-size="12"/>`;
        assert.equal(normalizeStyleLengths(svg), svg);
    });

    test("<style> text is handled", () =>
    {
        assert.equal(normalizeStyleLengths(`<svg><style>path { stroke-width: 0.7; opacity: 0.5 }</style></svg>`),
            `<svg><style>path { stroke-width: 0.7px; opacity: 0.5 }</style></svg>`);
    });

    test("built-in icon: only unitless length values change", () =>
    {
        let svg = readIcon("home");
        let out = normalizeStyleLengths(svg);
        assert.ok(out.includes("stroke-width:.489818px;"));
        assert.ok(out.includes("stroke-miterlimit:4;"));
        assert.ok(out.includes("stroke-dashoffset:0px;"));
        assert.equal(out.replace(/(\d)px/g, "$1"), svg.replace(/(\d)px/g, "$1"));
    });

    test("SVG with nothing to change is byte-for-byte identical", () =>
    {
        assert.equal(normalizeStyleLengths(materialHome), materialHome);
        let svg = readIcon("add");
        assert.equal(normalizeStyleLengths(svg), svg);
    });
});
