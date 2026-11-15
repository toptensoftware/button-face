// The sample-render script for human review. Its output is
// checked by eye (scratch/samples/contact-sheet.png); this only proves the
// script runs and writes PNGs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pkg } from "./helpers.js";

const script = fileURLToPath(new URL("../scripts/render-samples.js", import.meta.url));
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isPng = file => PNG_SIGNATURE.every((b, i) => readFileSync(file)[i] == b);

test("package.json has an npm 'samples' script", () =>
{
    assert.equal(pkg.scripts.samples, "node scripts/render-samples.js");
});

test("render-samples writes sample PNGs and a contact sheet to the given directory", () =>
{
    let dir = mkdtempSync(join(tmpdir(), "button-face-samples-"));
    try
    {
        execFileSync(process.execPath, [script, dir], { stdio: "pipe" });
        let files = readdirSync(dir, { recursive: true }).map(f => join(dir, f)).filter(f => f.endsWith(".png"));
        assert.ok(files.length > 100, `only ${files.length} PNGs written`);
        assert.ok(files.includes(join(dir, "contact-sheet.png")), "no contact-sheet.png");
        for (let file of files)
            assert.ok(isPng(file), `${file} is not a PNG`);
    }
    finally
    {
        rmSync(dir, { recursive: true, force: true });
    }
});
