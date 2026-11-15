// Render a set of sample buttons for human visual review (not verifiable by
// tests - see test/samples.test.js, which only checks this runs).
//
// Usage: node scripts/render-samples.js [outDir]     (npm run samples)
// Default outDir: scratch/samples. Writes <outDir>/<group>/<sample>.png for
// every sample, plus <outDir>/contact-sheet.png combining them all (labelled;
// RGBA samples drawn over a checkerboard so transparency is visible).
// The sample definitions live in scripts/sample-defs.js (shared with the
// browser demo page, npm run samples:browser).

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, napiBackend } from "../src/node.js";
import { groups, sampleSize, sampleFileName, renderSample, toRgba } from "./sample-defs.js";

const outDir = process.argv[2] ?? fileURLToPath(new URL("../scratch/samples/", import.meta.url));

// ---- render, write, contact sheet ------------------------------------------

/** Raw render result -> napi canvas. */
function toCanvas(result)
{
    let canvas = napiBackend.createCanvas(result.width, result.height);
    let ctx = canvas.getContext("2d");
    let image = ctx.createImageData(result.width, result.height);
    image.data.set(toRgba(result));
    ctx.putImageData(image, 0, 0);
    return canvas;
}

let rendered = [];
for (let group of groups)
{
    // Start each group folder fresh (stale samples from renamed labels go).
    rmSync(join(outDir, group.name), { recursive: true, force: true });
    mkdirSync(join(outDir, group.name), { recursive: true });
    let items = [];
    for (let [i, sample] of group.samples.entries())
    {
        let [w, h] = sampleSize(sample);
        let canvas = toCanvas(await renderSample(render, sample));
        writeFileSync(join(outDir, group.name, sampleFileName(i, sample)), canvas.toBuffer("image/png"));
        items.push({ label: sample.label, canvas, w, h });
    }
    rendered.push({ name: group.name, items });
}

// Contact sheet: groups top to bottom, cells left to right, wrapping.
const SHEET_W = 1200, PAD = 6, LABEL_H = 13, HEADER_H = 22;
function layout(draw)
{
    let y = PAD;
    for (let group of rendered)
    {
        draw?.header(group.name, y);
        y += HEADER_H;
        let x = PAD, rowH = 0;
        for (let item of group.items)
        {
            let cellW = Math.max(item.w, 72);
            if (x + cellW > SHEET_W - PAD)
            {
                x = PAD;
                y += rowH;
                rowH = 0;
            }
            draw?.cell(item, x, y, cellW);
            x += cellW + PAD;
            rowH = Math.max(rowH, item.h + LABEL_H + PAD);
        }
        y += rowH + PAD;
    }
    return y;
}

let sheet = napiBackend.createCanvas(SHEET_W, layout());
let ctx = sheet.getContext("2d");
ctx.fillStyle = "#9e9e9e";
ctx.fillRect(0, 0, sheet.width, sheet.height);
layout({
    header(name, y)
    {
        ctx.fillStyle = "black";
        ctx.font = "bold 14px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(name, PAD, y + 3);
    },
    cell({ label, canvas, w, h }, x, y, cellW)
    {
        // Checkerboard behind (shows RGBA transparency).
        for (let cy = 0; cy < h; cy += 8)
        {
            for (let cx = 0; cx < w; cx += 8)
            {
                ctx.fillStyle = ((cx + cy) / 8) % 2 ? "#5a5a5a" : "#7a7a7a";
                ctx.fillRect(x + cx, y + cy, Math.min(8, w - cx), Math.min(8, h - cy));
            }
        }
        ctx.drawImage(canvas, x, y);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y + h, cellW, LABEL_H);
        ctx.clip();
        ctx.fillStyle = "black";
        ctx.font = "10px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillText(label, x, y + h + 2);
        ctx.restore();
    },
});
writeFileSync(join(outDir, "contact-sheet.png"), sheet.toBuffer("image/png"));

let count = rendered.reduce((n, g) => n + g.items.length, 0);
console.log(`wrote ${count} samples + contact-sheet.png to ${outDir}`);
