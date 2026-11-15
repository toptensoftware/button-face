# Initial Port

Status: Implement

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
- 45 SVGs in `node-buttonImage/images/` (~64 KB total): add, apple-tv, apps,
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
- **All 45 contain `#848484`** as the recolour key (fill attrs, style fill, style stroke).
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
  registry has 45 entries) + render smoke tests asserting pixels (fill layer ->
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
- [ ] 3. **[visual] Skia icon spike.** Copy the 45 SVGs from
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
- [ ] 4. **Colour utility (`src/color.js`).** Tests first
  (`test/color.test.js`): `parseColor` -> `{r,g,b,a}` (a 0..1) or `null` for
  `#rgb/#rgba/#rrggbb/#rrggbbaa` (any case), `rgb()/rgba()` comma + space
  syntax + `/ alpha` + `%`, `hsl()/hsla()`, all 148 named colours (spot-check
  plus count), `transparent`; `null` for `none`, `currentColor`, `url(#x)`,
  garbage. `colorsEqual(a, b)`. `formatColor({r,g,b,a})` -> `#rrggbb` or
  `rgba()`. Pure, no deps.
- [ ] 5. **Recolour + substitution (`src/recolor.js`).** Tests first
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
  `style` fill/stroke, a Material one with `fill` attr, `steam.svg` whose
  gradient ref must survive).
- [ ] 6. **Shared maths (`src/scale.js`, `src/svgSize.js`).** Tests first.
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
- [ ] 7. **Built-in icons module.** Tests first (`test/icons.test.js`):
  `src/icons.js` exports a frozen name->SVG map with 45 entries matching
  `icons/*.svg` names; no entry contains `#848484` in a paint context; every
  entry contains `currentColor`; `hdd` still has `#ff0000`, `steam`/`apple-tv`
  gradients unchanged; **up-to-date check**: `generateIconsModule()` imported
  from `scripts/build-icons.js` returns a string identical to the
  checked-in `src/icons.js`. Implement `scripts/build-icons.js` (exported
  `generateIconsModule()` + CLI `npm run build:icons` that writes the file,
  only when run as main). Uses `applyColorMap` (DRY). Generated file has a
  "GENERATED - do not edit" header and deterministic (sorted) order.
- [ ] 8. **Backend abstraction + Node backend.** Define the backend contract
  in JSDoc (`src/backend.js` typedef only): `createCanvas(w, h)` -> canvas with
  `getContext("2d")`; `loadSvgImage(svgString, w, h)` -> `Promise<drawable>`
  usable with `ctx.drawImage`. Implement `src/backends/napi.js` with
  `@napi-rs/canvas` (only file importing it). Tests first
  (`test/backend.test.js`): canvas size, `getImageData` RGBA; loading a 10x10
  red-rect SVG and drawing at 20x20 fills the canvas red (pixel samples);
  invalid SVG rejects. Also add `test/helpers.js` (`pixelAt`,
  `findInkBounds`, `expectColorNear`) for reuse by all render tests.
- [ ] 9. **SVG resolver (`src/resolve.js`).** Tests first
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
- [ ] 10. **Render core + fill layer.** Tests first (`test/render.test.js`,
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
- [ ] 11. **SVG layer (`src/layers/svg.js`).** Tests first
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
- [ ] 12. **Text layer (`src/layers/text.js`).** Tests first
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
- [ ] 13. **Public entry points.** Tests first (`test/api.test.js`): import
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
- [ ] 14. **[visual] Sample renders for human review.** Add
  `scripts/render-samples.js` (`npm run samples`) writing PNGs to `scratch/`:
  all 45 icons default + recoloured, the Notes example definition at 72/96/144
  px, text alignment/valign/wrap grid, tint example. Not automatically
  verifiable - ask the user to review against the old project's output. A
  test only checks the script runs and produces files (into a temp dir).
- [ ] 15. **Final review.** Re-read the Description and tick off every item
  (setup, version, copyright, licence, gitignore, engines, backend
  abstraction, layers, recolouring, `$(x)`, virtual pixels, text semantics,
  icons + generator + staleness test, `render` API, tests, no README). Grep
  for leftover sharp/node-canvas references, dead code, duplicated maths.
  `npm test` 0 failures. Record any CLAUDE.md update proposals (Rule 4, e.g.
  layout/`npm run build:icons` note) for the user. **[user]** Ask whether to
  commit and push the work. Set `Status: Complete`-ready and tell the
  coordinator the doc can be renamed to `complete-initial.md`.
