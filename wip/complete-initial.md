# Initial Port

Status: Complete

## Description

This project is a rework of the existing project `node-buttonImage` (available
at ../node-buttonImage). The use case for that project has changed and this
project is a break away that looks at it from a fresh perspective.

This job should setup the initial project, move the core rendering from the old
project and make these core changes:

* Ignore the caching capabilities of the original project and just keep the core
  rendering ideas.

* A better approach for color replacement in SVG files. The old project requires
  a special hard-coded color constant used in the source SVG. At minimum this
  project should allow color A -> color B replacement(s) but also look into
  more robust re-coloring options (css etc...)

* A layered approach to composition. Rather than one fixed set of properties,
  each button definition should be a series of typed layers such as solid color
  fill, svg, text,

* Target node latest version, but bear in mind this project eventually also needs
  to run in the browser (eg: don't pass `sharp` specific types without consideration)

Specifically it should keep:

* All existing rendering capabilities including color replacement, scaling, text

* Maintain the support for device resolution independence using the same
  virtual pixel size concepts.

* The built-in icons.

Further this job should:

* Setup initial git repository and push to github (`gh` should be logged in here)

* Setup other project aspects such as version (v0.0.1) and copyright (Copyright © 2026 Topten Software)

* Setup unit tests - at a minimum for basic confidence test the project works

* Not setup readme or documentation yet (we'll do this separately)

## Notes

### Related wip jobs (design should not block them)
- `wip/wip-definition-update.md` - later job: convert old node-buttonImage
  definitions to the new layered definitions. Keep the old->new property mapping
  (below) straightforward.
- `wip/wip-material-icons.md` - later job: reference Google Material icons by
  name (with a prefix like the `#` used for built-ins), download + cache the
  .svg (fs cache in Node, localStorage in browser); the resolver normalises
  icons to `fill="currentColor"` and the layer `color` colours them. Implies:
  icon references should go through a pluggable, **async** resolver keyed by
  prefix, and recolouring must work on arbitrary third-party SVGs.
  **Resolver contract:** resolvers return SVG strings; monochrome icon sources
  normalise their foreground to `currentColor`.

### Old project: node-buttonImage (read-only reference)
- Repo `github.com/toptensoftware/node-buttonImage` (PUBLIC, default branch `main`),
  package `@toptensoftware/node-buttonImage` v1.1.3, **MIT** licence (LICENSE text
  says `Copyright (c) [2026] [Topten Software]` - template brackets left in),
  author "Topten Software". ESM (`"type": "module"`), plain JS (no TS, no build).
- Deps: `sharp ^0.34.5` (SVG rasterise via librsvg + compositing + raw output),
  `canvas ^3.2.1` (node-canvas/Cairo+Pango; text only). Latest on npm today:
  sharp 0.35.5, canvas 3.2.3, @napi-rs/canvas 1.1.1, @resvg/resvg-js 2.6.2,
  vitest 5.1.0.
- Files:
  - `index.js` - re-exports `drawText.js`, `drawButton.js`, `ButtonImage.js`.
  - `drawButton.js` - `drawButton(width, height, options) -> Promise<Buffer>` raw
    pixels. **The core renderer.**
  - `drawText.js` - `drawText(text, w, h, opts)` renders text with node-canvas to
    a full-size transparent RGBA buffer.
  - `wrapLines.js` - pure word-wrap `wrapLines(text, measure, maxWidth)`; has
    tests in `wrapLines.test.js` (node:test + node:assert/strict). Port as-is
    with its tests - it is already renderer-agnostic.
  - `utils.js` - `scaleFont(fontStr, scale)` (scales first `NNpx` in a CSS font
    string; throws if no px size), `getSvgSize()` (**unused** - dead code).
  - `ButtonImage.js` - `ButtonImage` class: private fields + getters/setters for
    every property, `onInvalidate` callback, render cache (one per state, keyed on
    size/channels), `states` (named partial property sets merged over base via
    `state` property), `svgFile` loading via `fs.readFileSync`. Also stub,
    unfinished `StreamDeckDevice` and `Button` classes (dead code).
  - `test.js` - manual script rendering to `test.png` (not a test).
  - `images/*.svg` - built-in icons.
  - `readme.md` - documents the properties (source of truth for semantics below).
- Test script: `node --test wrapLines.test.js`. Only wrapLines is tested.

### Old rendering pipeline (drawButton.js) - exact semantics
Inputs: device `width`, `height` (px), options. Output: raw `Buffer`, RGB
(channels 3, default) or RGBA (channels 4); anything else throws.

1. **Virtual pixels**: `virtualSize` default `{width:72, height:72}`.
   `scaleX = width / virtualSize.width`, `scaleY = height / virtualSize.height`.
   All size-based props (svgTranslate, textTranslate, textPadding, font px size)
   are in virtual px and multiplied by the scale for their axis. Font size is
   scaled by **scaleY only** (`scaleFont(font, scaleY)`). Padding: top/bottom by
   scaleY, left/right by scaleX. Translate x by scaleX, y by scaleY.
2. **Background**: `sharp({create:{width,height,channels:4,background: backColor ?? "black"}})`.
   Any CSS colour; `"transparent"` gives transparent background with channels 4.
3. **SVG** (if `svgCode`):
   - `svgText`: replace every `$(x)` in the SVG source with the string (no
     built-in icon uses this; it's for user SVGs with text placeholders).
   - `svgForeColor`: literal, case-sensitive string replace of every `#848484`
     with the colour. No normalisation (`#888`, `rgb()`, uppercase won't match).
   - **Scaling is independent of virtualSize**: SVG natural size comes from
     `sharp(svg).metadata()` (at 72 dpi; from width/height attrs or viewBox).
     Render density = `72 * svgScale * height / svgMeta.height`, i.e. the
     rendered SVG **height = device height x svgScale** (default 1), width keeps
     the SVG's aspect ratio.
   - Position: centred on the button, plus `svgTranslate` (virtual px):
     `left = round((width - svgW)/2 + tx*scaleX)`, `top = round((height - svgH)/2 + ty*scaleY)`.
   - Oversized/offset SVG is cropped to the button (sharp can't composite larger
     than base).
4. **Text** (if `text` non-empty) via `drawText` on a device-size canvas:
   - Defaults: font `"bold 16px sans-serif"`, colour white, padding 3,
     align `center`, valign `center`, lineSpacing 1.
   - `textPadding`: number | `[topBottom, leftRight]` | `[top, right, bottom, left]`.
   - Available width = width - (left+right padding). Lines from
     `wrapLines(text, s => ctx.measureText(s).width, hSpace)` (`\n` / `\r\n`
     always break; wrap on spaces; over-wide word gets own line, not clipped).
   - Line height = `measureText("Xy").actualBoundingBoxAscent + actualBoundingBoxDescent`,
     then x1.1 if < 40px else x1.2 (note: the `< 20 -> x1.0` branch is a no-op
     because the next `if` isn't `else if`, so small text also gets x1.1),
     then x `textLineSpacing`.
   - `textBaseline = "top"`; block height = lines x lineHeight.
     valign top: y = padTop; center: padTop + (vSpace - total)/2;
     bottom: height - total - padBottom.
   - x: left = padLeft; center = padLeft + hSpace/2; right = width - padRight;
     `ctx.textAlign` set to match. Plus translate. Each line drawn at y + i*lineHeight.
   - Gotcha: node-canvas `toBuffer("raw")` is BGRA (and premultiplied); old code
     swaps R/B but ignores premultiplication (slight edge darkening). Using
     `getImageData()` avoids both issues.
5. **Composite**: background, then SVG, then text (source-over). Remove alpha if
   channels 3. Return `raw().toBuffer()`.

### Built-in icons
- 42 SVGs (originally noted as 45 - a miscount) in `node-buttonImage/images/` (~64 KB total): add, apple-tv, apps,
  arrow-down, arrow-left, arrow-right, arrow-up, cancel-circle, cancel, check,
  circle, cross, delete, diamond, forward, function, guide, hdd, heart, home,
  info, list, next-track, ok, option, pause, play-pause, play, playstation,
  power, previous-track, refresh, rewind, settings, square, star, steam, stop,
  triangle, volume-down, volume-mute, volume-up.
- Referenced as `svgFile: "#name"` -> `fs.readFileSync(<pkg>/images/name.svg)`.
- Two families:
  - Material-icon derived: `height="24px" width="24px" viewBox="-144 -1104 1248 1248" fill="#848484"`
    (viewBox enlarged from 960 to 1248 to shrink the glyph to ~77% with padding).
  - Inkscape-drawn: `width="72" height="72" viewBox="0 0 19.05 19.05"`, colour
    via `style="fill:#848484"` / `stroke:#848484` in style attributes, plus
    inkscape/sodipodi namespaces and `<sodipodi:namedview>` cruft (contains
    `#ffffff`, `#000000`, `#d1d1d1`, `#0099e5` - editor metadata, not rendered).
- **All 42 contain `#848484`** as the recolour key (fill attrs, style fill;
  style stroke only before the step 3 stroke-to-path conversion).
- Fixed-colour exceptions (must NOT be recoloured by a "tint everything" approach):
  `hdd.svg` (red `#ff0000` circle + `<text>` "HDD" in **Impact** font - font
  availability differs per platform/browser), `apple-tv.svg` (3 radialGradients,
  stop colours in `style="stop-color:..."`), `steam.svg` (linearGradient with
  `stop-color` attributes, `xlink:href` gradient reference, `fill="url(#A)"`).
- Old default when `svgForeColor` unset: icons render grey `#848484`.

### Caching / non-core things to drop
- `ButtonImage` render cache, invalidation (`onInvalidate`), getter/setter class,
  stub `StreamDeckDevice`/`Button` classes, `test.js`/`test.png`, unused
  `getSvgSize`, `.vscode/launch.json`.
- `states` + `state` + `resolvedState` (variant property sets merged over base)
  live in `ButtonImage`, not the renderer - see Flagged assumptions.

### Node-only / sharp-specific parts that block browser use
- `fs`, `path`, `url.fileURLToPath`, `__dirname` (icon/file loading).
- `sharp` (native libvips) for SVG raster, background, compositing, raw output.
- `canvas` (node-canvas, native Cairo) for text; `canvas.toBuffer("raw")`.
- `Buffer` return type (Node-only; `Uint8Array`/`Uint8ClampedArray` are portable,
  and Node `Buffer` is a `Uint8Array` subclass so Node callers lose nothing).

### Research: SVG recolouring
| Approach | How | librsvg (sharp) | Browser | Skia (@napi-rs/canvas) | Notes |
|---|---|---|---|---|---|
| A. Colour map A->B (text rewrite) | Find colour values in paint contexts, normalise, replace matches | yes | yes | yes | Renderer independent; works on any 3rd-party SVG. Needs a colour parser. |
| B. `currentColor` | Author SVG with `fill="currentColor"`; set `color="X"` on root `<svg>` | yes | yes | yes (believed; verify) | Clean convention for our own icons; useless for arbitrary SVGs. |
| C. CSS injection | Insert `<style>` e.g. `[fill="#848484"]{fill:X}` or `*{fill:X!important}` | yes (selectors, !important) | yes | weak/no `<style>` support (verify) | Attribute selectors miss `style="fill:..."` and non-canonical spellings. |
| D. CSS variables | `fill: var(--fg, #848484)` | not supported/unreliable | yes | no | Not portable. Avoid. |
| E. Whole-icon tint | Rasterise, then fill colour with `source-in` composite (alpha mask) | n/a (canvas op) | yes | yes | Needs no SVG authoring; destroys multi-colour (hdd, apple-tv, steam). Opt-in. |

Colour map (A) implementation details:
- Normalise both sides to RGBA: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
  (case-insensitive), `rgb()/rgba()` (comma and space syntax, % values),
  `hsl()/hsla()` (cheap to add), the 148 CSS named colours, `transparent`.
  Matching compares normalised RGB (+alpha); if source had alpha, decide whether
  alpha must match (suggest: match RGB+A exactly).
- Replace only in paint contexts, never inside `url(#id)` / `href="#id"` / ids:
  - attributes: `fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color`, `color`;
  - CSS declarations of the same properties inside `style="..."` attributes and
    `<style>` element text.
- Regex/tokeniser on the text keeps it dependency-free and identical in Node and
  browser (DOMParser is browser-only; `@xmldom/xmldom` would work in both if a
  real parser is ever needed).
- Replacement value can be any CSS colour; emit it as-is (or canonical
  `rgba()`/hex if writing into a context that needs it).
- Pure function (`string -> string`) => easily unit-tested without rendering.

Recommendation: SVG layer supports (A) `colors: { "<from>": "<to>", ... }` as the
primary mechanism, (B) `color` setting the root `color` attribute for
`currentColor` SVGs, and (E) optional `tint` for monochrome-ising any SVG.
Convert built-ins to `currentColor` (replacing `#848484` in paint contexts,
leaving gradients/red/text fixed) and default `color` to `#848484` so the
default look is unchanged; then old `svgForeColor` = new `color` for built-ins and
`colors: {"#848484": c}` for user SVGs. Skip C/D (renderer-dependent).

### Research: layered composition model
Plain JSON-serialisable definition; layers painted bottom-to-top (array order),
source-over, each at device size:
```json
{
  "virtualSize": { "width": 72, "height": 72 },
  "layers": [
    { "type": "fill", "color": "black" },
    { "type": "svg", "src": "#heart", "color": "red",
      "colors": { "#848484": "red" }, "tint": null,
      "scale": 1, "translate": { "x": 0, "y": -7 }, "text": null },
    { "type": "text", "text": "Hello!", "color": "white",
      "font": "bold 16px sans-serif", "align": "center", "valign": "bottom",
      "lineSpacing": 1, "padding": 3, "translate": { "x": 0, "y": 0 } }
  ]
}
```
- `fill`: whole button colour (old `backColor`). Possible later extras: `rect`
  (virtual px), `radius`.
- `svg`: `src` (built-in `#name`, later other prefixes/resolvers) **or** `svg`
  (inline code); `text` = old `svgText` (`$(x)` substitution); `scale` = old
  svgScale (height fraction of button); `translate` virtual px; recolour options.
- `text`: old text* props with the same defaults and semantics.
- Common optional: `opacity` (0..1), `visible`. `image` (raster data URL) layer is
  a cheap later addition via the same draw path - not required now.
- No layers / empty => transparent (RGBA) or black (RGB, old default behaviour of
  `backColor ?? "black"` - suggest keep: RGB output composites over black).
- Old -> new mapping: `backColor`->`fill`; `svgFile`/`svgCode`/`svgText`/
  `svgScale`/`svgTranslate`/`svgForeColor`->`svg`; `text*`/`font`->`text`.
- SVG resolution: async `resolveSvg(src)` hook; built-in `#name` resolver in core;
  file-path resolver only in the Node entry point; material resolver later.

### Research: browser portability / renderer architecture
Text is the crux: wrapping needs `measureText`, and the measurer must match the
renderer or wrapped lines overflow/misalign.
- Option 1 - Compose to SVG string, rasterise with a pluggable backend
  (sharp/resvg in Node, `<img>`+canvas in browser). Text becomes `<text>`
  elements positioned using a separate measurer (still needs canvas in Node), so
  measurement engine != rendering engine; font matching across librsvg/Pango vs
  canvas is unreliable; SVG-in-`<img>` can't load web fonts. Not recommended.
- Option 2 - **Canvas 2D as the abstraction** (recommended): core paints layers
  onto a `CanvasRenderingContext2D`-compatible context: `fillRect` (fill),
  `drawImage` of a decoded SVG image (svg; with `source-in` for tint), `fillText`
  + `measureText` (text - same engine measures and draws). Output via
  `getImageData` (RGBA, non-premultiplied) and a simple alpha strip for RGB.
  A small backend object supplies `createCanvas(w,h)` and
  `loadSvgImage(svgString, w, h) -> Promise<drawable>`:
  - Browser: `OffscreenCanvas`/`document.createElement("canvas")`;
    SVG via `Blob` + `createImageBitmap`/`Image`.
  - Node: `@napi-rs/canvas` (Skia, prebuilt binaries, no system deps, same engine
    family as Chrome so closest to browser output; loads SVG into `Image`) **or**
    keep node-canvas (Cairo/Pango; loads SVG via librsvg). Optionally the Node
    backend's `loadSvgImage` could rasterise with sharp (librsvg - best SVG
    fidelity, matches old output) and wrap the pixels as ImageData.
  - Natural SVG size: parse width/height/viewBox ourselves (old dead
    `getSvgSize` is a starting point; also handle units/missing attrs) so
    scaling math doesn't depend on sharp metadata.
  - Risk to verify early with a spike: Skia's SVG support for the built-ins
    (inkscape `style` attrs, gradients with `xlink:href`, `<text>` in hdd.svg,
    `currentColor`). If weak, use sharp for SVG raster in the Node backend.
- Option 3 - keep sharp + node-canvas (current), Node only; browser later as a
  separate implementation. Not recommended (two renderers to keep in sync).

### Research: tooling
- Node here: v24.14.0, npm 11.9.0. ESM (`"type": "module"`), `exports` map with
  a portable core entry and a Node entry (Node backend + file resolver).
- Plain JavaScript + JSDoc types (no build step; same as old project; runs
  directly in browser/bundlers). TypeScript not warranted yet; can add
  `checkJs`/`.d.ts` generation later.
- Tests: `node:test` + `node:assert/strict` (built in, zero deps, old project
  already uses it). `npm test` = `node --test`. vitest's browser mode is a
  future option for browser tests.
- Confidence tests: pure units (wrapLines, colour parsing/normalisation,
  colour-map replacement, scaleFont/virtual scaling, SVG size parsing, icon
  registry has 42 entries) + render smoke tests asserting pixels (fill layer ->
  all pixels colour X; recoloured built-in `#square`/`#circle` -> known pixel
  colour; text layer -> some non-background pixels; RGB vs RGBA buffer length;
  virtual-size scaling of translate). Avoid exact snapshot images (font
  differences between machines).
- Built-in icons in browser: no `fs`. Generate a JS module (e.g. `src/icons.js`,
  name -> SVG string map, ~64 KB, could be lazily imported) via a script in
  `scripts/`, keep the source `.svg` files in the repo (e.g. `icons/`). Optional
  later: strip Inkscape cruft (svgo).

### Repo setup
- Licence: MIT (same as old), text `Copyright © 2026 Topten Software`.
- package.json: `version: "0.0.1"`, `type: "module"`, `license: "MIT"`,
  `author: "Topten Software"`, repository `github.com/toptensoftware/button-face`.
- `.gitignore`: `node_modules/`, plus scratch/test output (e.g. `scratch/`, `*.png`
  outputs from manual runs), `.DS_Store`, `*.log`.
- `gh auth status`: logged in as `toptensoftware` (keyring), protocol **ssh**,
  scopes `repo` etc. Repo `toptensoftware/button-face` does not exist yet.
- Git global `init.defaultBranch` is unset; use `main` (`git init -b main`),
  matching node-buttonImage.
- Commit/push only when the user asks (CLAUDE.md), although this job's
  description asks for initial push - planned as step 2 (after scaffold), with
  the user's go-ahead at that step.
- Existing files to keep: `CLAUDE.md`, `wip/*`, `.claude/settings.local.json`
  (consider gitignoring `.claude/settings.local.json` - local settings).

### Implement step 1 (scaffold) - learnings
- Created `package.json`, `LICENSE`, `.gitignore`, `src/wrapLines.js`
  (verbatim port), `test/wrapLines.test.js` (only the import path changed to
  `../src/wrapLines.js`), `test/package.test.js` (name, version 0.0.1, type
  module, author, MIT + LICENSE copyright line, engines.node `>=24`).
- `npm install @napi-rs/canvas` -> **1.1.1** (`"^1.1.1"` in dependencies),
  pulled the prebuilt `@napi-rs/canvas-win32-x64-msvc`; 0 vulnerabilities, no
  install warnings, no `package-lock.json` issues (lockfile created).
- `npm test` (`node --test` with no args) auto-discovers `test/*.test.js` and
  skips `node_modules`. Result: 8 tests, 8 pass, 0 fail.
- `files` in package.json = `["src/", "LICENSE"]` (icons/ sources and
  scripts/ are not shipped; `src/icons.js` is generated into `src/`).
  `exports` map is deliberately not added yet (step 13).
- Tests read package.json/LICENSE via `new URL("../", import.meta.url)` -
  reuse that pattern for fixture loading in later tests.

### Implement step 3 (Skia icon spike) - learnings - BLOCKED, see 1-3-1 below
- Copied the old icons to `icons/` unchanged. **There are 42, not 45** (the
  name list in *Built-in icons* above has 42 entries too; "45" was a miscount).
  Later steps (7: "45 entries") should use 42 / the `icons/` directory count.
- Fixture `test/fixtures/material-home.svg` = Material Symbols Outlined
  `home` default 24px, downloaded as-is (one line, `viewBox="0 -960 960 960"`,
  no fill). The home path spans x 160..800, y **-840**..-120 in viewBox units.
- `test/helpers.js` created now (planned for step 8): `drawSvg(svg, w, h, bg?)`
  (spike helper that uses @napi-rs/canvas directly - replace with the backend in
  step 8), `pixelAt`, `pixels`, `findInkBounds`, `expectColorNear`. Note
  `node --test` default globs include `test/**/*.js`, so `helpers.js` is loaded
  as a (0-test) test file - harmless.
- `test/spike-icons.test.js`: all 42 icons decode + have ink; square/circle
  stroke colour ~#848484; `currentColor` + root `color`; root
  `fill="currentColor"` inherited by unpainted paths (inline + Material
  fixture -> all ink red); unfilled Material icon renders black; negative
  viewBox and padded `-144 -1104 1248 1248` viewBox ink bounds within 2px of
  the expected maths; steam gradient non-uniform; hdd keeps red.
- Skia **passes**: `currentColor`, inherited root `fill`, negative/padded
  viewBoxes, `xlink:href` gradient + `gradientUnits="userSpaceOnUse"` (steam),
  `<text>` with Impact (hdd; Impact is installed on Windows - other platforms
  will fall back), style `fill`/`stroke` colours. SVGs are rendered as vectors
  at the draw size (no blur when scaling a 24px SVG to 144px) -
  `loadImage(buffer)` + `drawImage(img, x, y, w, h)` is enough; no need to
  rewrite width/height or set `img.width` first.
- `#square`/`#circle` are **stroked outlines** (`fill:none`), so their centre
  pixel is transparent; the test samples the stroke instead.
- `apple-tv`'s three `fill="url(#SVGID_n_)"` attributes are overridden by
  `style="fill:#848484"` on the same elements, so the gradients are never used
  and the icon is uniform #848484 - in librsvg too. Test asserts that.
- Compared against librsvg using the old project's sharp (read-only, via
  `createRequire`): `scratch/sharp-compare.js` (per-icon diff),
  `scratch/sharp-side-by-side.js`, `scratch/svg-size-modes.js`,
  `scratch/stroke-experiments.js` (all gitignored). 33 icons match closely
  (mean diff < 1/255); the outliers are all explained by the problem below.
- **Problem found:** Skia (@napi-rs/canvas 1.1.1) **ignores a unitless
  `stroke-width` inside `style="..."`** (e.g. `style="stroke-width:0.698765"`)
  and falls back to 1 user unit. Works as an attribute (`stroke-width="4"`) or
  with a unit (`stroke-width:4px`). librsvg and browsers accept unitless.
  Impact: `guide` TV frame + antennae nearly invisible (1 unit in a 1248-unit
  viewBox); `check`, `circle`, `cross`, `diamond`, `home`, `square`,
  `triangle`, `star` strokes are visibly too thick (1 unit vs ~0.5-0.7 in a
  19.05 viewBox). Recorded as a `todo` test in `spike-icons.test.js`
  ("unitless stroke-width in style attribute is honoured").
- Contact sheet: `scratch/spike-icons.png` (`node scratch/spike-icons.js`),
  white and black backgrounds.

### 1-3-1: Skia ignores unitless `stroke-width` in `style` (RESOLVED - see Decisions after step 3)
**Problem:** 9 of 42 built-in icons render wrong in Skia because their
Inkscape `style="...stroke-width:N..."` values have no unit; `guide` is nearly
invisible, 8 stroked icons are too bold. Any third-party SVG written the same
way will also render wrong in Node (browsers are fine).

**Options:**
1. **Fix the built-ins at pack time only** - the step 7 generator also appends
   `px` to unitless `stroke-width` in style declarations. Smallest change;
   built-ins correct everywhere; third-party SVGs still wrong in Node.
2. **Normalise at render time (pure string fn, shared tokeniser)** - add e.g.
   `normalizeStyleLengths(svg)` to `recolor.js`, reusing the step 5 style/
   `<style>` declaration tokeniser, appending `px` to unitless length
   properties (`stroke-width`, `stroke-dashoffset`, `font-size`, ...); call it
   from the Node (napi) backend's `loadSvgImage` (harmless in browsers, could
   also run in core). Fixes built-ins and third-party SVGs; small, unit-testable.
3. **Fall back to sharp (librsvg) for SVG rasterisation in the Node backend** -
   best SVG fidelity and matches old output exactly, but re-adds a large
   native dependency the user chose to drop, and Node output then differs from
   the browser path.

**Recommendation:** Option 2 (also fixes the built-ins, keeps Skia, no new
deps). Would add to Plan step 5 (tokeniser + `normalizeStyleLengths` tests)
and step 8 (backend calls it; the `todo` test becomes a real test).

### Decisions (user, resolving the step 3 1-3-1)
- **Do option 2 anyway, as a fallback** for third-party SVGs:
  `normalizeStyleLengths(svg)` - pure string fn in `src/recolor.js` reusing
  the step 5 style tokeniser - called by the Node backend's `loadSvgImage`
  (folded into Plan steps 5 and 8).
- **Built-in icons must be filled paths only, no strokes.** The 9 stroked
  icons (check, circle, cross, diamond, guide, home, square, star, triangle)
  were converted with Inkscape (stroke to path) via the re-runnable
  `scripts/strokes-to-paths.js`. A test enforces "no stroke paint" on every
  icon (`test/icons.test.js`).
- Add a minimal `README.md` with an "SVG authoring notes" section advising
  against strokes (done in step 3).

### Implement step 3 (resolution) - learnings
- **Rule: built-in icons (`icons/*.svg`) must be filled paths only - no
  `stroke` paint** (attribute or style value other than `none`). Enforced by
  `test/icons.test.js` ("paints no strokes"). To fix an offending icon run
  `node scripts/strokes-to-paths.js icons/<name>.svg`.
- `scripts/strokes-to-paths.js`: runs Inkscape 1.4.4 (`inkscape.com` on
  Windows; override with env `INKSCAPE`) with
  `--actions=select-all:no-groups;object-stroke-to-path;export-type:svg;export-overwrite;export-do`
  on each file, in place. `no-groups` selects every leaf object including
  ones nested in groups. ~2-3 s per file.
- Inkscape output: the converted `<path>` has **no fill of its own** - it
  inherits `#848484` from its ancestor (`<g style="fill:#848484">` in the
  19.05-viewBox icons, root `fill="#848484"` in `guide`). So `#848484`
  survives exactly once per converted icon and recolouring the ancestor
  recolours the outline. width/height/viewBox unchanged; Inkscape also
  rewrites `sodipodi:docname` and drops the trailing newline (harmless).
  Unrelated leftover `stroke-width:...` declarations with `stroke:none`
  remain (harmless - nothing is stroked).
- `scripts/build-icon-reference.js` (borrows sharp + `images/` from
  `../node-buttonImage`, read-only; sharp is not a dependency) writes
  `test/fixtures/icon-reference.json`: per-icon librsvg render stats of the
  **original** icons at 72x72 (`inkStats` = coverage, ink bounds,
  coverage-weighted mean RGB; helper in `test/helpers.js`, shared by the
  script and tests). `test/icons.test.js` checks every icon's Skia render
  against it (coverage within max(10, 5%), bounds +/-1px, colour +/-4).
  Before the conversion exactly the 9 stroked icons failed it (e.g. guide
  coverage 188.6 vs 452.2; square 382.7 vs 270.9); after, all 42 pass.
  Also: every single-colour icon (39; not hdd/steam/playstation) recolours
  to red by swapping `#848484` (interim literal replace; step 5's
  `applyColorMap` can replace it).
- The old `todo` test became a characterisation test of the Skia quirk
  ("unitless stroke-width in style is ignored, px is honoured"). If it ever
  fails, Skia fixed the bug and `normalizeStyleLengths` could be dropped.
  Step 8's backend test asserts the patched behaviour.
- `#square`/`#circle` "outline is #848484" now samples the most opaque pixel
  on the middle row (outline is ~2.6px, matching librsvg; it used to be
  ~3.8px in Skia because of the bug).
- Visual check: `node scratch/sharp-compare.js` - all 42 icons now mean diff
  < 0.7/255 vs librsvg. `scratch/side-by-side.png` (96px; columns: Skia new,
  librsvg new, librsvg original) for the 9 converted icons - indistinguishable.
  `scratch/spike-icons.png` contact sheet regenerated - all icons look right.
  `scratch/icons-original/` holds a backup of the unconverted icons
  (gitignored; the originals are also in `../node-buttonImage/images/`).
- `npm test`: 189 tests, 189 pass, 0 todo.

### Implement step 4 (color.js) - learnings
- `src/color.js` exports `parseColor(css) -> {r,g,b,a}|null` (r/g/b ints
  0..255, a 0..1), `colorsEqual(a, b)` (each a CSS string or parsed colour;
  RGB exact, alpha compared at 8-bit precision `round(a*255)`; non-colours
  never match, even `none` vs `none`), `formatColor({r,g,b,a})` (`#rrggbb`
  when a is 1/missing, else `rgba(r, g, b, a)` with a to 3 decimals), and
  `namedColors` (frozen, 148 lower-case names -> `#rrggbb`; `transparent`
  handled separately). No imports at all.
- Parsing details: input trimmed + case-insensitive; `rgb`/`rgba` and
  `hsl`/`hsla` are aliases (either takes 3 or 4 values); comma syntax with
  optional 4th alpha, or space syntax with optional `/ alpha`; mixing comma
  and `/` is rejected; alpha may be number or %; out-of-range values clamp;
  hue units deg/grad/rad/turn, negative hues wrap; hsl s/l must be %.
  `Object.hasOwn` guards the name lookup (`toString`, `__proto__` -> null).
- Gotcha: `50 * 2.55` = 127.4999 in floating point; percentages use
  `v * 255 / 100` so 50% rounds to 128 like browsers/Skia.
- `test/color.test.js` (13 tests) cross-checks **every named colour** and a
  set of rgb/hsl strings against Skia by painting them as the canvas
  `fillStyle` (reusing `drawSvg`'s `background` arg on an empty 1x1 SVG) -
  so the name table is verified, not just spot-checked. When step 8 swaps
  `drawSvg` to the backend this keeps working (background still uses
  `fillStyle`).
- `npm test`: 202 tests, 202 pass.

### Implement step 5 (recolor.js) - learnings
- `src/recolor.js` exports `applyColorMap(svg, map)`, `findPaintValues(svg)`,
  `setRootAttribute(svg, name, value)`, `setRootColor(svg, color)` (one-line
  wrapper, kept for the step 11 pipeline), `substituteText(svg, text)`,
  `normalizeStyleLengths(svg)`. Only import: `./color.js`.
- **One tokeniser**: internal `rewriteValues(svg, visit)` - a markup regex
  scanner (skips comments, CDATA, `<!...>`/`<?...?>`; captures whole
  `<style>` elements, optionally prefixed e.g. `svg:style`; else start tags
  with quoted attributes) that calls `visit({name, value, declaration})` for
  every attribute value and every CSS declaration (`style="..."` and the
  innermost `{...}` blocks of `<style>`, so `@media` nesting works). Values
  are passed trimmed (surrounding whitespace and `!important` restored);
  returning undefined leaves the original text byte-for-byte. `applyColorMap`,
  `findPaintValues` and `normalizeStyleLengths` are thin visitors over it;
  `setRootAttribute` reuses its `MARKUP`/`ATTR` regexes to find the root tag.
- **Use `findPaintValues` for "does this SVG contain colour X in a paint
  context"** (step 7's "no `#848484` in a paint context" check). Paint names:
  `fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color`, `color`;
  attribute names matched case-sensitively, CSS property names lower-cased.
- `applyColorMap`: map is a plain object or `Map`; keys parsed with
  `parseColor` up front (a non-colour key such as `none`/`currentColor`
  throws `TypeError`); values compared with `colorsEqual`; first matching
  entry wins; replacements emitted as `String(to)` and not re-mapped (so
  swaps `{red: blue, blue: red}` work). Null/empty map -> input returned.
- `setRootAttribute`: root = first element start tag outside comments/PI/
  DOCTYPE; throws if its local name isn't `svg`. Replaces the first
  exact-name attribute keeping its quote style, else appends
  ` name="value"` just before `>`/`/>` (after the last attribute, so
  multi-line Inkscape tags keep their layout). Value is XML-escaped (`& <` and
  the quote char).
- `substituteText`: literal `replaceAll("$(x)", () => String(text))`.
- `normalizeStyleLengths`: declarations only (presentation attributes are
  fine in Skia), properties `stroke-width`, `stroke-dashoffset`,
  `stroke-dasharray`, `font-size`; appends `px` to each unitless number token
  separated by whitespace/commas (`2,1` -> `2px,1px`, `1e-1` -> `1e-1px`,
  `calc(...)`, units, `%`, keywords untouched). On built-ins it rewrites
  Inkscape's leftover `stroke-width:.489818` / `stroke-dashoffset:0`
  declarations (harmless, nothing is stroked).
- `src/color.js` now also exports `NUMBER` (CSS number regex source) so
  recolor.js doesn't redefine it.
- Real-icon tests (`test/recolor.test.js`): for all 42 icons an unmatched map
  is identity, and `#848484 -> currentColor` leaves no `#848484` paint and
  differs from the source only at those values (so step 7's generator is
  safe on every icon); home (group style fill, `stop-color:#000` untouched),
  add (root `fill` attr), steam (`url(#A)`, `xlink:href="#A"`, stop colours
  survive), hdd (red kept).
- `test/icons.test.js`: private `strokeValues` regex (and its test) replaced
  by `findPaintValues`; the interim literal `#848484` replace replaced by
  `applyColorMap`.
- `npm test`: 326 tests, 326 pass (202 - 1 removed + 125 new).

### Implement step 6 (scale.js, svgSize.js) - learnings
- `src/scale.js` exports `DEFAULT_VIRTUAL_SIZE` (frozen 72x72),
  `createScaler(virtualSize, width, height)` -> `{ sx, sy, x(v), y(v),
  translate(t), padding(p) }` and `scaleFont(font, scale)`. Imports only
  `NUMBER` from color.js.
  - `virtualSize` null/undefined -> 72x72; non-positive/missing dims throw
    `RangeError`. `translate(t)` -> `{x: t.x*sx, y: t.y*sy}`, missing parts
    0. `padding(p)`: number | `[tb, lr]` | `[t, r, b, l]` ->
    `{top,right,bottom,left}` (t/b by sy, l/r by sx); null/undefined -> all
    0 (**the text layer must supply its own default `3`**; the old code
    actually produced NaN padding when `textPadding` was unset, the readme's
    default 3 lived in drawText); other array lengths throw `TypeError`.
    Nothing is rounded - the svg layer rounds its final `left`/`top` like the
    old code (`Math.round((w - svgW)/2 + t.x)`).
  - `scaleFont` scales the first `<number>px` not preceded by a word char or
    `.` (so `.5px` -> whole number, `Foo2px` family names don't match), keeps
    the rest of the string (e.g. `16px/20px` -> `32px/20px`); throws without
    a px size (message contains "px").
- `src/svgSize.js` exports `parseLength`, `parseViewBox`, `getSvgSize`,
  `padViewBox`. Imports `NUMBER` (color.js) and `getRootAttribute`/
  `setRootAttribute` (recolor.js) - no second root-tag parser.
  - `getSvgSize`: width/height attrs (unitless/px = user units; pt/pc/in/
    cm/mm at 96 px/in; `%`, em/ex, 0, negative = unusable); one usable ->
    other from viewBox aspect; none -> viewBox width/height (origin
    irrelevant, so `0 -960 960 960` + `width="24"` -> 24x24); else 300/150
    per missing dimension. Throws if the root isn't `<svg>`.
  - Matches the old behaviour where it matters: the old renderer set the
    rendered height to `device height x svgScale` and used the natural size
    only for the **aspect ratio** (density = 72*scale*h/meta.height), so the
    absolute unit conversion (96 vs sharp's 72 dpi) has no effect on output.
    Both icon families: 24x24 (Material-derived) and 72x72 (Inkscape).
  - `padViewBox(svg, fraction)` pads the root viewBox by `fraction` of its
    width/height per side, keeping width/height (content shrinks). Material
    fixture + 0.15 -> exactly `-144 -1104 1248 1248` (built-in padding).
    Numbers tidied via `toPrecision(12)` (no `143.99999999999997`). No
    viewBox -> one is created from `getSvgSize` first. 0/missing -> input
    returned; `<= -0.5` throws `RangeError`. Ready for the material job.
- `src/recolor.js`: extracted internal `findRootTag(svg)` (shared by
  `setRootAttribute` and the new exported **`getRootAttribute(svg, name)`**
  -> value with XML entities decoded, or undefined). The root error message
  is now `document has no root <svg> element` (no function prefix).
- Tests: `test/scale.test.js` (14), `test/svgSize.test.js` (22),
  `getRootAttribute` tests added to `test/recolor.test.js` (4).
  `npm test`: 366 tests, 366 pass.

### Implement step 7 (icons module) - learnings
- `scripts/build-icons.js` exports `generateIconsModule()` (string) and
  writes `src/icons.js` only when run as main (`npm run build:icons`, added
  to package.json; main check = `import.meta.url == pathToFileURL(argv[1])`,
  not `import.meta.main`, which needs Node >= 24.2). `src/icons.js` (70,704
  bytes, LF, no imports) = header comment + `export const icons =
  Object.freeze({ "<name>": "<svg>", ... })`, keys sorted, values via
  `JSON.stringify`. Named export only (no default).
- **Gotcha - element-level `color` beats the root `color`.** 13 icons
  (arrow-*, check, circle, cross, diamond, home, ok, square, star, triangle)
  have Inkscape `style="color:#000000;...fill:#848484"` on their paths. With
  `fill:currentColor` that element's own `color` wins over the root's, so the
  icon rendered black. Inert in the sources (none use `currentColor`), so the
  generator also rewrites **every `color` paint value to `inherit`** (Skia
  honours it) and throws if a source already uses `currentColor` (then
  `color` values would matter). Same caveat applies to third-party SVGs
  coloured via the svg layer's `color`: an element-level `color` blocks it
  (Material icons don't have one).
- `src/recolor.js` gained exported **`mapPaintValues(svg, fn)`** - the
  paint-only visitor over the shared tokeniser (`fn({name, value,
  declaration})` returns a replacement or undefined). `findPaintValues` and
  `applyColorMap` are now built on it (DRY). 2 tests in `recolor.test.js`.
- 5 icons (arrow-down/left/right/up, play-pause) are **CRLF in this working
  tree** although git stores LF (`git ls-files --eol`: `i/lf w/crlf`; a
  checkout from before `.gitattributes`). Harmless: the generator normalises
  CRLF -> LF, and `test/icons.test.js`'s `readIcon` does too. A fresh clone /
  `git checkout -- icons/` would fix the working tree (not done).
- `test/icons.test.js` now: sources (no strokes, reference coverage);
  module (up to date vs `generateIconsModule()`, GENERATED header/no
  imports/no CR, 42 sorted frozen keys == `icons/*.svg`); per icon: no
  `#848484` paint + has `currentColor`, and paint values equal the source's
  with `#848484`->`currentColor` / `color`->`inherit`, rest byte-identical
  (paints blanked with `mapPaintValues` on both sides); fixed colours (hdd
  `#ff0000`, steam/apple-tv stop colours + steam `url(#A)`, playstation's 4
  logo colours); ok.svg `color` neutralised. The librsvg-reference and
  recolour render tests now run on **`src/icons.js` entries with root
  `color`** (`setRootColor(icon, "#848484")` / `"#ff0000"`) instead of the
  raw sources, proving the generated module renders like the originals.
- `npm test`: 457 tests, 457 pass (366 + 2 recolor + 89 icons).

### Implement step 8 (backend) - learnings
- `src/backend.js`: JSDoc typedefs only (`export {}`): `Backend =
  { createCanvas(w, h) -> Canvas, loadSvgImage(svg, w, h) -> Promise<Drawable> }`;
  `Canvas` = `{ width, height, getContext("2d") }`; `Context2D` = standard
  `CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D`; `Drawable`
  is opaque (only ever passed back to `ctx.drawImage(img, x, y, w, h)` on the
  same backend's contexts). `w`/`h` on `loadSvgImage` = the device size the
  caller will draw it at, so a browser backend can rasterise at that size
  (e.g. `createImageBitmap(blob, { resizeWidth, resizeHeight })`); the napi
  backend ignores them (Skia draws SVG as vectors at the drawImage size).
- `src/backends/napi.js` exports a frozen **`napiBackend`** object (named
  export, no default). Only file in `src/` importing `@napi-rs/canvas` (grep
  `from "(node:|@napi-rs)` in `src/` confirms). `loadSvgImage` runs
  `normalizeStyleLengths` then `loadImage(Buffer.from(...))`; it throws
  `TypeError` for a non-string/blank source itself (Skia rejects garbage and
  truncated markup on its own).
- `test/helpers.js` `drawSvg(svg, w, h, background?, backend = napiBackend)`
  - now goes through a backend; the 5th arg lets a test pass a raw-Skia
  pseudo-backend. All render tests (icons librsvg-reference, colour
  cross-check, spike) now run through the backend and still pass.
- The Skia-quirk characterisation test moved from `spike-icons.test.js` to
  `test/backend.test.js`, drawing via a local `rawSkia` backend
  (`loadImage` with no patching), next to the test asserting the backend's
  patched behaviour (unitless `stroke-width:8` in style -> 8 wide).
- `test/backend.test.js`: 11 tests (contract shape, canvas size + transparent,
  RGBA non-premultiplied `getImageData`, 10x10 red SVG at 20x20 fills, offset
  drawImage, 3 invalid-SVG rejections, normalize applied, raw quirk, drawSvg
  background). `npm test`: 467 tests, 467 pass (457 - 1 moved + 11).

### Implement step 9 (resolve.js) - learnings
- `src/resolve.js` (imports only `./icons.js`) exports
  **`createSvgResolver({ prefixes, fallback } = {})`** -> `async
  resolveSvg(src) -> string` and **`resolveBuiltinIcon(name)`** (the `#`
  handler; throws `unknown built-in icon '#name'`, `Object.hasOwn` guard).
  JSDoc `SvgSourceResolver` callback typedef documents the resolver contract
  (returns SVG strings, errors by throwing/rejecting, monochrome sources
  normalise foreground to `currentColor`, may be async).
  - `#` is registered by default; `prefixes` (plain object **or `Map`**) adds
    or replaces handlers, `null` removes one (e.g. `{ "#": null }`).
    **Longest prefix wins** (`@@` beats `@`). Handler gets the remainder
    verbatim (`@home?fill=1` -> `home?fill=1`); `fallback` (no prefix
    matched) gets the whole `src`; neither -> rejects
    `no SVG resolver for '<src>'`.
  - Validation: non-string/empty `src` rejects `TypeError`; a handler result
    that isn't a string rejects `TypeError` (`did not return an SVG string`);
    non-function handlers/fallback or empty prefix throw at creation. Sync
    throws in handlers surface as rejections (function is `async`).
  - Material job plugs in as `createSvgResolver({ prefixes: { "@":
    createMaterialResolver(opts) } })` - handler signature `(rest) =>
    Promise<string>`; nothing else needed in resolve.js.
- `src/node/fileResolver.js` exports **`createFileResolver({ baseDir } =
  {})`** -> `async (path) => string` via `fs.promises.readFile(path.resolve(
  baseDir ?? "", path), "utf8")`, strips a leading UTF-8 BOM, otherwise
  unchanged; missing file rejects with the fs error (`ENOENT`). Step 13's Node
  entry should pass it as `fallback`.
- `test/resolve.test.js`: 23 tests (incl. a static check that
  `src/resolve.js` has no `node:`/fs/path/@napi-rs imports; fixture
  `test/fixtures/material-home.svg` used for the file resolver; BOM case via a
  temp dir). `npm test`: 490 tests, 490 pass.

### Implement step 10 (render core + fill layer) - learnings
- `src/render.js` exports **`render(definition, width, height, { backend,
  resolveSvg, channels = 3 })`** -> `Promise<{ data: Uint8Array, width,
  height, channels }>` and the frozen registry **`layerTypes`** `{ fill, svg,
  text }`. Imports only `./scale.js` and `./layers/*.js` (no backend import).
  JSDoc typedefs there: `Definition`, `Layer`, `RenderOptions`, `LayerEnv`,
  `Painter`, `LayerType`, `RenderResult`.
- **Layer type contract** (what steps 11/12 implement): a module in
  `src/layers/` exports a named function `(layer, env) => Painter |
  Promise<Painter>`; `env = { width, height, scaler, backend, resolveSvg }`
  (scaler = `createScaler(definition.virtualSize, w, h)`, built once by the
  core). It validates the layer and does all async work (resolve, decode,
  offscreen tint canvas via `env.backend`) up front, then returns a **sync**
  `Painter (ctx) => void`. The core owns `visible`/`opacity` (validated for
  every layer; hidden or opacity 0 -> the type function is not even called),
  `ctx.save()` / `globalAlpha = opacity` / `restore()` around each painter,
  layer order, and output. `src/layers/svg.js` / `text.js` are placeholder
  modules exporting `svgLayer` / `textLayer` that throw `"<type> layer: not
  implemented"` - **steps 11/12 just replace those files; `render.js` needs
  no change.** Painters must not depend on prior ctx state (fillStyle,
  composite op, ...) - set what they use.
- All layers are prepared concurrently (`Promise.all`), then painted in
  array order - so an error in any layer rejects before anything is drawn,
  and several svg layers resolve/decode in parallel.
- Validation (all reject, since `render` is async): width/height positive
  integers (`RangeError`), channels exactly 3 or 4 (`RangeError`), backend
  with `createCanvas` + `loadSvgImage` (`TypeError`), definition object,
  `layers` array (missing = empty), layer object with string `type`,
  unknown type -> `TypeError "render: unknown layer type 'x'"` (own-property
  lookup), `visible` boolean, `opacity` number 0..1 (`TypeError`), bad
  `virtualSize` -> scaler's `RangeError`. `resolveSvg` is optional (only svg
  layers using `src` need it - step 11 should throw a clear error if absent).
- Output: RGB composites over black **on the canvas** (`destination-over`
  black `fillRect` after all layers), then strips alpha; RGBA is a
  `Uint8Array` view over `getImageData().data` (non-premultiplied).
- `src/layers/fill.js` exports `fillLayer`: `{ type: "fill", color = "black"
  }`; colour validated with `parseColor` (invalid/`currentColor`/non-string
  -> `TypeError "fill layer: invalid color 'x'"`) and passed to the canvas as
  `formatColor(parsed)` so the canvas only ever sees `#rrggbb`/`rgba()`.
- Test helpers added to `test/helpers.js`: `expectAllPixels(result,
  expected, tol)` and `assertBrowserSafe(relPath)` (static "no node:/fs/
  path/@napi-rs import" check; `resolve.test.js` now uses it too).
- Tests: `test/render.test.js` (24), `test/layers-fill.test.js` (6).
  `npm test`: 520 tests, 520 pass.

### Implement step 11 (svg layer) - learnings
- `src/layers/svg.js` exports `svgLayer` (async): `{ type: "svg", src | svg
  (exactly one, non-empty string), text, colors, color = "#848484", tint,
  scale = 1, translate }`. Imports only `../color.js`, `../recolor.js`,
  `../svgSize.js` (browser-safe; the render test's browser-safe check
  covers it). `render.js` unchanged.
- Pipeline: `loadSource` (inline `svg`, or `await env.resolveSvg(src)`;
  missing resolver -> `TypeError "svg layer: 'src' ("#heart") needs
  options.resolveSvg"`) -> `substituteText` -> `applyColorMap` ->
  `setRootColor(formatColor(parseColor(color)))` -> `getSvgSize` (aspect
  only) -> `backend.loadSvgImage(svg, svgW, svgH)` -> optional tint ->
  painter `ctx.drawImage(image, left, top, svgW, svgH)`.
- **Rounding verified against the old sharp** (`scratch/sharp-svg-rounding.js`,
  borrows sharp from `../node-buttonImage`): sharp rounds each rendered
  dimension independently, half up (4.5x4.5 -> 5x5, 10.5x3.5 -> 11x4,
  9x4.5 -> 9x5). So `svgH = Math.round(h*scale)`, `svgW =
  Math.round(h*scale*natW/natH)` (from the unrounded height), then `left/top =
  Math.round((w - svgW)/2 + t.x)` exactly as the old code. A size that
  rounds to 0 returns a no-op painter (nothing loaded/drawn).
- Cropping needs no code: the canvas clips `drawImage` outside the button.
- Tint: offscreen `backend.createCanvas(svgW, svgH)`, draw image,
  `source-in` `fillRect(tint)`; the painter draws that canvas (napi's
  `drawImage` accepts a Canvas; browsers do too). Tint alpha multiplies
  (`rgba(0,0,255,.5)` -> alpha 128).
- `color`/`tint` validated with `parseColor` and passed as `formatColor`
  (like the fill layer); `colors` keys are validated by `applyColorMap`.
  `scale` must be a finite number > 0; `translate` null or `{x?, y?}` finite
  numbers (`TypeError`s naming the property).
- Tests: `test/layers-svg.test.js` (32). Superseded spike tests removed from
  `spike-icons.test.js` (square/circle colour, 2 currentColor/inherited-fill
  inline tests, material red, hdd red - all now exercised through the layer).
  `npm test`: 546 tests, 546 pass (520 + 32 - 6).

### Implement step 12 (text layer) - learnings
- `src/layers/text.js` exports `textLayer` (sync), plus pure helpers
  **`lineHeight(ctx, lineSpacing = 1)`** and **`layoutText(ctx, text, { width,
  height, padding: Box, align, valign, lineSpacing, translate })`** -> `{ x,
  lines: [{ text, y }] }` (all device px; the old drawText maths exactly,
  incl. the dead `< 20` branch -> small text x1.1). Both take any object with
  `measureText`, so they are tested exactly with a fake ctx.
- Layer: `{ type: "text", text, font = "bold 16px sans-serif", color =
  "white", align = "center", valign = "center", lineSpacing = 1, padding = 3,
  translate }`. Font scaled by `scaler.sy` only (`scaleFont`); padding/
  translate via `scaler.padding/translate`. Validation up front (TypeErrors
  prefixed `text layer:`; scaleFont/padding errors are re-thrown with that
  prefix). Empty/null text -> no-op painter.
- **Measuring happens inside the painter** on the render ctx (font set
  first), so wrap/measure and draw use the same engine; the painter sets
  `font`, `fillStyle`, `textAlign`, `textBaseline = "top"` itself.
- DRY: new `src/layers/validate.js` (`validColor(type, name, value)`,
  `validateTranslate(type, t)`) now shared by fill, svg and text layers
  (error messages unchanged).
- `src/scale.js` `normalizePadding` now also rejects non-finite values
  (`"3"`, `NaN`, `{}`) with the same `TypeError` (+1 test in scale.test.js).
- Pixel-test gotcha: with `textBaseline = "top"` Skia glyph ink does not
  start exactly at the em-box top and hinting makes that gap non-linear with
  size (padding 10 at 72px -> ink top 9 incl. ~-1 overshoot; 144px -> 22, not
  18). Tests therefore measure **ink shifts relative to a padding-0 render**
  (`inkShift` in layers-text.test.js), which are exact to +/-1px.
- Tests: `test/layers-text.test.js` (26). `npm test`: 573 tests, 573 pass.

### Implement step 13 (entry points) - learnings
- `package.json` `exports`: `"."` -> `./src/index.js`, `"./node"` ->
  `./src/node.js`. Package self-reference works in tests (`import ... from
  "@toptensoftware/button-face/node"`).
- `src/index.js` (core) re-exports by name (not `export *`, so internals like
  `NUMBER`, `layoutText`, `validate.js` stay private): `render`,
  `layerTypes`, `createSvgResolver`, `resolveBuiltinIcon`, `icons`,
  `parseColor`, `colorsEqual`, `formatColor`, `namedColors`, the recolor fns
  (`applyColorMap`, `mapPaintValues`, `findPaintValues`, `getRootAttribute`,
  `setRootAttribute`, `setRootColor`, `substituteText`,
  `normalizeStyleLengths`), svgSize fns (`getSvgSize`, `padViewBox`,
  `parseViewBox`, `parseLength`), `createScaler`, `scaleFont`,
  `DEFAULT_VIRTUAL_SIZE`, `wrapLines`.
- `src/node.js`: `export * from "./index.js"` plus `napiBackend`,
  `createFileResolver`, **`createNodeSvgResolver({ baseDir, prefixes })`**
  (built-ins + extra prefixes, file fallback), **`resolveSvg`** (the default
  instance) and a **`render(def, w, h, options?)`** that overrides the
  star-exported core `render` (a local export shadows `export *`). Defaults
  are applied with `??`, so `{ backend: undefined }` keeps the default. The
  material job should register `@` in `createNodeSvgResolver`'s defaults.
- `test/helpers.js` gained **`importGraph(relPath)`** -> `{ files, external }`
  (static `import`/`export ... from` and bare `import "x"`, relative
  specifiers followed). `api.test.js` asserts the core graph has no external
  specifiers at all and every file passes `assertBrowserSafe`; a companion
  test proves the walker does see `@napi-rs/canvas`/`node:fs/promises` from
  `src/node.js`. `render.test.js`'s browser-safe test now walks
  `importGraph("src/render.js")` instead of a hand-written file list.
- Gotcha: the built-in `#heart` is an **outline** (Material
  `favorite_border`), so its centre is background; the smoke test checks
  the red ink's bounding-box centre instead (moved up 7 virtual px).
- `test/api.test.js`: 16 tests. `npm test`: 589 tests, 589 pass.

### Implement step 14 (sample renders) - learnings
- `scripts/render-samples.js` (`npm run samples`; optional arg = output dir,
  default `scratch/samples/`) uses only the public Node entry
  (`render`, `icons`, `napiBackend`). Writes `<outDir>/<group>/NN-<label>
  [-rgba].png` (147 samples, ~1 s) and **`<outDir>/contact-sheet.png`**
  (1200 px wide, labelled, grouped; RGBA cells over a dark checkerboard so
  white text stays visible). Each run clears only its own group folders.
- Groups: `icons-default` (all 42, default grey on black), `icons-color`
  (all 42, `#1565c0` on white - fixed-colour icons stay fixed),
  `icon-categories` (144 px, gold: Material fill attr / Material outline /
  Inkscape style fill / stroke->path / fixed hdd, steam, playstation,
  apple-tv), `recolour` (`color` named/rgb()/hsl(), `colors` single,
  2-entry swap and rgb() key on an old-style `#848484` user SVG, `tint` on
  steam/hdd/playstation and with 50% alpha, `opacity`, `$(x)` + `colors`),
  `text-align` (3x3 align/valign, 12px so valign is visible), `text-misc`
  (single line, `\n`, over-wide word, 4-line wrap, lineSpacing, padding,
  translate, serif/bold 28/italic fonts, 144 px), `combos` (old typical
  "icon up 7 + bottom label" incl. the old `test.js` apple-tv/#404040/
  "Hello!", text-on-top, scaled icon, stacked svgs, 144 px), `sizes` (Notes
  example at 72/96/144 RGB, 72/144 RGBA without fill, half-alpha fill,
  144x72 non-square with matching virtualSize).
- PNG encoding: raw result -> `napiBackend.createCanvas` + `createImageData`/
  `putImageData` (RGB expanded) -> `canvas.toBuffer("image/png")`. Uses
  napi-canvas extras beyond the Backend contract - fine for a Node script.
- Visual check (by the implementing agent): all icons render and recolour;
  fixed-colour parts (hdd red dot, steam/playstation/apple-tv) unaffected by
  `color`; tint monochromes them; align/valign/wrap/padding/translate/
  lineSpacing behave as specified; scaling at 96/144 is proportional. Known,
  expected: "Supercalifragilistic" overflows both sides (old behaviour -
  over-wide words aren't clipped/shrunk); at 72 px the default bold 16px
  label sits close to an icon nudged up 7 (same as old project).
- `test/samples.test.js` (2): `npm run samples` script entry exists; running
  the script into a temp dir writes > 100 PNGs incl. `contact-sheet.png`
  (PNG signature checked). `npm test`: 591 tests, 591 pass.

### Implement step 15 (final review) - learnings
- **Description check:** every item is covered: caching dropped; colour
  map + `currentColor`/`color` + `tint` recolouring; typed layers (fill, svg,
  text); Node 24 target with a browser-safe core and Canvas-2D backend
  abstraction; colour replacement, scaling, text, `$(x)` kept; virtual pixels
  kept; 42 built-in icons + generator + staleness test; git/GitHub; v0.0.1;
  MIT `Copyright © 2026 Topten Software`; 592 tests; README limited to the
  user-requested SVG authoring note.
- **Gaps / follow-ups (not fixed, by design or out of scope):**
  - No browser backend yet and no browser test run - browser-safety is only
    enforced statically (import-graph test). First real browser use should
    add a backend (`OffscreenCanvas` + `createImageBitmap`) and e.g. vitest
    browser mode.
  - ~~`hdd` icon uses the Impact font~~ - fixed after review (user): the
    "HDD" text was converted to a path with Inkscape, so no font is needed.
    `scripts/strokes-to-paths.js` was generalised to `scripts/to-paths.js`
    (object-to-path + stroke-to-path) and `test/icons.test.js` now also
    fails on any `<text>`/`<tspan>`/`<textPath>` in a built-in icon. hdd
    still matches the librsvg (Impact) reference.
  - No PNG helper in the public API (samples script encodes itself).
  - No `.d.ts`/`checkJs` - JSDoc only.
  - ~~`scripts/build-icon-reference.js`~~ removed after review (user): the
    reference fixture `test/fixtures/icon-reference.json` is fixed and won't
    be regenerated, so the dependency on the old project is gone.
  - 5 icons are CRLF in this working tree only (git index is LF); harmless.
- **Leftover grep:** no `sharp`/`canvas`(node-canvas) imports in `src/`
  (only provenance comments in `svg.js` and the reference script); only
  dependency is `@napi-rs/canvas` (now asserted in `package.test.js`). No
  caching code. `#848484` only as the svg layer default (`svg.js`), the
  generator key (`build-icons.js`, now exported as `ICON_KEY`), generated
  `src/icons.js` header, samples and tests. No `not implemented` stubs left.
- **DRY fixes made (no behaviour change):**
  - `validatePositive(type, name, value)` added to `src/layers/validate.js`;
    used for svg `scale` and text `lineSpacing` (same messages).
  - `scripts/build-icons.js` now exports `ICON_KEY`, `listIcons()`,
    `readIcon(name)` (LF-normalised); `test/helpers.js` re-exports them and
    adds `readRepoFile`, `readFixture`, `pkg`, `opaquePixels`. Removed the
    copies of icon listing/reading, fixture reading, package.json reading,
    `opaquePixels` and `expectColorClose` (= `expectColorNear`) from
    icons/svgSize/recolor/resolve/api/samples/package/layers-svg tests.
  - `test/spike-icons.test.js` renamed `test/skia-svg.test.js` (git mv);
    stale "spike" header and "moved to ..." breadcrumbs removed, duplicate
    "all 42 icons present" test removed (icons.test.js covers it).
  - Test file headers no longer say "Plan step N" (the doc is being
    renamed); backend.test's quirk note points at the README instead.
- **Packaging:** `package.json` OK (0.0.1, MIT, engines `>=24`, `exports`
  `.`/`./node`, `files` `src/` + `LICENSE`). New test: every module reachable
  from each export exists and is covered by `files`. `npm pack --dry-run`:
  20 files, 35.3 kB packed / 129.8 kB unpacked - LICENSE, README.md,
  package.json and the 17 `src/` modules (incl. `src/icons.js` 70.7 kB); no
  tests, scripts, icons sources, scratch or wip.
- `npm test`: 592 tests, 592 pass (591 - 1 duplicate + 2 package tests).

### CLAUDE.md updates (approved by user and applied)
Rule 4 proposals collected during the job, as one addition:

```markdown
## Architecture
- Plain JavaScript ESM + JSDoc, no build step. Two entry points
  (package.json `exports`): `src/index.js` = portable core, `src/node.js` =
  core + Node defaults (`napiBackend`, file resolver, `render` with defaults).
- **Browser-safe core:** nothing reachable from `src/index.js` may import
  `node:*`, `fs`, `path` or `@napi-rs/*` (enforced by `test/api.test.js`).
  Node-only code lives in `src/node.js`, `src/node/` and
  `src/backends/napi.js` (the only importer of `@napi-rs/canvas`).
- `render(definition, w, h, { backend, resolveSvg, channels })` paints layers
  through a Canvas-2D backend (`createCanvas`, `loadSvgImage`) and returns
  `{ data: Uint8Array, width, height, channels }`.
- Layer types: one module per type in `src/layers/`, registered in
  `layerTypes` (`src/render.js`). Signature `(layer, env) => Painter |
  Promise<Painter>`: validate and do async work up front, return a sync
  painter. The core handles `visible`/`opacity`. Shared validation:
  `src/layers/validate.js`.
- Shared code - reuse, don't duplicate: `color.js` (CSS colours),
  `recolor.js` (the one SVG markup/paint tokeniser), `scale.js` (all
  virtual -> device px maths), `svgSize.js`; tests use `test/helpers.js`.
- SVG references go through async prefix resolvers (`src/resolve.js`).
  Resolvers return SVG strings; monochrome sources normalise their
  foreground to `currentColor`.

## Built-in icons
- Sources are `icons/*.svg` (grey `#848484` is the recolour key). After
  adding/editing one, run `npm run build:icons` to regenerate `src/icons.js`
  (generated - never edit by hand; a test fails if it is stale).
- Built-in icons must be **filled paths only - no strokes, no text**. Convert
  with `node scripts/to-paths.js icons/<name>.svg` (needs Inkscape).
- `npm run samples` renders PNGs + a contact sheet to `scratch/samples/` for
  visual review (rendering output can't be fully verified by tests).
```

### CLAUDE.md
- *Building and testing* section has been added by the user: no build step;
  `npm test` must pass with 0 failures. (Earlier Rule 4 gap - resolved.)

### Decisions (user, after Investigate)
- **Rendering backend: Option 1** - Canvas 2D abstraction; Node backend uses
  `@napi-rs/canvas` (Skia, SVG decoded by Skia), browser uses native canvas
  later. **Drop sharp and node-canvas.** Backend interface stays small
  (`createCanvas`, `loadSvgImage`).
- The first relevant Implement step (Plan step 3) must verify all 45 built-in
  icons render acceptably with @napi-rs/canvas. If they don't, the fallback is
  sharp for SVG rasterisation in the Node backend only - **stop and ask the
  user** before adopting it.
- All flagged assumptions from Investigate are approved (marked confirmed below).
- Rejected alternatives (for the record): node-canvas + sharp in Node (two native
  deps); compose-to-SVG-string (text measure/render engine mismatch).

### Planned layout (guide for Implement agents)
```
package.json, LICENSE, .gitignore
icons/*.svg                 original built-in SVGs (copied from old project)
scripts/build-icons.js      generator -> src/icons.js (exports generateIconsModule())
src/index.js                portable core entry (no Node imports)
src/node.js                 Node entry: Node backend + file resolver as defaults
src/render.js               render(definition, w, h, opts) + layer dispatch
src/layers/fill.js|svg.js|text.js
src/backends/napi.js        @napi-rs/canvas backend
src/color.js                parse/normalise CSS colours (shared)
src/recolor.js              colour map, root `color`, $(x) substitution (pure string fns)
src/svgSize.js              natural SVG size from width/height/viewBox
src/scale.js                virtual-pixel scaler, scaleFont, padding normalise (shared)
src/wrapLines.js            ported as-is
src/resolve.js              async prefix-keyed SVG resolver (+ built-in '#')
src/icons.js                GENERATED - do not edit
test/*.test.js              node:test
scratch/                    gitignored; manual render outputs for human review
```
Shared utilities (DRY - build once, reuse everywhere):
- `color.js` - used by recolour, icon generator, tests (pixel assertions).
- `scale.js` - the only place virtual->device maths lives (translate, padding,
  font). svg and text layers both use it.
- `recolor.js` - `applyColorMap` used both by the svg layer at render time and
  by the icon generator (`#848484` -> `currentColor`).
- A test helper `test/helpers.js` (`pixelAt(result, x, y)`, `findInkBounds(result, bg)`,
  `expectColorNear(actual, expected, tol)`) used by all render tests.
- Paint-context finder in `recolor.js` is a single tokeniser function reused by
  colour-map replacement and by any "does this SVG contain colour X" check.

### Changes from material-icons investigation (approved, applied to plan)
Source: `wip/wip-material-icons.md` Notes. Key fact: downloaded Material
Symbols SVGs have **no fill/stroke at all** (implicit black), viewBox
`0 -960 960 960`, `width="24" height="24"`. A colour map can't recolour them;
the fix is to normalise them to the `currentColor` convention by injecting
root `fill="currentColor"` (inherited), so the svg layer's existing `color`
colours them exactly like built-ins. The recolouring model in this job is
otherwise unchanged. Approved by the user (including the assumptions) and
folded into Plan steps 3, 5, 6, 9, 11 and the related-jobs note above:
- **Related wip jobs note**: replace "recolour e.g. white -> user colour" with
  "resolver normalises icons to `fill="currentColor"`; layer `color` colours
  them". Add contract: *resolvers return SVG strings; monochrome icon sources
  normalise their foreground to `currentColor`*.
- **Step 3 (Skia spike)**: additionally verify (a) an SVG with only root
  `fill="currentColor"` + `color="red"` and unpainted `<path>` renders red
  (inherited fill + currentColor in Skia), and (b) an SVG with a negative
  viewBox origin (`0 -960 960 960`) and the padded `-144 -1104 1248 1248`
  renders correctly positioned. Can use a checked-in Material sample as
  `test/fixtures/material-home.svg` (Apache-2.0).
- **Step 5 (recolor.js)**: generalise `setRootColor(svg, color)` into
  `setRootAttribute(svg, name, value)` (set or replace one attribute on the
  root `<svg>`; handles single-line and multi-line root tags, `xmlns` etc.
  preserved) and keep `setRootColor` as a one-line wrapper (or drop it).
  Tests: set when absent, replace when present, only root affected (not
  nested `<svg>`/children), works on the one-line Material format.
- **Step 6 (svgSize.js)**: add test cases for negative viewBox origin
  (`0 -960 960 960` with `width="24"` -> 24x24) and unitless vs `px`
  width/height. Optional (else done in the material job): add pure
  `padViewBox(svg, fraction)` here, since it is generic viewBox maths.
- **Step 9 (resolve.js)**: tests should cover a single-char non-`#` prefix
  (`@`) receiving the remainder **including any `?query`** verbatim
  (`@home?fill=1` -> handler gets `home?fill=1`), prefix handlers being
  async, and rejection propagation. Document the resolver contract above.
- **Step 11 (svg layer)**: add a test: SVG with root `fill="currentColor"`
  and unpainted paths + `color: "red"` -> red ink; without `color` -> default
  `#848484`. (This is the material-icon path, exercised without network.)
- **Step 13 (entry points)**: no change now; the material job will add
  `createMaterialResolver` to the core exports and register `@` (with fs
  cache) in the Node entry defaults.

## Flagged assumptions
### Consolidated summary (step 15)
[C] = confirmed by the user; [R] = still for user review. Detail per step
follows below.

**API and project**
- [C] Pure `render(definition, w, h, opts)`; `ButtonImage` class, caching and
  `states`/`state` dropped (the definition-update job decides how to convert
  old `states`).
- [C] Result `{ data: Uint8Array, width, height, channels }`, RGB (default,
  over black) or RGBA. [C] Plain JS ESM + JSDoc, `node:test`, Node `>=24`,
  `@toptensoftware/button-face`, public repo, MIT.
- [R] Core exports a curated named list; Node entry adds `render` with
  defaults, `resolveSvg`, `createNodeSvgResolver`, `createFileResolver`,
  `napiBackend`. No PNG helper, no custom layer-type registration.
- [R] Errors are strict: unknown layer type, unknown `src` prefix, unknown
  `#name`, invalid colours/opacity/visible/align/lineSpacing/scale all
  reject (old code often fell back silently).

**Rendering**
- [C] Canvas-2D backend with @napi-rs/canvas (Skia); sharp and node-canvas
  dropped.
- [R] Layers prepared concurrently, painted in order; `opacity`/`visible` on
  all layers; `opacity: 0` skips the layer; hidden layers aren't validated.
- [R] Only `parseColor` syntaxes are accepted anywhere (hex, rgb/rgba,
  hsl/hsla, 148 names, `transparent`) - no `hwb()`/`lab()`/`oklch()`.
- [R] SVG size rounding copies sharp (each dimension rounded half-up); a size
  that rounds to 0 draws nothing.

**Recolouring**
- [C] Built-ins use `currentColor`, default svg `color` `#848484`; `colors`
  A->B map for any SVG; `tint` opt-in.
- [R] Colour map matches RGB + alpha at 8-bit precision; non-colour keys
  throw; `url()`/`var()`/fallback values never match.
- [R] The svg layer always writes the root `color` (default `#848484`), so it
  overrides an author's own root `color`.
- [R] Generator also turns every `color` paint in built-ins into `inherit`
  (needed for 13 Inkscape icons).
- [R] `$(x)` substitution is literal (no `$&` patterns) and substitutes `0`;
  text is not XML-escaped (as before).

**Text**
- [C] Font scaled by Y only; old line-height heuristic kept (x1.1 small text).
- [R] Property names `text, font, color, align, valign, lineSpacing, padding,
  translate`; `lineSpacing: 0` rejects (old: treated as 1); fonts not
  validated beyond having a px size.

**Icons and tooling**
- [C] Built-in icons are filled paths only (9 converted with Inkscape);
  minimal README authoring note.
- [R] 42 icons (not 45); Inkscape cruft kept; originals with `#848484` kept in
  `icons/`, `src/icons.js` generated and checked in.
- [R] `scripts/build-icon-reference.js` checked in though it needs the
  sibling old repo; Skia quirk kept as a characterisation test.
- [R] Tests use tolerances / ink regions, no golden images; visual check via
  `npm run samples`.

### Investigate phase - all CONFIRMED by the user
- Drop `states`/`state` (variant property sets) along with the `ButtonImage`
  class; the new API is a pure function `render(definition, width, height, opts)`.
  Variants can be expressed by the caller holding multiple definitions. (The
  definition-update job will need to decide how to convert old `states`.)
- Keep `svgText` (`$(x)` substitution) as the svg layer's `text` option, since
  the brief says keep all existing rendering capabilities.
- Return type: `{ data: Uint8Array, width, height, channels }` (portable),
  channels 3 (default, RGB) or 4 (RGBA), not a Node `Buffer`/sharp object.
- Built-in icons converted from `#848484` to `currentColor`, default svg `color`
  `#848484`; the `colors` A->B map also available for any SVG.
- Plain JS ESM + JSDoc, `node:test`, no TypeScript, no build step;
  `engines.node >= 24` (current LTS installed here is 24.14.0).
- Package name `@toptensoftware/button-face` (matches old scope naming); repo
  `toptensoftware/button-face`, **public** (old repo is public), branch `main`,
  SSH remote.
- Licence MIT with `Copyright © 2026 Topten Software`.
- Keep font size scaled by scaleY only (matches old behaviour) and the old
  line-height heuristic (including the effective x1.1 for small text) so output
  matches the old project; can be tidied later.
- `.claude/settings.local.json` gitignored (machine-local settings).

### Plan phase - for user review
- `icons/` keeps the **original** SVGs (with `#848484`); the generator converts
  `#848484` -> `currentColor` at pack time via `applyColorMap` (reproducible,
  and new icons can be dropped in unchanged). `src/icons.js` is generated and
  checked in; a test fails if it is stale.
- Inkscape/sodipodi cruft is left in the icons for now (no svgo dependency).
- Colour-map matching compares RGB + alpha exactly; `transparent`/`none` and
  `url(...)` values are never matched.
- `tint` is applied after the colour map / `color` (rasterise SVG into an
  offscreen canvas, then `source-in` fill) and affects only that layer.
- Layer `opacity` (default 1) and `visible` (default true) are implemented for
  all layer types now (cheap via `globalAlpha`); `rect`/`radius` on fill and the
  `image` layer are deferred.
- Unknown layer `type` throws; unknown `src` prefix rejects (no silent blanks).
- Built-in `#name` that doesn't exist throws (old project threw via `fs`).
- Text-layer pixel tests assert positions/regions, not exact glyph pixels;
  render tests use tolerances (+/-2 per channel for flat areas) because
  antialiasing and fonts differ per machine. No golden PNG snapshot tests - a
  manual sample-render script produces PNGs for human visual review instead.
- Initial GitHub push happens right after scaffold (step 2), so later steps
  build on a tracked repo; later commits/pushes only when the user asks.

### Implement step 3 - for user review
- Icon count is 42 (not 45); tests assert 42.
- `#square`/`#circle` "centre pixel ~#848484" changed to "stroke pixel
  ~#848484" (they are outlines).
- `apple-tv` "radial gradients produce non-uniform colour" changed to
  "uniform #848484" (its gradients are overridden by style fills; librsvg agrees).
- `test/helpers.js` created in step 3 rather than step 8 (DRY with the spike
  scripts); `drawSvg` in it is temporary until the backend exists.
- The Material fixture was copied verbatim from a download (Apache-2.0); no
  licence header added to the fixture file.
- A minimal `README.md` (project name + "SVG authoring notes") was created
  at the user's request, ahead of the separate docs job (the Description
  says no README yet). It says the library patches unitless stroke-width -
  true once step 8 lands.
- The no-stroke and librsvg-reference icon tests live in a new
  `test/icons.test.js`, which step 7 extends (rather than a separate file).
- The stroke-to-path icons keep Inkscape's cruft and its rewritten
  `sodipodi:docname`; the conversion was not hand-tidied.
- `scripts/build-icon-reference.js` is checked in (not scratch) so the
  fixture's provenance is reproducible, even though it needs the sibling old
  project (sharp + images) to run. It is not run by tests.
- The old `todo` test was kept as a characterisation test of the Skia quirk
  (asserts the bug exists), not deleted.

### Implement step 4 - for user review
- "Match RGB + alpha exactly" interpreted as alpha equal at 8-bit precision
  (`round(a*255)`), so `#ff000080` == `rgba(255,0,0,0.5)`; otherwise the hex
  and decimal spellings of the same alpha could never match.
- `colorsEqual` accepts CSS strings or parsed colours (convenient for the
  colour-map code), and returns false when either side isn't a colour.
- Only sRGB forms listed in the plan are supported (no `hwb()`, `lab()`,
  `oklch()`, `color()`, system colours) - those parse as null, so a colour
  map simply won't match them.
- `formatColor` rounds alpha to 3 decimals; r/g/b are assumed to be integers
  0..255 (not clamped).

### Implement step 5 - for user review
- `substituteText` deviates from the old `svg.replace(/\$\(x\)/g, text)` in
  two small ways: the text is inserted literally (old code interpreted `$&`,
  `$1`, `$$` in the text as replace patterns), and the number `0` is
  substituted (old code skipped any falsy text). Empty/missing text still
  leaves `$(x)` in place, and the text is still not XML-escaped (as before).
- `applyColorMap` throws on map keys that aren't colours (rather than
  silently never matching) - surfaces typos early.
- Paint values that aren't a single colour (`url(#a) red` fallbacks,
  `var(...)`, `hwb()` etc.) are never matched. CSS comments inside `<style>`
  or `style="..."` are not skipped (a commented-out declaration could be
  rewritten - harmless). Unquoted attributes (not valid XML) are ignored.
- Replacement colour strings are inserted into attributes unescaped (CSS
  colours never contain quotes/`&`/`<`).
- `normalizeStyleLengths` covers only the four listed properties (not
  `letter-spacing`/`word-spacing`, untested in Skia).
- `setRootColor` kept as a wrapper (step 11's pipeline names it).

### Implement step 6 - for user review
- `padViewBox` implemented here now (the optional part of step 6), with the
  material job's semantics (fraction of the viewBox per side, width/height
  kept).
- `getSvgSize` unit conversion uses CSS 96 px/in (old sharp metadata used 72
  dpi); harmless since only the aspect ratio feeds the scaling maths.
- Missing-dimension fallback: one usable dimension + viewBox -> aspect ratio;
  without a viewBox each missing dimension defaults to 300 / 150 (so
  `width="40"` alone -> 40x150), rather than e.g. making it square.
- `createScaler().padding(undefined)` is 0, not 3 - the text layer owns the
  default. Invalid padding arrays throw instead of producing NaN.
- `scaleFont` accepts `.5px`/exponents (old regex matched `5px` inside
  `.5px`) and won't match a px suffix glued to a word; otherwise identical.
- No rounding in the scaler; consumers round final positions as before.

### Implement step 7 - for user review
- Generator also rewrites all `color` paint values in built-ins to `inherit`
  (beyond the plan's `#848484` -> `currentColor`) - needed for the root
  `color` to work on 13 Inkscape icons; see step 7 Notes.
- New public-ish helper `mapPaintValues` exported from `src/recolor.js`
  (needed by the generator; also refactors two existing functions).
- `src/icons.js` exports only the named `icons` (no default export).
- `npm run build:icons` script added; Rule 4: CLAUDE.md could mention
  "edit `icons/*.svg`, then `npm run build:icons`" (proposal for step 15).
- The 5 CRLF working-tree icons were left as-is (git index is LF).

### Implement step 8 - for user review
- Backend is a plain frozen object `napiBackend` (not a class/factory); no
  per-instance options needed yet. `src/node.js` (step 13) can default to it.
- `Drawable` has no `close()`/dispose in the contract (a browser
  `ImageBitmap` could be closed after drawing; left out to keep it minimal).
- `loadSvgImage` does not validate/clamp `w`/`h`; the napi backend ignores
  them.
- The quirk test lives in `test/backend.test.js` (moved, not duplicated);
  test files may import `@napi-rs/canvas` directly - the "only importer"
  rule applies to `src/`.

### Implement step 9 - for user review
- Non-prefixed references go to an explicit `fallback` option (rather than a
  special `""` prefix); the Node entry will use the file resolver as fallback.
- Longest-prefix matching, `Map` support and `null`-to-remove (incl. removing
  the built-in `#`) were added beyond the plan - small and tested.
- Handlers receive only the remainder (not the full `src`); the fallback
  gets the full `src`.
- `resolve.js` imports `src/icons.js` statically (~70 KB), not lazily.
- The file resolver strips a UTF-8 BOM; relative paths resolve against
  `baseDir` (default cwd). No caching, no path restrictions (callers trust
  their definitions).
- Resolved SVGs are returned uncached; caching is the material resolver's
  job (per its plan).

### Implement step 10 - for user review
- Fill `color` defaults to `black` (old `backColor ?? "black"`), and an
  unparseable colour rejects rather than being silently ignored by the
  canvas. Consequence: only the colour syntaxes `parseColor` supports work
  (no `oklch()`/`hwb()` etc.).
- Invalid `opacity`/`visible` reject (`TypeError`) instead of clamping;
  `opacity: 0` skips the layer like `visible: false`. A hidden layer's own
  properties are not validated (only `type`/`visible`/`opacity`).
- Layers are prepared concurrently then painted in order (vs. strictly
  sequential load+draw) - same output, faster with several svg layers.
- RGB "over black" is done with a canvas `destination-over` fill rather
  than manual per-pixel maths (same result, uses the backend's compositing).
- `layerTypes` is exported (read-only) from `render.js`; no option to
  register custom layer types yet.
- svg/text placeholders are separate stub modules (not inline in the
  registry) and have no tests asserting "not implemented" (they'd be deleted
  in steps 11/12).
- `render` and `layerTypes` are not yet exported from a package entry
  (step 13).

### Implement step 11 - for user review
- The default `color` (`#848484`) is **always** written to the root `color`
  attribute, so it overrides a root `color` an SVG author set themselves
  (only matters for SVGs using `currentColor` with their own root colour).
- `tint` is any parseColor colour; its alpha multiplies the SVG's alpha.
  `tint: null` = no tint. Tint and `color`/`colors` can be combined (tint
  wins visually, since it replaces all colour).
- `scale` that rounds to 0 px silently draws nothing (no error).
- `text` follows `substituteText` (number allowed; empty/null leaves `$(x)`);
  not validated further.
- `#square` "centre ~#848484" tested on its outline pixel (it is hollow), as
  in step 3.

### Implement step 12 - for user review
- Text property names are `text`, `font`, `color`, `align`, `valign`,
  `lineSpacing`, `padding`, `translate` (as in the Notes example definition).
- `lineSpacing` must be a positive number; the old code silently treated
  `0`/falsy as 1 - now `0` rejects.
- `text` may be a string or number (numbers drawn via `String`); other types
  reject. `null`/`""` draw nothing (old: text layer skipped when empty).
- Invalid `align`/`valign` reject (old code fell back to left/top silently).
- `color` default `white` (old `#ffffff`), only parseColor syntaxes accepted,
  like the other layers.
- The font string itself isn't validated beyond "is a string with a px
  size"; an unparseable font is silently ignored by the canvas (keeps the
  previous/default font), as in browsers.

### Implement step 13 - for user review
- Core exports a curated named list (above) rather than `export *` from
  every module; `layoutText`/`lineHeight` and `validate.js` helpers are not
  public.
- Node entry names: `render` (with defaults), `resolveSvg` (default
  resolver instance), `createNodeSvgResolver`, `createFileResolver`,
  `napiBackend`. No PNG-encoding helper in the API (the samples script
  encodes via @napi-rs/canvas itself) - easy to add (`toPng(result)`) if
  wanted.
- `src/backend.js` (typedefs only) is not imported by either entry.

### Implement step 14 - for user review
- Sample set differs from the plan's list: the Notes example is rendered at
  72/96/144 as planned, but instead of "all 42 recoloured" in one colour the
  icons appear twice (default grey on black; blue on white) plus a 144 px
  category group; recolouring is shown in its own group. Samples were not
  compared against the old project's renders (only against the spec) - the
  librsvg-reference test already covers icon likeness.
- The samples test spawns the script (CLI) rather than importing a
  function, since the script is CLI-only.

## Plan
Each step: write/adjust tests first (TDD), implement, run `npm test` (0
failures), tick the box, record learnings in *Notes*. Steps marked **[user]**
need the user's go-ahead before the action; steps marked **[visual]** include
output that can't be fully verified automatically - leave PNGs in `scratch/` and
ask the user to review.

- [x] 1. **Scaffold.** Create `package.json` (`@toptensoftware/button-face`,
  `version 0.0.1`, `type: module`, `license: MIT`, `author: Topten Software`,
  `repository` github.com/toptensoftware/button-face, `engines.node ">=24"`,
  `scripts.test: "node --test"`, `files`), `LICENSE` (MIT, `Copyright © 2026
  Topten Software`), `.gitignore` (`node_modules/`, `scratch/`, `*.log`,
  `.DS_Store`, `.claude/settings.local.json`). `npm install @napi-rs/canvas`.
  Port `wrapLines.js` -> `src/wrapLines.js` and its tests ->
  `test/wrapLines.test.js` unchanged (tests first, confirm they pass). Add
  `test/package.test.js`: version is 0.0.1, licence is MIT and LICENSE contains
  the copyright line, engines.node is `>=24`. No README.
- [x] 2. **[user] Git + GitHub.** Ask the user for go-ahead first (CLAUDE.md:
  don't commit unless asked). Then `git init -b main`, verify `.gitignore`
  excludes `node_modules/` and `.claude/settings.local.json` (`git status`),
  initial commit (include `CLAUDE.md`, `wip/`), `gh repo create
  toptensoftware/button-face --public --source . --remote origin --push`.
  Record remote URL in Notes.
  *Done:* remote `https://github.com/toptensoftware/button-face` (origin,
  branch `main`). Added `.gitattributes` (`* text=auto eol=lf`) because the
  machine's global git config converts LF→CRLF.
- [x] 3. **[visual] Skia icon spike.** Copy the 45 SVGs from
  `node-buttonImage/images/` to `icons/` (unchanged). Test first:
  `test/spike-icons.test.js` - for each icon, load via `@napi-rs/canvas`
  `Image` (or `loadImage`) from the SVG string, draw at 72x72 onto a
  transparent canvas, assert it decodes and has non-transparent pixels; for
  `#square`/`#circle` assert the centre pixel is ~`#848484`; additionally
  verify a `currentColor` SVG with root `color="red"` renders red, and that
  `steam.svg` gradients and `apple-tv.svg` radial gradients produce
  non-uniform colour. Also verify (a) an SVG with only root
  `fill="currentColor"` + `color="red"` and unpainted `<path>` renders red
  (inherited fill + currentColor in Skia), and (b) SVGs with a negative
  viewBox origin (`0 -960 960 960`) and the padded `-144 -1104 1248 1248`
  render correctly positioned - use a checked-in Material sample
  `test/fixtures/material-home.svg` (Apache-2.0). Write `scratch/spike-icons.js` that renders a contact
  sheet PNG of all 45 (white and black backgrounds) to `scratch/` and ask the
  user to compare against the old project's look (note `hdd.svg` uses Impact
  text). **If any icon fails or looks wrong: stop, record in Notes, and ask
  the user (1-3-1) before falling back to sharp for SVG rasterisation in the
  Node backend.** Keep the useful tests (they become icon render tests later;
  rename/merge in step 10/12).
  *Status:* done. The 1-3-1 (Skia ignores unitless `stroke-width` in
  `style`) was resolved by the user: the 9 stroked icons were converted to
  filled paths (`scripts/strokes-to-paths.js`), `test/icons.test.js` enforces
  no strokes + librsvg-reference likeness for all 42, README authoring note
  added; the render-time fallback is folded into steps 5 and 8.
- [x] 4. **Colour utility (`src/color.js`).** Tests first
  (`test/color.test.js`): `parseColor` -> `{r,g,b,a}` (a 0..1) or `null` for
  `#rgb/#rgba/#rrggbb/#rrggbbaa` (any case), `rgb()/rgba()` comma + space
  syntax + `/ alpha` + `%`, `hsl()/hsla()`, all 148 named colours (spot-check
  plus count), `transparent`; `null` for `none`, `currentColor`, `url(#x)`,
  garbage. `colorsEqual(a, b)`. `formatColor({r,g,b,a})` -> `#rrggbb` or
  `rgba()`. Pure, no deps.
- [x] 5. **Recolour + substitution (`src/recolor.js`).** Tests first
  (`test/recolor.test.js`, pure strings): one internal paint-context tokeniser
  (attributes `fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color`,
  `color`; same properties inside `style="..."` and `<style>` text) used by
  `applyColorMap(svg, map)` - matches via `parseColor` so `#848484`, `#848484FF`,
  `rgb(132,132,132)` all match; never touches `url(#id)`, `href="#..."`, `id`
  values, or non-paint attributes; preserves everything else byte-for-byte;
  replacement emitted as given (incl. `currentColor`). `setRootAttribute(svg,
  name, value)` sets or replaces one attribute on the root `<svg>` (handles
  single-line and multi-line root tags; `xmlns` etc. preserved);
  `setRootColor(svg, color)` is a one-line wrapper over it (or dropped).
  Tests: set when absent, replace when present, only the root affected (not
  nested `<svg>`/children), works on the one-line Material format.
  `substituteText(svg,
  text)` replaces every `$(x)` (port old semantics exactly - check
  `drawButton.js`). Include tests against real icon files (an Inkscape one with
  `style` fill, a Material one with `fill` attr, `steam.svg` whose
  gradient ref must survive; note the built-ins no longer have stroke paint -
  use an inline SVG for `style` stroke cases).
  **`normalizeStyleLengths(svg)`** (Skia fallback, see step 3 Decisions):
  reuses the same style/`<style>` declaration tokeniser (DRY - no second
  parser) to append `px` to unitless numeric values of length properties
  (at least `stroke-width`, `stroke-dashoffset`, `font-size`; also
  `stroke-dasharray` lists, `stroke-miterlimit` excluded - it is a ratio).
  Tests first: `style="stroke-width:0.7"` -> `0.7px`; `.5` and `1e-1`
  handled; values with units (`2px`, `1em`, `50%`) and
  keywords (`inherit`, `none`) untouched; `stroke-dasharray:2,1` ->
  `2px,1px`; presentation attributes (`stroke-width="4"`, already fine in
  Skia) untouched; `<style>` text handled; non-length properties
  (`opacity:0.5`, `stroke-miterlimit:4`, `fill-opacity`) untouched; rest of
  the SVG byte-for-byte identical. Optionally replace the literal
  `strokeValues` regex in `test/icons.test.js` with the tokeniser if exported.
- [x] 6. **Shared maths (`src/scale.js`, `src/svgSize.js`).** Tests first.
  `createScaler(virtualSize, width, height)` -> `{ sx, sy, x(v), y(v),
  translate({x,y}), padding(p) }` where `padding` normalises number |
  `[tb, lr]` | `[t, r, b, l]` to `{top,right,bottom,left}` device px (t/b by
  sy, l/r by sx); default virtualSize 72x72. Port `scaleFont(font, scale)`
  (throws without px size) here. `getSvgSize(svg)` -> natural `{width,height}`
  from width/height attrs (px, unitless, pt/in/cm/mm, ignore %), falling back
  to viewBox, then 300x150 default; verify against both icon families
  (24x24 and 72x72), plus a negative viewBox origin (`0 -960 960 960` with
  `width="24"` -> 24x24) and unitless vs `px` width/height. Optional (else
  done in the material job): pure `padViewBox(svg, fraction)` in
  `svgSize.js` (generic viewBox maths). Tests: `test/scale.test.js`,
  `test/svgSize.test.js`.
- [x] 7. **Built-in icons module.** Tests first (`test/icons.test.js`):
  `src/icons.js` exports a frozen name->SVG map with 42 entries matching
  `icons/*.svg` names; no entry contains `#848484` in a paint context; every
  entry contains `currentColor`; `hdd` still has `#ff0000`, `steam`/`apple-tv`
  gradients unchanged; **up-to-date check**: `generateIconsModule()` imported
  from `scripts/build-icons.js` returns a string identical to the
  checked-in `src/icons.js`. Implement `scripts/build-icons.js` (exported
  `generateIconsModule()` + CLI `npm run build:icons` that writes the file,
  only when run as main). Uses `applyColorMap` (DRY). Generated file has a
  "GENERATED - do not edit" header and deterministic (sorted) order.
- [x] 8. **Backend abstraction + Node backend.** Define the backend contract
  in JSDoc (`src/backend.js` typedef only): `createCanvas(w, h)` -> canvas with
  `getContext("2d")`; `loadSvgImage(svgString, w, h)` -> `Promise<drawable>`
  usable with `ctx.drawImage`. Implement `src/backends/napi.js` with
  `@napi-rs/canvas` (only file importing it). Tests first
  (`test/backend.test.js`): canvas size, `getImageData` RGBA; loading a 10x10
  red-rect SVG and drawing at 20x20 fills the canvas red (pixel samples);
  invalid SVG rejects; **`loadSvgImage` applies `normalizeStyleLengths`**
  (step 5) before decoding - test: a box with `style="fill:none;stroke:red;
  stroke-width:8"` drawn via the backend has an 8-wide stroke (same check as
  the px case of the Skia-quirk characterisation test in
  `test/spike-icons.test.js`). `test/helpers.js` already exists (step 3):
  switch its `drawSvg` to the backend (so it is no longer importing
  @napi-rs/canvas directly) - note the quirk test must still draw via raw
  Skia, so keep a raw path for it or move it into `test/backend.test.js`.
  Re-run `test/icons.test.js` (librsvg-reference check) through the backend.
- [x] 9. **SVG resolver (`src/resolve.js`).** Tests first
  (`test/resolve.test.js`): `createSvgResolver({ prefixes })` returns async
  `resolve(src)`; built-in `#name` -> `icons[name]`, unknown name throws;
  custom prefix handler is called with the remainder; a single-char non-`#`
  prefix (`@`) receives the remainder **including any `?query`** verbatim
  (`@home?fill=1` -> handler gets `home?fill=1`); prefix handlers may be
  async; handler rejections propagate; unknown prefix with no default
  rejects. Document the resolver contract (returns SVG strings; monochrome
  sources normalise foreground to `currentColor`) in JSDoc. Node-only file resolver (plain path -> `fs.promises.readFile`)
  lives in `src/node.js`-side module (e.g. `src/node/fileResolver.js`), tested
  with a fixture SVG in `test/fixtures/`. Keeps the async pluggable shape the
  material-icons job needs.
- [x] 10. **Render core + fill layer.** Tests first (`test/render.test.js`,
  `test/layers-fill.test.js`): `render(definition, w, h, { backend,
  resolveSvg, channels })` returns `{ data: Uint8Array, width, height,
  channels }`; channels 3 -> length w*h*3, 4 -> w*h*4, other -> throws;
  empty/no layers -> RGB all black, RGBA all transparent; fill `red` -> every
  pixel red; two fills -> top wins; fill with `opacity: 0.5` over black ->
  ~half red; `visible: false` skipped; unknown layer type throws. Implement
  `src/render.js` (layer registry `{ fill, svg, text }`, shared per-layer
  wrapper for opacity/visible via `ctx.save/globalAlpha/restore`, output via
  `getImageData` (non-premultiplied) + alpha strip for RGB composited over
  black) and `src/layers/fill.js`. svg/text registered as stubs that throw
  "not implemented" until steps 11/12.
- [x] 11. **SVG layer (`src/layers/svg.js`).** Tests first
  (`test/layers-svg.test.js`, using helpers + Node backend): `#square`
  default colour -> centre ~`#848484`; `color: "red"` -> red; inline `svg`
  with `colors: {"#848484": "lime"}` -> lime; `tint: "blue"` turns a
  multi-colour SVG solid blue where opaque and leaves transparent areas
  alone; `scale: 0.5` -> ink bounds height ~half the button, aspect kept
  (test with non-square SVG, e.g. 2:1); centred by default; `translate:
  {x:10,y:0}` with virtualSize 72 on a 144px button shifts ink by ~20px;
  oversized SVG is cropped (no throw); `text` substitutes `$(x)` before
  rendering; `#hdd` keeps red regardless of `color`; SVG with root
  `fill="currentColor"` and unpainted paths + `color: "red"` -> red ink,
  without `color` -> default `#848484` (the material-icon path, no network).
  Pipeline: resolve ->
  substituteText -> applyColorMap -> setRootColor (default `#848484`) ->
  `getSvgSize` -> height = h*scale, width by aspect -> `loadSvgImage` ->
  position via scaler -> draw (tint via offscreen canvas + `source-in`).
  Remove/merge redundant spike tests from step 3.
- [x] 12. **Text layer (`src/layers/text.js`).** Tests first
  (`test/layers-text.test.js`): pure helper `lineHeight(ctx, lineSpacing)`
  reproduces old heuristic (ascent+descent of "Xy", x1.1 if < 40 else x1.2,
  x lineSpacing) - unit-test the multiplier logic with a fake `measureText`;
  render tests: white text on black has ink; `valign: top` ink top <
  `valign: bottom` ink top; `align: left` ink left < `align: right` ink left;
  long text wraps (ink height for wrapped text > single line); `\n` forces a
  break; padding and translate scaled via scaler (2x device size shifts ~2x);
  font px scaled by sy only; default font/colour/padding match old defaults.
  Uses `wrapLines`, `scaleFont`, `createScaler` (no duplicated maths). Draw
  with `textBaseline="top"`, `textAlign` per align, as in old `drawText.js`.
- [x] 13. **Public entry points.** Tests first (`test/api.test.js`): import
  `@toptensoftware/button-face` (package self-reference) and
  `@toptensoftware/button-face/node`; core entry exports `render`,
  `createSvgResolver`, `icons`, `parseColor`, `applyColorMap` and imports
  nothing from `node:*`/`@napi-rs/canvas` (static check: grep the core import
  graph, or import with a test that fails if `src/index.js`'s transitive
  imports include them); Node entry `render(def, w, h, opts?)` works with no
  backend/resolver supplied (defaults to napi backend + `#` + file resolvers);
  end-to-end smoke rendering the example definition from Notes (fill black +
  `#heart` red + bottom text) at 72x72 and 144x144 RGB/RGBA - correct lengths,
  heart region red-ish, text region has white ink. Add `exports` map to
  `package.json` (`.` -> `src/index.js`, `./node` -> `src/node.js`).
- [x] 14. **[visual] Sample renders for human review.** Add
  `scripts/render-samples.js` (`npm run samples`) writing PNGs to `scratch/`:
  all 42 icons default + recoloured, the Notes example definition at 72/96/144
  px, text alignment/valign/wrap grid, tint example. Not automatically
  verifiable - ask the user to review against the old project's output. A
  test only checks the script runs and produces files (into a temp dir).
- [x] 15. **Final review.** Re-read the Description and tick off every item
  (setup, version, copyright, licence, gitignore, engines, backend
  abstraction, layers, recolouring, `$(x)`, virtual pixels, text semantics,
  icons + generator + staleness test, `render` API, tests, README limited
  to the user-requested SVG authoring note). Grep
  for leftover sharp/node-canvas references, dead code, duplicated maths.
  `npm test` 0 failures. Record any CLAUDE.md update proposals (Rule 4, e.g.
  layout/`npm run build:icons` note) for the user. **[user]** Ask whether to
  commit and push the work. Set `Status: Complete`-ready and tell the
  coordinator the doc can be renamed to `complete-initial.md`.
  *Done:* see Notes "Implement step 15". DRY fixes made, 592/592 pass,
  `npm pack` contents checked; CLAUDE.md proposal and consolidated
  assumptions recorded. Commit/push and the rename are left to the
  coordinator.
