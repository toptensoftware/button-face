// convertLegacyDefinition: old node-buttonImage options -> layered definition.

import { test } from "node:test";
import assert from "node:assert/strict";
import { convertLegacyDefinition as convert, findLegacyKey } from "../src/legacy.js";

const BLACK = { type: "fill", color: "black" };

// ---- input / skeleton ------------------------------------------------------

test("a definition with a 'layers' key is returned unchanged (same object)", () =>
{
    for (let def of [{ layers: [] }, { layers: [{ type: "fill", color: "red" }], virtualSize: { width: 10, height: 10 } },
        { layers: undefined }, { layers: [], backColor: "red", text: "x" }])
        assert.equal(convert(def), def);
});

test("findLegacyKey: first old-format key of a layer-less definition, else undefined", () =>
{
    assert.equal(findLegacyKey({ backColor: "red" }), "backColor");
    assert.equal(findLegacyKey({ virtualSize: { width: 1, height: 1 }, svgFile: "#play" }), "svgFile");
    assert.equal(findLegacyKey({ text: "" }), "text");
    assert.equal(findLegacyKey({ states: {} }), "states");
    // instances: getters on the prototype count
    class Old { get svgCode() { return null; } }
    assert.equal(findLegacyKey(new Old()), "svgCode");
    // not legacy
    for (let def of [{}, { virtualSize: { width: 1, height: 1 } }, { layers: [], backColor: "red" }, { whatever: 1 }])
        assert.equal(findLegacyKey(def), undefined, JSON.stringify(def));
});

test("non-object input throws TypeError", () =>
{
    for (let bad of [undefined, null, 42, "x", true, [], [{}]])
        assert.throws(() => convert(bad), TypeError, `accepted ${JSON.stringify(bad)}`);
});

test("{} -> black fill only", () =>
{
    assert.deepEqual(convert({}), { layers: [BLACK] });
});

test("backColor -> fill colour; null/undefined -> black", () =>
{
    assert.deepEqual(convert({ backColor: "red" }), { layers: [{ type: "fill", color: "red" }] });
    assert.deepEqual(convert({ backColor: "transparent" }), { layers: [{ type: "fill", color: "transparent" }] });
    assert.deepEqual(convert({ backColor: null }), { layers: [BLACK] });
    assert.deepEqual(convert({ backColor: undefined }), { layers: [BLACK] });
});

test("virtualSize copied (new object) only when set", () =>
{
    let virtualSize = { width: 96, height: 72 };
    let out = convert({ virtualSize });
    assert.deepEqual(out, { virtualSize: { width: 96, height: 72 }, layers: [BLACK] });
    assert.notEqual(out.virtualSize, virtualSize);
    assert.deepEqual(convert({ virtualSize: null }), { layers: [BLACK] });
});

test("channels, state, states, onInvalidate and unknown keys are ignored", () =>
{
    let out = convert({
        channels: 4, state: "pressed", states: { pressed: { backColor: "red" } },
        onInvalidate() {}, whatever: 1,
    });
    assert.deepEqual(out, { layers: [BLACK] });
});

// ---- svg -------------------------------------------------------------------

// The svg layer converted from `old` (asserting it's the only extra layer).
function svgOf(old)
{
    let { layers } = convert(old);
    assert.equal(layers.length, 2);
    assert.equal(layers[1].type, "svg");
    return layers[1];
}

const BOX = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#848484"/></svg>`;

test("svgFile '#name' and paths -> src; svgCode -> svg", () =>
{
    assert.deepEqual(svgOf({ svgFile: "#heart" }), { type: "svg", src: "#heart" });
    assert.deepEqual(svgOf({ svgFile: "icons/x.svg" }), { type: "svg", src: "icons/x.svg" });
    assert.deepEqual(svgOf({ svgCode: BOX }), { type: "svg", svg: BOX });
});

test("both svgFile and svgCode -> svgCode wins", () =>
{
    assert.deepEqual(svgOf({ svgFile: "#heart", svgCode: BOX }), { type: "svg", svg: BOX });
    assert.deepEqual(svgOf({ svgCode: BOX, svgFile: "#heart" }), { type: "svg", svg: BOX });
    // A falsy svgCode doesn't hide a set svgFile.
    assert.deepEqual(svgOf({ svgFile: "#heart", svgCode: "" }), { type: "svg", src: "#heart" });
});

test("no truthy svg source -> no svg layer (other svg props ignored)", () =>
{
    for (let old of [{ svgFile: "" }, { svgCode: "" }, { svgFile: null, svgCode: null },
        { svgForeColor: "red", svgScale: 0.5, svgText: "x", svgTranslate: { y: 1 } }])
    {
        assert.deepEqual(convert(old), { layers: [BLACK] }, JSON.stringify(old));
    }
});

test("svgText: truthy -> text, falsy omitted", () =>
{
    assert.equal(svgOf({ svgFile: "#hdd", svgText: "C:" }).text, "C:");
    assert.equal(svgOf({ svgFile: "#hdd", svgText: 7 }).text, 7);
    for (let svgText of [0, "", null, undefined, false])
        assert.ok(!("text" in svgOf({ svgFile: "#hdd", svgText })), `svgText ${svgText}`);
});

test("svgForeColor -> colors { '#848484': c } for every source; falsy omitted", () =>
{
    for (let src of [{ svgFile: "#heart" }, { svgFile: "x.svg" }, { svgCode: BOX }])
    {
        assert.deepEqual(svgOf({ ...src, svgForeColor: "red" }).colors, { "#848484": "red" });
        for (let svgForeColor of ["", null, undefined])
            assert.ok(!("colors" in svgOf({ ...src, svgForeColor })));
    }
});

test("svgScale copied unless null/undefined (0 and negatives as-is: old render threw too)", () =>
{
    assert.equal(svgOf({ svgFile: "#heart", svgScale: 0.5 }).scale, 0.5);
    assert.equal(svgOf({ svgFile: "#heart", svgScale: 0 }).scale, 0);
    assert.equal(svgOf({ svgFile: "#heart", svgScale: -1 }).scale, -1);
    for (let svgScale of [null, undefined])
        assert.ok(!("scale" in svgOf({ svgFile: "#heart", svgScale })));
});

test("svgTranslate copied as a new object; null omitted", () =>
{
    let svgTranslate = { x: 2, y: -7 };
    let layer = svgOf({ svgFile: "#heart", svgTranslate });
    assert.deepEqual(layer.translate, { x: 2, y: -7 });
    assert.notEqual(layer.translate, svgTranslate);
    assert.ok(!("translate" in svgOf({ svgFile: "#heart", svgTranslate: null })));
});

test("svg layer with every prop, in order", () =>
{
    assert.deepEqual(svgOf({ svgFile: "#hdd", svgText: "D", svgForeColor: "white", svgScale: 0.8, svgTranslate: { y: -7 } }),
        { type: "svg", src: "#hdd", text: "D", colors: { "#848484": "white" }, scale: 0.8, translate: { y: -7 } });
});

// ---- text ------------------------------------------------------------------

// The last (text) layer converted from `old`.
function textOf(old)
{
    let layer = convert(old).layers.at(-1);
    assert.equal(layer.type, "text");
    return layer;
}

test("text: truthy -> text layer with String(text); falsy -> no text layer", () =>
{
    assert.deepEqual(textOf({ text: "Hello" }), { type: "text", text: "Hello" });
    assert.deepEqual(textOf({ text: 42 }), { type: "text", text: "42" });
    for (let text of ["", null, undefined, 0, false])
        assert.deepEqual(convert({ text }), { layers: [BLACK] }, `text ${text}`);
});

test("text-only props without text produce no layer", () =>
{
    assert.deepEqual(convert({ textColor: "red", textAlign: "left", textVAlign: "top", font: "12px serif",
        textLineSpacing: 2, textPadding: 5, textTranslate: { x: 1 } }), { layers: [BLACK] });
});

test("textColor, textAlign, textVAlign, font copied unless null/undefined", () =>
{
    assert.deepEqual(textOf({ text: "a", textColor: "red", textAlign: "left", textVAlign: "bottom", font: "bold 11px sans-serif" }),
        { type: "text", text: "a", color: "red", align: "left", valign: "bottom", font: "bold 11px sans-serif" });
    for (let v of [null, undefined])
    {
        assert.deepEqual(textOf({ text: "a", textColor: v, textAlign: v, textVAlign: v, font: v }),
            { type: "text", text: "a" });
    }
});

test("textLineSpacing copied only when truthy (0 was treated as 1)", () =>
{
    assert.equal(textOf({ text: "a", textLineSpacing: 1.5 }).lineSpacing, 1.5);
    for (let textLineSpacing of [0, null, undefined])
        assert.ok(!("lineSpacing" in textOf({ text: "a", textLineSpacing })));
});

test("textPadding: numbers copied, arrays copied (not shared); null omitted", () =>
{
    assert.equal(textOf({ text: "a", textPadding: 0 }).padding, 0);
    assert.equal(textOf({ text: "a", textPadding: 5 }).padding, 5);
    for (let textPadding of [[9, 4], [1, 2, 3, 4]])
    {
        let padding = textOf({ text: "a", textPadding }).padding;
        assert.deepEqual(padding, textPadding);
        assert.notEqual(padding, textPadding);
    }
    assert.ok(!("padding" in textOf({ text: "a", textPadding: null })));
});

test("textTranslate copied as a new object; null omitted", () =>
{
    let textTranslate = { x: 1, y: 2 };
    let layer = textOf({ text: "a", textTranslate });
    assert.deepEqual(layer.translate, { x: 1, y: 2 });
    assert.notEqual(layer.translate, textTranslate);
    assert.ok(!("translate" in textOf({ text: "a", textTranslate: null })));
});

test("layer order is fill -> svg -> text", () =>
{
    assert.deepEqual(convert({ text: "a", svgFile: "#heart", backColor: "blue" }).layers.map(l => l.type),
        ["fill", "svg", "text"]);
});

// ---- input forms, immutability, real-world shapes --------------------------

// A ButtonImage-like class: values live in private fields behind prototype
// getters/setters, so nothing is an own enumerable property.
class FakeButtonImage
{
    #backColor = "black";
    #svgFile; #svgForeColor = null; #svgTranslate = null;
    #text = null; #textVAlign = "center"; #textPadding = 3;
    constructor(options) { Object.assign(this, options); }
    get backColor() { return this.#backColor; }
    set backColor(v) { this.#backColor = v; }
    get svgFile() { return this.#svgFile; }
    set svgFile(v) { this.#svgFile = v; }
    get svgForeColor() { return this.#svgForeColor; }
    set svgForeColor(v) { this.#svgForeColor = v; }
    get svgTranslate() { return this.#svgTranslate; }
    set svgTranslate(v) { this.#svgTranslate = v; }
    get text() { return this.#text; }
    set text(v) { this.#text = v; }
    get textVAlign() { return this.#textVAlign; }
    set textVAlign(v) { this.#textVAlign = v; }
    get textPadding() { return this.#textPadding; }
    set textPadding(v) { this.#textPadding = v; }
}

test("a class instance with getters / private fields converts like the plain object (plus its defaults)", () =>
{
    let options = { backColor: "navy", svgFile: "#play", svgForeColor: "white", svgTranslate: { y: -7 },
        text: "Play", textVAlign: "bottom" };
    let instance = new FakeButtonImage(options);
    assert.deepEqual(Object.keys(instance), []);
    assert.deepEqual(convert(instance), convert({ ...options, textPadding: 3 }));
    // Defaults of an empty instance: black fill, nothing else drawn.
    assert.deepEqual(convert(new FakeButtonImage()), { layers: [BLACK] });
});

function deepFreeze(obj)
{
    for (let value of Object.values(obj))
    {
        if (value && typeof value == "object")
            deepFreeze(value);
    }
    return Object.freeze(obj);
}

// Every object/array reachable from `obj`.
function objectsIn(obj, found = new Set())
{
    found.add(obj);
    for (let value of Object.values(obj))
    {
        if (value && typeof value == "object")
            objectsIn(value, found);
    }
    return found;
}

test("input is not mutated and shares no objects with the output", () =>
{
    let old = deepFreeze({
        virtualSize: { width: 96, height: 72 }, backColor: "black",
        svgFile: "#hdd", svgTranslate: { x: 1, y: -7 },
        text: "Disk", textPadding: [9, 4], textTranslate: { x: 0, y: 2 },
    });
    let snapshot = structuredClone(old);
    let out = convert(old);
    assert.deepEqual(old, snapshot);
    let inputs = objectsIn(old);
    for (let o of objectsIn(out))
        assert.ok(!inputs.has(o), `output shares ${JSON.stringify(o)}`);
});

test("real world: the old project's test.js definition", () =>
{
    assert.deepEqual(convert({
        backColor: "black", svgFile: "#apple-tv", svgForeColor: "#404040", svgTranslate: { y: -7 },
        text: "Hello!", textColor: "white", textVAlign: "bottom", textAlign: "center",
    }), {
        layers: [
            { type: "fill", color: "black" },
            { type: "svg", src: "#apple-tv", colors: { "#848484": "#404040" }, translate: { y: -7 } },
            { type: "text", text: "Hello!", color: "white", align: "center", valign: "bottom" },
        ],
    });
});

test("real world: ControlBlock look.js-style definition", () =>
{
    assert.deepEqual(convert({
        virtualSize: { width: 120, height: 72 },
        backColor: "transparent",
        svgFile: "C:/icons/mixer.svg", svgForeColor: "white", svgScale: 0.6, svgText: "1",
        svgTranslate: { x: 0, y: -7 },
        text: "Mixer", textColor: "#ffcc00", textAlign: "center", textVAlign: "bottom",
        font: "bold 11px sans-serif", textPadding: [9, 4], textTranslate: { x: 0, y: 1 }, textLineSpacing: 0.9,
    }), {
        virtualSize: { width: 120, height: 72 },
        layers: [
            { type: "fill", color: "transparent" },
            { type: "svg", src: "C:/icons/mixer.svg", text: "1", colors: { "#848484": "white" }, scale: 0.6,
                translate: { x: 0, y: -7 } },
            { type: "text", text: "Mixer", color: "#ffcc00", align: "center", valign: "bottom",
                font: "bold 11px sans-serif", lineSpacing: 0.9, padding: [9, 4], translate: { x: 0, y: 1 } },
        ],
    });
});
