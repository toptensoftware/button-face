// Browser demo page (npm run samples:browser): renders every sample from
// scripts/sample-defs.js with `browserBackend` into a <canvas>, beside the
// Node render (scratch/samples/<group>/<file>.png) when it exists, for
// eyeballing browser-vs-Node differences. Served from the repo root by
// scripts/serve-demo.js. Visual output can't be verified automatically.
//
// When finished, `document.body.dataset.done` is "true" and
// `dataset.errors` holds the number of samples that failed to render.

import { render, browserBackend, createSvgResolver } from "../../src/index.js";
import { groups, sampleSize, sampleFileName, renderSample, toRgba } from "../sample-defs.js";

const options = { backend: browserBackend, resolveSvg: createSvgResolver() };

/** Create an element with a class and optional text. */
function el(tag, className, text)
{
    let e = document.createElement(tag);
    if (className)
        e.className = className;
    if (text !== undefined)
        e.textContent = text;
    return e;
}

/** Render one sample into a new cell element; returns [cell, ok]. */
async function renderCell(group, index, sample)
{
    let cell = el("div", "cell");
    let [w, h] = sampleSize(sample);
    let pair = el("div", "pair");
    cell.append(pair, el("div", "label", sample.label));
    cell.title = sample.label;

    // Node render, if `npm run samples` has written it (hidden otherwise).
    let napi = el("img");
    napi.width = w;
    napi.height = h;
    napi.alt = "";
    napi.title = `${sample.label} (Node)`;
    napi.addEventListener("error", () => napi.remove());
    napi.src = `../../scratch/samples/${group.name}/${sampleFileName(index, sample)}`;

    try
    {
        let result = await renderSample(render, sample, options);
        let canvas = el("canvas");
        canvas.width = result.width;
        canvas.height = result.height;
        canvas.title = `${sample.label} (browser)`;
        canvas.getContext("2d").putImageData(new ImageData(toRgba(result), result.width, result.height), 0, 0);
        pair.append(canvas, napi);
        return [cell, true];
    }
    catch (err)
    {
        console.error(`${group.name} / ${sample.label}:`, err);
        pair.append(napi);
        cell.append(el("div", "error", String(err?.message ?? err)));
        return [cell, false];
    }
}

async function main()
{
    let status = document.getElementById("status");
    let container = document.getElementById("groups");
    let start = performance.now();
    let count = 0, errors = 0;
    try
    {
        for (let group of groups)
        {
            container.append(el("h2", "", group.name));
            let row = el("div", "group");
            container.append(row);
            for (let [i, sample] of group.samples.entries())
            {
                let [cell, ok] = await renderCell(group, i, sample);
                row.append(cell);
                count++;
                errors += ok ? 0 : 1;
            }
        }
        let ms = Math.round(performance.now() - start);
        status.textContent = `Rendered ${count} samples in ${ms} ms` + (errors ? ` - ${errors} failed (see cells / console)` : "");
    }
    catch (err)
    {
        errors++;
        status.textContent = `Demo failed: ${err?.message ?? err}`;
        console.error(err);
    }
    status.classList.toggle("error", errors > 0);
    document.body.dataset.errors = String(errors);
    document.body.dataset.done = "true";
}

main();
