// Render a set of sample buttons for human visual review (not verifiable by
// tests - see test/samples.test.js, which only checks this runs).
//
// Usage: node scripts/render-samples.js [outDir]     (npm run samples)
// Default outDir: scratch/samples. Writes <outDir>/<group>/<sample>.png for
// every sample, plus <outDir>/contact-sheet.png combining them all (labelled;
// RGBA samples drawn over a checkerboard so transparency is visible).

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, icons, napiBackend } from "../src/node.js";

const outDir = process.argv[2] ?? fileURLToPath(new URL("../scratch/samples/", import.meta.url));

// ---- sample definitions ----------------------------------------------------

const fill = color => ({ type: "fill", color });
const icon = (src, more) => ({ type: "svg", src, ...more });
const text = (value, more) => ({ type: "text", text: value, ...more });

// An old-style user SVG: grey (#848484) body plus a fixed red dot.
const userSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect x="3" y="5" width="18" height="14" rx="3" fill="#848484"/>
  <circle cx="18" cy="6" r="4" style="fill:red"/>
</svg>`;

// A user SVG with a `$(x)` text placeholder (old svgText).
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="11" fill="#848484"/>
  <text x="12" y="16.5" font-family="sans-serif" font-weight="bold" font-size="12" text-anchor="middle" fill="white">$(x)</text>
</svg>`;

// The old project's typical button: icon nudged up, label at the bottom.
const labelled = (src, label, color = "white", back = "black") => [
    fill(back),
    icon(src, { color, translate: { y: -7 } }),
    text(label, { valign: "bottom" }),
];

const example = [
    fill("black"),
    icon("#heart", { color: "red", translate: { x: 0, y: -7 } }),
    text("Hello!", { color: "white", valign: "bottom" }),
];

const iconNames = Object.keys(icons);
const wrapText = "Wrap this label";

/** @type {{ name: string, samples: { label: string, layers: object[], size?: number|[number, number], channels?: 3|4, virtualSize?: object }[] }[]} */
const groups = [
    {
        name: "icons-default",
        samples: iconNames.map(n => ({ label: n, layers: [fill("black"), icon(`#${n}`)] })),
    },
    {
        name: "icons-color",
        samples: iconNames.map(n => ({ label: n, layers: [fill("white"), icon(`#${n}`, { color: "#1565c0" })] })),
    },
    {
        name: "icon-categories",
        samples: [
            ["material (fill attr)", "#settings"],
            ["material (outline)", "#heart"],
            ["inkscape (style fill)", "#volume-up"],
            ["stroke->path", "#home"],
            ["stroke->path", "#guide"],
            ["fixed: hdd", "#hdd"],
            ["fixed: steam", "#steam"],
            ["fixed: playstation", "#playstation"],
            ["fixed: apple-tv", "#apple-tv"],
        ].map(([label, src]) => ({ label, size: 144, layers: [fill("#202020"), icon(src, { color: "gold" })] })),
    },
    {
        name: "recolour",
        samples: [
            { label: "color red", layers: [fill("black"), icon("#heart", { color: "red" })] },
            { label: "color rgb()", layers: [fill("black"), icon("#home", { color: "rgb(0 200 255)" })] },
            { label: "color hsl()", layers: [fill("black"), icon("#check", { color: "hsl(120 100% 40%)" })] },
            { label: "color white", layers: [fill("#1565c0"), icon("#power", { color: "white" })] },
            { label: "user svg as-is", layers: [fill("black"), { type: "svg", svg: userSvg }] },
            { label: "colors grey->lime", layers: [fill("black"), { type: "svg", svg: userSvg, colors: { "#848484": "lime" } }] },
            { label: "colors 2 swaps", layers: [fill("black"), { type: "svg", svg: userSvg, colors: { "#848484": "white", red: "blue" } }] },
            { label: "colors rgb() key", layers: [fill("black"), { type: "svg", svg: userSvg, colors: { "rgb(132,132,132)": "orange" } }] },
            { label: "tint steam white", layers: [fill("black"), icon("#steam", { tint: "white" })] },
            { label: "tint hdd yellow", layers: [fill("black"), icon("#hdd", { tint: "yellow" })] },
            { label: "tint ps cyan", layers: [fill("black"), icon("#playstation", { tint: "cyan" })] },
            { label: "tint 50% alpha", layers: [fill("black"), { type: "svg", svg: userSvg, tint: "rgba(255,255,255,0.5)" }] },
            { label: "opacity 0.4", layers: [fill("black"), icon("#star", { color: "gold", opacity: 0.4 })] },
            { label: "color+text $(x)", layers: [fill("black"), { type: "svg", svg: badgeSvg, color: "red", colors: { "#848484": "#c62828" }, text: "42" }] },
        ],
    },
    {
        name: "text-align",
        samples: ["top", "center", "bottom"].flatMap(valign => ["left", "center", "right"].map(align => (
            { label: `${valign} ${align}`, layers: [fill("#263238"), text(wrapText, { align, valign, font: "bold 12px sans-serif" })] }))),
    },
    {
        name: "text-misc",
        samples: [
            { label: "single line", layers: [fill("black"), text("OK")] },
            { label: "\\n break", layers: [fill("black"), text("Line 1\nLine 2")] },
            { label: "long word", layers: [fill("black"), text("Supercalifragilistic")] },
            { label: "4 lines wrap", layers: [fill("black"), text("The quick brown fox jumps over")] },
            { label: "lineSpacing 1.5", layers: [fill("black"), text("Two\nLines", { lineSpacing: 1.5 })] },
            { label: "padding [12,2]", layers: [fill("black"), text(wrapText, { padding: [12, 2], valign: "top" })] },
            { label: "translate 8,8", layers: [fill("black"), text("Moved", { translate: { x: 8, y: 8 } })] },
            { label: "12px serif", layers: [fill("black"), text("Serif text here", { font: "12px serif" })] },
            { label: "bold 28px", layers: [fill("black"), text("BIG", { font: "bold 28px sans-serif", color: "yellow" })] },
            { label: "italic 14px", layers: [fill("white"), text("Italic dark", { font: "italic 14px sans-serif", color: "#333" })] },
            { label: "text 144", size: 144, layers: [fill("black"), text(wrapText)] },
            { label: "text 144 top-left", size: 144, layers: [fill("black"), text(wrapText, { align: "left", valign: "top" })] },
        ],
    },
    {
        name: "combos",
        samples: [
            { label: "old test.js", layers: labelled("#apple-tv", "Hello!", "#404040") },
            { label: "mute", layers: labelled("#volume-mute", "Mute", "red") },
            { label: "play", layers: labelled("#play", "Play", "lime") },
            { label: "settings", layers: labelled("#settings", "Setup") },
            { label: "blue back", layers: labelled("#home", "Home", "white", "#0d47a1") },
            { label: "text on top", layers: [fill("black"), icon("#refresh", { translate: { y: 7 } }), text("Reload", { valign: "top" })] },
            { label: "small icon", layers: [fill("black"), icon("#star", { color: "gold", scale: 0.5, translate: { y: -10 } }), text("Favourite", { valign: "bottom" })] },
            { label: "stacked svgs", layers: [fill("black"), icon("#circle", { color: "lime" }), icon("#check", { color: "lime", scale: 0.5 })] },
            { label: "hdd + text", layers: labelled("#hdd", "Disk") },
            { label: "mute 144", size: 144, layers: labelled("#volume-mute", "Mute", "red") },
            { label: "old test.js 144", size: 144, layers: labelled("#apple-tv", "Hello!", "#404040") },
        ],
    },
    {
        name: "sizes",
        samples: [
            ...[72, 96, 144].map(size => ({ label: `example ${size} rgb`, size, layers: example })),
            ...[72, 144].map(size => ({ label: `example ${size} rgba`, size, channels: 4, layers: example.slice(1) })),
            { label: "icon only rgba", channels: 4, layers: [icon("#heart", { color: "red" })] },
            { label: "half-alpha rgba", channels: 4, layers: [fill("rgba(0,128,255,0.5)"), text("50%")] },
            { label: "144x72 wide", size: [144, 72], virtualSize: { width: 144, height: 72 }, layers: labelled("#next-track", "Next track") },
        ],
    },
];

// ---- render, write, contact sheet ------------------------------------------

/** Raw render result -> napi canvas (RGB expanded to RGBA). */
function toCanvas({ data, width, height, channels })
{
    let canvas = napiBackend.createCanvas(width, height);
    let ctx = canvas.getContext("2d");
    let image = ctx.createImageData(width, height);
    for (let i = 0, j = 0; i < width * height * 4; i += 4, j += channels)
    {
        image.data[i] = data[j];
        image.data[i + 1] = data[j + 1];
        image.data[i + 2] = data[j + 2];
        image.data[i + 3] = channels == 4 ? data[j + 3] : 255;
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let rendered = [];
for (let group of groups)
{
    // Start each group folder fresh (stale samples from renamed labels go).
    rmSync(join(outDir, group.name), { recursive: true, force: true });
    mkdirSync(join(outDir, group.name), { recursive: true });
    let items = [];
    for (let [i, sample] of group.samples.entries())
    {
        let [w, h] = Array.isArray(sample.size) ? sample.size : [sample.size ?? 72, sample.size ?? 72];
        let channels = sample.channels ?? 3;
        let result = await render({ virtualSize: sample.virtualSize, layers: sample.layers }, w, h, { channels });
        let canvas = toCanvas(result);
        let file = `${String(i + 1).padStart(2, "0")}-${slug(sample.label)}${channels == 4 ? "-rgba" : ""}.png`;
        writeFileSync(join(outDir, group.name, file), canvas.toBuffer("image/png"));
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
