// Tests for src/scale.js: virtual pixel -> device pixel maths (the only place
// it lives) and scaleFont. Semantics follow the old project's drawButton.js.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createScaler, scaleFont, DEFAULT_VIRTUAL_SIZE } from "../src/scale.js";

describe("createScaler", () =>
{
    test("default virtual size is 72x72", () =>
    {
        assert.deepEqual(DEFAULT_VIRTUAL_SIZE, { width: 72, height: 72 });
        assert.ok(Object.isFrozen(DEFAULT_VIRTUAL_SIZE));
        let s = createScaler(undefined, 144, 36);
        assert.equal(s.sx, 2);
        assert.equal(s.sy, 0.5);
        assert.equal(createScaler(null, 72, 72).sx, 1);
    });

    test("sx = width / virtual width, sy = height / virtual height", () =>
    {
        let s = createScaler({ width: 100, height: 50 }, 200, 200);
        assert.equal(s.sx, 2);
        assert.equal(s.sy, 4);
        assert.equal(s.x(10), 20);
        assert.equal(s.y(10), 40);
    });

    test("translate scales x by sx and y by sy, missing parts are 0", () =>
    {
        let s = createScaler({ width: 72, height: 72 }, 144, 216);
        assert.deepEqual(s.translate({ x: 10, y: -7 }), { x: 20, y: -21 });
        assert.deepEqual(s.translate({ y: 1 }), { x: 0, y: 3 });
        assert.deepEqual(s.translate(), { x: 0, y: 0 });
        assert.deepEqual(s.translate(null), { x: 0, y: 0 });
    });

    test("padding: number applies to all sides; t/b by sy, l/r by sx", () =>
    {
        let s = createScaler(undefined, 144, 216);
        assert.deepEqual(s.padding(3), { top: 9, right: 6, bottom: 9, left: 6 });
    });

    test("padding: [topBottom, leftRight]", () =>
    {
        let s = createScaler(undefined, 144, 216);
        assert.deepEqual(s.padding([1, 2]), { top: 3, right: 4, bottom: 3, left: 4 });
    });

    test("padding: [top, right, bottom, left]", () =>
    {
        let s = createScaler(undefined, 144, 216);
        assert.deepEqual(s.padding([1, 2, 3, 4]), { top: 3, right: 4, bottom: 9, left: 8 });
    });

    test("padding: missing is zero (callers supply their own default)", () =>
    {
        let s = createScaler(undefined, 144, 144);
        assert.deepEqual(s.padding(), { top: 0, right: 0, bottom: 0, left: 0 });
        assert.deepEqual(s.padding(null), { top: 0, right: 0, bottom: 0, left: 0 });
    });

    test("padding: other array lengths throw", () =>
    {
        let s = createScaler(undefined, 72, 72);
        assert.throws(() => s.padding([]), TypeError);
        assert.throws(() => s.padding([1]), TypeError);
        assert.throws(() => s.padding([1, 2, 3]), TypeError);
        assert.throws(() => s.padding([1, 2, 3, 4, 5]), TypeError);
    });

    test("padding: non-numeric values throw", () =>
    {
        let s = createScaler(undefined, 72, 72);
        for (let p of ["3", [1, "2"], [1, 2, NaN, 4], Infinity, {}])
            assert.throws(() => s.padding(p), /padding/, JSON.stringify(p));
    });

    test("does not mutate the padding array", () =>
    {
        let p = [1, 2, 3, 4];
        createScaler(undefined, 144, 144).padding(p);
        assert.deepEqual(p, [1, 2, 3, 4]);
    });

    test("invalid virtual size throws", () =>
    {
        assert.throws(() => createScaler({ width: 0, height: 72 }, 72, 72), RangeError);
        assert.throws(() => createScaler({ width: 72, height: -1 }, 72, 72), RangeError);
        assert.throws(() => createScaler({ width: 72 }, 72, 72), RangeError);
    });
});

describe("scaleFont", () =>
{
    test("scales the first px size", () =>
    {
        assert.equal(scaleFont("bold 16px sans-serif", 2), "bold 32px sans-serif");
        assert.equal(scaleFont("italic bold 20px Arial", 1.5), "italic bold 30px Arial");
        assert.equal(scaleFont("12.5px Arial", 2), "25px Arial");
        assert.equal(scaleFont(".5px Arial", 4), "2px Arial");
    });

    test("only the first px size is scaled (e.g. line-height left alone)", () =>
    {
        assert.equal(scaleFont("16px/20px serif", 2), "32px/20px serif");
    });

    test("throws without a px size", () =>
    {
        assert.throws(() => scaleFont("bold 1em sans-serif", 2), /px/);
        assert.throws(() => scaleFont("bold sans-serif", 2), /px/);
    });

    test("does not match px inside a font family name", () =>
    {
        assert.throws(() => scaleFont("bold Foopx", 2), /px/);
    });
});
