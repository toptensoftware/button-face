# README documentation

Status: Complete

## Description

Write (or update) README.md as a comprehensive self-contained guide for the project including:

- synopsis
- rationale
- features
- installation 
    - We've only really tested the node version and not the web version. I don't 
      plan on providing pre-bundled packages for web instead leaving it to the user 
      to bring it in with their own bundler. Assume the web version works for this
      documentation.
- usage guide (with embedded examples)
 - basics (incl: layers)
 - color formats
 - units and scaling
 - built-in icons
 - material icons
 - other?
- reference - Tiny reference of all the settable properties and one sentence describing each.
- license

## Notes

Everything below was checked against the code (2026-11-15). The README writer
should not need to re-read the source, but `src/layers/*.js` header comments
are the quickest cross-check.

### Current README.md (81 lines) - what to keep
- `# button-face` heading only, then two sections:
  - **"Material Symbols icons"** (added by the material job, meant to be folded
    into this full README): syntax + settings table, default weight 200,
    colouring, sizing/`pad`, caching (Node/browser), offline, custom resolver
    options, network URL, licence. Accurate vs code - **keep content, re-home
    it** under the usage guide (can trim the custom-resolver/network detail into
    an "advanced" sub-part).
  - **"SVG authoring notes"**: avoid strokes/text, convert to paths (Inkscape
    *Path > Stroke to Path* / *Object to Path*; "this repo's
    `scripts/to-paths.js`"); Skia ignores unitless `stroke-width` in `style`
    and button-face patches that case. Accurate - keep (note `scripts/` is not
    in the npm package, so phrase it as "in the repository").

### package.json
- name `@toptensoftware/button-face`, version `0.0.1`, description "Layered
  button image renderer (fill, SVG and text layers) for Node and the browser",
  `"type": "module"`, licence `MIT`, author "Topten Software", repo
  `git+https://github.com/toptensoftware/button-face.git`.
- `engines.node >= 24`. No `bin`. No peerDependencies.
- `exports`: `"."` -> `./src/index.js` (portable core), `"./node"` ->
  `./src/node.js` (Node entry). `files`: `src/`, `LICENSE` (npm also adds
  README.md, package.json).
- `dependencies`: `@napi-rs/canvas ^1.1.1` (Skia, prebuilt binaries, no system
  deps). Only imported by `src/backends/napi.js` (Node entry).
- scripts: `test` (`node --test`), `build:icons` (regenerate `src/icons.js`),
  `samples` (render PNGs + contact sheet to `scratch/samples/`, gitignored).

### Public API - core entry `@toptensoftware/button-face` (`src/index.js`)
Browser-safe (no Node imports; enforced by `test/api.test.js`). Exports:
- **`render(definition, width, height, { backend, resolveSvg?, channels = 3 })`**
  -> `Promise<{ data: Uint8Array, width, height, channels }>`.
  - `width`/`height`: device px, positive integers (else `RangeError`).
  - `backend` required: `{ createCanvas(w, h), loadSvgImage(svg, w, h) }`
    (else `TypeError`).
  - `resolveSvg(src) => Promise<string>`: needed only by svg layers using `src`.
  - `channels`: `3` = RGB composited over black (default), `4` = RGBA
    (non-premultiplied, from `getImageData`). Else `RangeError`.
  - `data` is row-major, `channels` bytes per pixel, no padding.
  - Layers are all prepared (validated + async loading) concurrently, then
    painted bottom-to-top in array order; any layer error rejects the whole
    render before anything is drawn.
- `layerTypes` - frozen registry `{ fill, svg, text }` (read-only; no custom
  layer registration API).
- `createSvgResolver({ prefixes?, fallback? })` -> `async (src) => svgString`.
  `#` (built-ins) registered by default; `prefixes` (object or `Map`) add or
  replace handlers, `null` removes one; longest matching prefix wins; handler
  gets `src` with the prefix stripped (query string untouched); `fallback`
  gets the whole `src` when no prefix matches; neither -> rejects
  `no SVG resolver for '<src>'`. Handlers may be sync or async, must return
  an SVG string, report errors by throwing.
- `resolveBuiltinIcon(name)` - the `#` handler (`unknown built-in icon '#x'`).
- `icons` - frozen `{ name: svgString }` of the 42 built-ins.
- Colour helpers (`src/color.js`): `parseColor(css) -> {r,g,b,a}|null`,
  `colorsEqual(a, b)`, `formatColor({r,g,b,a})` (`#rrggbb` or `rgba(...)`),
  `namedColors` (148 names).
- SVG string helpers (`src/recolor.js`): `applyColorMap(svg, map)`,
  `lookupColor(map, value)`, `mapPaintValues(svg, fn)`,
  `findPaintValues(svg)`, `getRootAttribute(svg, name)`,
  `setRootAttribute(svg, name, value)`, `setRootColor(svg, color)`,
  `substituteText(svg, text)`, `normalizeStyleLengths(svg)`.
- SVG size helpers (`src/svgSize.js`): `getSvgSize(svg)`,
  `padViewBox(svg, fraction)`, `parseViewBox(v)`, `parseLength(v)`.
- Scaling (`src/scale.js`): `createScaler(virtualSize, w, h)`,
  `scaleFont(font, scale)`, `DEFAULT_VIRTUAL_SIZE` (`{72, 72}`).
- `wrapLines(text, measure, maxWidth)` - the text layer's word wrapper.
- `convertLegacyDefinition(old)` - see "Legacy converter".
- Material Symbols (`src/material.js`): `createMaterialResolver(options)`,
  `MATERIAL_DEFAULTS`, `validateMaterialParams`, `parseMaterialRef`,
  `materialVariant`, `materialIconUrl`, `materialCacheKey`.
- `createStorageCache({ storage?, prefix = "button-face:material:" })` -
  `{ get, set }` string cache over Web Storage (default
  `globalThis.localStorage`, looked up lazily; any error = not cached).
- README should present `render`, `createSvgResolver`, `createMaterialResolver`,
  `createStorageCache`, `convertLegacyDefinition`, `icons` as the main API and
  list the rest briefly as "utilities" (one line each).

### Public API - Node entry `@toptensoftware/button-face/node` (`src/node.js`)
- Re-exports everything from the core, plus:
- **`render(definition, width, height, options?)`** - same as core but
  `backend` defaults to `napiBackend` and `resolveSvg` to the default Node
  resolver (defaults applied with `??`).
- `napiBackend` - frozen `{ createCanvas, loadSvgImage }` over
  `@napi-rs/canvas`; `loadSvgImage` runs `normalizeStyleLengths` first (Skia
  unitless `stroke-width` fix).
- `createNodeSvgResolver({ baseDir?, prefixes?, material? })`: `#` built-ins,
  `@` Material Symbols (fs-cached), extra `prefixes` (win over defaults;
  `"@": null` removes Material), and everything else read as a **file path**
  relative to `baseDir` (default cwd at resolve time). `material`: options for
  `createMaterialResolver` plus `cacheDir`, or `false` to not register `@`.
- `resolveSvg` - default instance (`createNodeSvgResolver()`).
- `createFileResolver({ baseDir? })` - reads SVG files (BOM stripped, otherwise
  unchanged); missing file rejects with the fs error (`ENOENT`).
- `createFsCache({ dir? })` - `{ get, set, dir }` directory cache, default
  `<os.tmpdir()>/button-face/material`, keys `/`-separated `[a-z0-9_-]`
  segments, atomic writes.

### Definition shape
```js
{
  virtualSize: { width: 72, height: 72 },   // optional, default 72x72
  layers: [ /* painted bottom to top */ ]   // optional, missing = no layers
}
```
Plain JSON-serialisable. No layers -> black (RGB) or transparent (RGBA).
`virtualSize` dims must be > 0 (`RangeError`).

Common to every layer (handled by the core):
- `type` (required string): `"fill" | "svg" | "text"`; unknown -> `TypeError`.
- `visible` (boolean, default `true`): `false` skips the layer.
- `opacity` (number 0..1, default `1`): multiplies the layer's alpha; `0`
  skips it. Hidden / opacity-0 layers are not validated further.

**fill** (`src/layers/fill.js`) - paints the whole button.
- `color` (CSS colour, default `"black"`).

**svg** (`src/layers/svg.js`) - draws an SVG, centred.
- `src` (string): reference resolved by `resolveSvg` (`#name`, `@name?...`,
  file path in Node). **Exactly one of `src` / `svg`.**
- `svg` (string): inline SVG markup.
- `text` (string | number): replaces every literal `$(x)` in the SVG (not
  XML-escaped; empty/null = no substitution; `0` substitutes).
- `colors` (object or Map `{ from: to }`): colour map applied to paint values
  (`fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color`, `color` as
  attributes, `style=""` declarations or `<style>` rules). Keys must be
  colours (else `TypeError`); matching is normalised (`#848484` ==
  `rgb(132,132,132)` == `#848484ff`); first match wins; values emitted as
  given (may be any CSS colour or e.g. `currentColor`); not re-mapped (swaps
  work). `url()`, `none`, ids never touched.
- `color` (CSS colour, default `"#848484"`): root `color` attribute = what
  `currentColor` resolves to. Always written (overrides an author's own root
  `color`).
- `tint` (CSS colour, optional): paints every non-transparent pixel this
  colour keeping alpha (monochromes multi-colour icons; tint alpha multiplies).
- `scale` (number > 0, default `1`): drawn height = **device** button height x
  scale; width keeps the SVG's aspect ratio. Independent of `virtualSize`.
- `translate` (`{ x?, y? }`, virtual px): offset from centre.
- Pipeline: resolve -> `$(x)` substitution -> colour map -> root colour ->
  size (aspect from width/height/viewBox) -> decode -> tint -> draw. Sizes
  and position rounded (half up); parts outside the button are clipped; a size
  rounding to 0 draws nothing.
- Missing resolver for `src` -> `TypeError "svg layer: 'src' (...) needs
  options.resolveSvg"`.

**text** (`src/layers/text.js`) - word-wrapped, aligned text.
- `text` (string | number): empty/missing = draws nothing. `\n`/`\r\n` force a
  break; wraps on spaces; an over-wide word gets its own line (not clipped).
- `font` (CSS font string, default `"bold 16px sans-serif"`): must contain a
  `NNpx` size (virtual px; scaled by the Y scale only). Font family must be
  available to the renderer (system fonts in Node/Skia; page fonts in browser).
- `color` (CSS colour, default `"white"`).
- `align` (`"left" | "center" | "right"`, default `"center"`).
- `valign` (`"top" | "center" | "bottom"`, default `"center"`).
- `lineSpacing` (number > 0, default `1`): line-height multiplier. Base line
  height = ink height of "Xy" x1.1 (x1.2 at >= 40px).
- `padding` (virtual px, default `3`): number | `[topBottom, leftRight]` |
  `[top, right, bottom, left]`.
- `translate` (`{ x?, y? }`, virtual px): offset of the text block.
- Measuring and drawing use the same canvas context, so wrapping matches the
  renderer's font engine.

Validation: all errors are `TypeError`/`RangeError` with messages prefixed by
the layer type (e.g. `svg layer: invalid tint 'nope'`), rejected from
`render` (it is async). Strict: unknown colours, bad align, `lineSpacing: 0`,
`scale: 0` all reject.

### Colour formats (`src/color.js` `parseColor`)
Accepted anywhere a colour is expected (`color`, `tint`, `colors` keys):
- `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (any case);
- `rgb()`/`rgba()` (aliases; comma syntax with optional 4th alpha, or space
  syntax with `/ alpha`; numbers or %; out-of-range clamps);
- `hsl()`/`hsla()` (hue with deg/grad/rad/turn or unitless; s/l must be %);
- the 148 CSS named colours (case-insensitive) and `transparent`.
Not accepted: `currentColor`, `none`, `hwb()`, `lab()`, `oklch()`, `color()`,
`var()`. Leading/trailing whitespace ignored. Alpha compared at 8-bit
precision for map matching.

### Recolouring model (svg layer) - the key concept to explain
- Built-in and Material icons are "monochrome" sources normalised to
  `currentColor`, so `color` recolours them: `{ src: "#play", color: "red" }`.
- Uniform rule: `currentColor` counts as the effective `color` (default
  `#848484`) for the colour map - if a `colors` key matches `color`, the root
  colour becomes the mapped value. So `colors: { "#848484": "red" }` recolours
  built-ins, Material icons **and** user SVGs painted `#848484` the same way;
  `{ color: "red", colors: { red: "blue" } }` draws `currentColor` blue.
  A map value that isn't a colour (e.g. `"currentColor"`) leaves the root
  colour unchanged.
- `#848484` is the conventional "recolour key" grey (old project heritage);
  default `color` is the same grey so unrecoloured icons look as before.
- Multi-colour parts (e.g. hdd's red dot, steam/playstation logos) are fixed
  colours, not `currentColor` - unaffected by `color`; use `colors` to remap
  specific colours or `tint` to monochrome everything.
- Gotcha: an element-level `color` attribute/style in a user SVG overrides the
  root `color` for `currentColor` inside it.

### Units and scaling (`src/scale.js`)
- Definitions are authored in **virtual pixels** of a `virtualSize` button
  (default 72x72), rendered at any device size: `sx = width / vw`,
  `sy = height / vh`.
- Scaled values: `translate` (svg + text: x by sx, y by sy), text `padding`
  (top/bottom by sy, left/right by sx), font px size (by **sy only**).
- svg `scale` is a fraction of the device height, independent of
  `virtualSize`; SVG natural size only supplies the aspect ratio.
- Example: virtual 72, `translate: { y: -7 }` is ~10% of the height at any
  size (-7 px at 72, -14 px at 144).
- Non-square buttons: set `virtualSize` to match the aspect (e.g. 144x72 device
  with `virtualSize: { width: 144, height: 72 }`), otherwise x/y scale
  differently and fonts follow height only (text may look narrow/wide
  relative to padding).

### Built-in icons
- 42 icons, referenced as `src: "#name"`: add, apple-tv, apps, arrow-down,
  arrow-left, arrow-right, arrow-up, cancel, cancel-circle, check, circle,
  cross, delete, diamond, forward, function, guide, hdd, heart, home, info,
  list, next-track, ok, option, pause, play, play-pause, playstation, power,
  previous-track, refresh, rewind, settings, square, star, steam, stop,
  triangle, volume-down, volume-mute, volume-up.
- Listed at runtime by `Object.keys(icons)`.
- Sources `icons/*.svg` (repo only, not shipped), grey `#848484` key ->
  generated `src/icons.js` (`#848484` -> `currentColor`). Default colour grey
  `#848484`; recolour with `color` or `colors: { "#848484": c }`.
- Fixed-colour parts: `hdd` (red dot), `steam`, `playstation` (logo colours),
  `apple-tv` (stop colours present but renders uniform grey in practice).
- Some are outlines (heart = Material `favorite_border`, square, circle).
- 28 use the Material padded viewBox `-144 -1104 1248 1248` (Material
  Symbols Outlined wght 200 derived, padded 15%/side); 14 are Inkscape-drawn
  (arrows, check, circle, cross, diamond, home, ok, square, star, triangle...).
- All are filled paths only (no strokes/text) - project rule for contributors.
- Viewing them: `npm run samples` (from a repo clone) writes PNGs + 
  `scratch/samples/contact-sheet.png` (gitignored - **no image in the repo**
  for the README to link; see Flagged assumptions). Groups: icons-default,
  icons-color, icon-categories, recolour, text-align, text-misc, combos, sizes.
- Contributor note: edit `icons/*.svg` then `npm run build:icons`; a test
  fails if `src/icons.js` is stale; convert strokes/text with
  `node scripts/to-paths.js icons/<name>.svg` (needs Inkscape).

### Material Symbols icons (`src/material.js`)
Existing README section is accurate - summary for re-homing:
- `src: "@name?style=&fill=&weight=&grade=&size="`, name lowercase snake_case
  (`[a-z0-9_]+`), settings optional, any order, lowercase, once each; trailing
  `?` allowed.
- Settings/defaults: style `outlined|rounded|sharp` (outlined); fill `0|1|
  true|false` (0); weight 100..700 in 100s (**200**, not Google's 400, to match
  built-ins - `@add` looks like `#add`); grade `-25|0|200` (0); size (optical)
  `20|24|40|48` (24).
- Normalised: root `fill="currentColor"` + viewBox padded 15%/side (`pad`
  option; `pad: 0` = unpadded) -> colour/scale like built-ins.
- Downloaded with `fetch` from `https://fonts.gstatic.com/s/i/short-term/
  release/materialsymbols{style}/{name}/{variant}/{size}px.svg` (CORS `*`,
  undocumented URL - override with `url`). Concurrent identical requests share
  one download; held in memory for the resolver's lifetime.
- Cache: Node entry -> disk `<os.tmpdir()>/button-face/material/<style>/<name>/
  <variant>/<size>.svg` (`material: { cacheDir }`, or `material: false`);
  core/browser default -> `localStorage` keys `button-face:material:...`
  (no-op if unavailable/full). Never refreshed. Cache failures are ignored.
  Offline: cached icons work; uncached fail "could not download material icon
  ...". Unknown icon/setting combo: "unknown material icon ... (HTTP 404 ...)".
  Invalid names/settings rejected before any download.
- `createMaterialResolver({ fetch, cache, url, defaults, pad = 0.15 })`:
  `cache` any `{ get, set }` (promises), `null` = memory only, `undefined` =
  `createStorageCache()`; `defaults` e.g. `{ weight: 400 }` validated at
  creation; cache key ignores `url`.
- Licence: Material Symbols (c) Google, Apache-2.0, downloaded at runtime, not
  bundled. (The built-in Material-derived icons ARE bundled - see Licence.)
- Live network tests: `BUTTON_FACE_LIVE_TESTS=1 node --test
  test/material-live.test.js` (contributor detail, optional in README).

### Browser / bundler usage
- **UPDATED (Plan phase, after commit 317441d):** the core now exports
  `browserBackend` (`src/backends/browser.js`) and it is tested in real
  Chrome/Edge, Firefox and WebKit (`test/browser*.test.js`, pixel-compared
  against Node in `test/browser-compare.test.js`). No hand-written example
  backend is needed in the README. Browser usage:
  `render(def, w, h, { backend: browserBackend, resolveSvg:
  createSvgResolver({ prefixes: { "@": createMaterialResolver() } }) })`.
- `browserBackend` caveats (from its header comment): `createCanvas` uses
  `OffscreenCanvas`, else a `<canvas>`; `loadSvgImage` decodes via Blob URL +
  `Image.decode()` so it needs a page's **main thread** (no `Image` in Web
  Workers); text layers use the page's fonts - load web fonts first (e.g.
  `await document.fonts.load("bold 16px MyFont")`) or a fallback is used; SVGs
  decoded as images can't load external resources (web fonts, `<image href>`,
  external CSS), unlike Node. SVGs are passed through `prepareSvgImage`
  (adds missing `xmlns`/viewBox, stamps width/height) automatically.
- Custom backends are still possible: an object `{ createCanvas(w, h),
  loadSvgImage(svg, w, h) }` (contract in `src/backend.js`: transparent canvas
  with `getContext("2d")`; `loadSvgImage` resolves a `drawImage`-able source
  rendered crisply at w x h, rejects if undecodable). Mention briefly in the
  reference only.
- Demo: `npm run samples:browser` (repo clone) serves a page on port 8080
  rendering every sample with `browserBackend` beside the Node PNGs.
- Resolvers in the browser: `createSvgResolver()` gives `#` only; add
  `"@": createMaterialResolver()` (uses global `fetch` + `localStorage`); no
  file fallback - user can supply a `fallback`/prefix that `fetch`es URLs.
  Core `render` has **no default resolver** - pass `resolveSvg` explicitly.
- Output -> canvas: use `channels: 4` and
  `new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset,
  data.byteLength), width, height)` + `putImageData`.
- Bundlers: plain ESM, no build step, no pre-bundled package; import
  `@toptensoftware/button-face` (never `/node` in browser code). Core imports
  nothing external. `src/icons.js` (~70 KB) comes along with the resolver.
  `@napi-rs/canvas` is still a regular npm dependency, so `npm install`
  downloads it even for web-only use (bundlers won't include it).

### Node usage notes
- Simplest: `import { render } from "@toptensoftware/button-face/node"`;
  `await render(def, 72, 72)` -> raw RGB for e.g. a Stream Deck
  `fillKeyBuffer`. Use `channels: 4` for RGBA.
- Saving a PNG (no helper in the API): `napiBackend.createCanvas(w, h)`,
  `ctx.createImageData` / `putImageData` (RGBA), `canvas.toBuffer("image/png")`
  - uses napi-canvas extras beyond the Backend contract (as
  `scripts/render-samples.js` does).
- File paths in `src` are relative to cwd (or `baseDir`); text fonts are the
  system's installed fonts (Skia).

### Legacy converter (`src/legacy.js`) - "Migrating from node-buttonImage"
`convertLegacyDefinition(old)` maps old `ButtonImage` options (or an instance)
to a layered definition; pure, no validation (render validates), non-object
-> `TypeError`. Mapping:
- `virtualSize` -> `definition.virtualSize`
- `backColor` (default black) -> first `{ type: "fill", color }`
- `svgCode` -> svg `svg` (wins over `svgFile`); `svgFile` -> svg `src`
- `svgText` -> svg `text`; `svgForeColor` -> svg `colors: { "#848484": c }`
- `svgScale` / `svgTranslate` -> svg `scale` / `translate`
- `text` -> last `{ type: "text", text: String(text) }`; `textColor`,
  `textAlign`, `textVAlign`, `font`, `textLineSpacing`, `textPadding`,
  `textTranslate` -> `color`, `align`, `valign`, `font`, `lineSpacing`,
  `padding`, `translate`.
- Ignored: `channels` (pass to `render`), `states`/`state` (not supported -
  render separate definitions), `onInvalidate`, unknown keys.
- Behaviour differences: stricter colour validation; colour map is normalised
  and paint-context only (old was literal text replace); render engine is
  Skia not librsvg/Pango (tiny pixel differences).

### Other topics worth documenting
- Async: `render` and resolvers are async; layers load in parallel.
- Errors: strict validation, clear prefixed messages (see above).
- Fonts: text uses whatever fonts the platform has; built-in icons need none.
- SVG authoring notes (existing section).
- Performance/caching: no render cache (callers cache results themselves);
  Material downloads cached.
- Tests: `npm test` (node:test), contributor section with `build:icons`,
  `samples`, `to-paths.js`.

### Rationale (from old project + complete-* docs)
- Old project `node-buttonImage` (MIT, Topten Software): "A library for
  generating button images for StreamDeck and similar devices" - one flat
  property set (`backColor`, `svgFile`, `svgForeColor`, `text`...), sharp +
  node-canvas (Node-only), `ButtonImage` class with states/caching.
- button-face is a fresh break-away (complete-initial Description): typed
  layers instead of fixed properties; better recolouring (colour maps,
  `currentColor`, tint vs a hard-coded literal grey replace); one Canvas-2D
  renderer that can run in Node and the browser (single native dep
  `@napi-rs/canvas`, no sharp/node-canvas); resolution independence via
  virtual pixels kept; built-in icons kept; caching/state management left to
  the caller; Material Symbols by name (no manual download/patching).
- Use cases: raw pixel buffers for hardware button displays (Stream Deck
  style `fillKeyBuffer`, RGB default), plus RGBA for UIs/previews.

### Licence
- `LICENSE`: MIT, "Copyright © 2026 Topten Software".
- Material Symbols: Apache-2.0 (c) Google, downloaded at runtime, not bundled.
- Built-in icons: 28 Material-derived (Material Symbols Outlined wght 200 -
  Apache-2.0) **are bundled** in `src/icons.js`; the rest drawn for the old
  project; `steam`, `playstation`, `apple-tv` are third-party brand logos
  (trademarks of their owners). No attribution file exists in the repo.

### Rule 4 candidates (docs vs code gaps - propose, don't apply)
1. ~~CLAUDE.md missing legacy/recolouring/material notes~~ - incorrect:
   already applied (CLAUDE.md Architecture, commits 67fce62 and 013cf2f).
2. `package.json` description says "for Node and the browser" but no browser
   backend ships and the browser path is untested.
3. `@napi-rs/canvas` is a hard `dependency` - web-only users still install it.
   Could be an optional/peer dependency (code change - out of scope here).
4. Built-in icon provenance/licensing (Apache-2.0 Material derivatives, brand
   logos) isn't recorded anywhere (no NOTICE/attribution).
5. README "SVG authoring notes" mentions `scripts/to-paths.js`, which isn't in
   the npm package - fine for repo readers, but should say "in the repository".

### Decisions (user, after Investigate)
- **Install command:** `npm install toptensoftware/button-face` (installs from
  GitHub; the package will not be published to npm or elsewhere).
- All flagged assumptions below are confirmed (except the install command,
  replaced above).
- Rule 4 candidates: package.json description - leave as is; `@napi-rs/canvas`
  as a required dependency - OK; built-in icon provenance/licensing - ignore.
- Planning deferred - the user will start the Plan phase later.

### Planning notes (Plan phase)
- Notes above were written before commit 317441d (browser backend). Also new
  since then: core exports `getViewBox`, `prepareSvgImage` (svgSize
  utilities); `npm run samples:browser` script; `playwright-core`
  devDependency; browser tests (see CLAUDE.md "Building and testing").
- The Description's "only really tested the node version" is now out of date;
  the README can state browser support plainly (no "untested" label).
- No test reads README.md (only a comment in `test/backend.test.js:44` points
  at the "SVG authoring notes" section - keep that heading name).
- TDD: a README can't be unit-tested. Instead, the final step extracts the
  README's Node code examples into a throwaway `scratch/` script and runs
  them to prove they work (scratch/ is gitignored; nothing committed).
- Write the README in sections across steps; each step leaves README.md a
  valid (if incomplete) document. Steps 1-8 append/replace sections; the two
  existing sections stay at the bottom until steps 6/7 re-home them.
- Spelling: code identifiers are US (`color`, `colors`); prose can use either
  but be consistent - use US "color" in the README to match the API.

### Implement notes
- Steps 1-9 written by one agent in a single pass (README.md fully
  rewritten; old "Material Symbols icons" and "SVG authoring notes" sections
  re-homed under Usage guide, old copies gone).
- Headings use "and" rather than "&" ("Definitions and layers", "Units and
  scaling", "SVG sources and resolvers") for clean GitHub anchors; a
  Contents list links every section. Advanced Material anchor:
  `#advanced-custom-material-resolvers`.
- Node-buttonImage repo URL taken from its package.json:
  https://github.com/toptensoftware/node-buttonImage.
- Examples for step 10 to verify: synopsis, quick start (Node + browser),
  layer examples, combined button (uses an undefined `isDisabled` -
  define it when extracting), error example (`svg layer: invalid tint
  'nope'`), colors table examples (`#fa08`, `rgb(255 170 0 / 0.5)`,
  `hsl(40deg 100% 50% / 0.5)`, `hsl(0.1turn 100% 50%)`), recolor examples
  (use files `icons/mute.svg`, `logo.svg` - substitute inline SVG), Material
  (`@mic_off?fill=1` - network), PNG save via `napiBackend`,
  `createNodeSvgResolver` example (`./assets/icons/mute.svg`),
  `convertLegacyDefinition` example (`icons/mute.svg`).
- npm test after steps 1-9: 897 tests, 892 pass, 0 fail, 5 skipped.
- Step 10 (verify + polish):
  - `scratch/readme-examples.js` (gitignored) runs all 17 Node-runnable
    README examples via the package self-reference
    `@toptensoftware/button-face/node`, chdir'd into
    `scratch/readme-fixtures/` (fixture `icons/mute.svg`, `logo.svg`,
    `assets/icons/mute.svg`). `@` examples use
    `createNodeSvgResolver({ material: { fetch: fakeFetch, cacheDir } })`
    (no network; the fake cache dir is wiped each run). `isDisabled` run as
    both true and false. All pass. Extra checks: error message
    `svg layer: invalid tint 'nope'` (TypeError) exact; every color in the
    colors table parses and every "not accepted" form returns null
    (`hsl(40, 100, 50)` too); out-of-range clamps; 148 named colors +
    `transparent`; `colors: {"#848484": "white"}` renders identically to
    `color: "white"` on `#volume-mute`; color-map swap on `logo.svg`;
    `{ color: "red", colors: { red: "blue" } }` draws blue; `translate:
    { y: -7 }` moves 7 px at 72 and 14 px at 144; `Object.keys(icons)`
    equals the README's 42 names; Material URLs (`wght700fill1`, rounded;
    `defaults: { weight: 400 }` -> `default` variant; `pad: 0` unpadded);
    `material: false` falls through to files; PNG save works;
    legacy converter gives fill/svg/text layers.
  - Every quoted error message checked against `src/` (material 404 /
    "could not download", "no SVG resolver for '...'", svg/needs
    resolveSvg wording) - all match.
  - Browser examples match `src/backends/browser.js` (OffscreenCanvas or
    `<canvas>`, `Image` main-thread only, fonts, no external resources,
    `prepareSvgImage`) and `scripts/browser-demo/demo.js` (same
    `render` + `browserBackend` + `createSvgResolver()` + `putImageData`
    pattern; the demo uses channels 3 + `toRgba`, README uses
    `channels: 4` directly - both valid). Core exports all appear in the
    README's API tables.
  - Anchors: all 20 `#...` links match GitHub heading slugs. No
    placeholders left. `SVG authoring notes` heading kept (referenced by
    `test/backend.test.js`).
  - README fixes: "grey" -> "gray" (6 places, US spelling to match
    "color"); DRY - removed the duplicated "`#add` and `@add` look
    identical" / 15% padding claim from Built-in icons (kept once in
    Material Symbols, cross-linked); Development "Adding a built-in icon"
    now cross-links SVG authoring notes. No example needed code changes.
  - npm test after step 10: 897 tests, 892 pass, 0 fail, 5 skipped.

### Rule 4 proposals (step 10 - not applied)
1. CLAUDE.md: add a line under Architecture or Building and testing:
   "README.md is the user guide (usage + reference tables for every layer
   property and export); update it when public options, exports, defaults or
   error messages change." Nothing currently ties API changes to the README.
2. Earlier Rule 4 candidates 2 and 5 are now resolved: the package does
   ship and test a browser backend (package.json description is accurate),
   and the README says `scripts/to-paths.js` is "in the repository".

## Flagged assumptions
- (Step 10) Changed "grey" to "gray" throughout the README prose for
  consistent US spelling (the brief only named "color").
- (Step 10) Browser-only examples (Quick start browser, browser resolver
  `fallback` with real `fetch`) weren't run in a browser; they were checked by
  reading against `browser.js` / `demo.js`, and the resolver's `my:` prefix +
  fallback logic was run in Node with a fake fetch.
- (Implement) Reference tables give `translate` default as "-" (centered /
  no offset) rather than `{ x: 0, y: 0 }`; `layers` default shown as `[]`.
- (Implement) Utility one-liners for `validateMaterialParams` /
  `parseMaterialRef` omit their optional second args (`where`, `defaults`).
- (Implement) License section says "many" built-ins are Material-derived
  (28 of 42) and bundled under Apache-2.0, without listing which.
- (Implement) Quick start Node example mentions Stream Deck `fillKeyBuffer`
  only in prose (no third-party API code).
- ~~Installation command is `npm install @toptensoftware/button-face`~~ -
  superseded by the user decision: `npm install toptensoftware/button-face`.
  Imports still use the package name `@toptensoftware/button-face`.
- (Plan) README prose uses US spelling ("color") to match the API names.
- (Plan) README order: Synopsis, Features, Rationale, Installation, Quick
  start, Usage guide (Definitions & layers, Colors, Recoloring SVGs, Units &
  scaling, Built-in icons, Material Symbols, SVG sources & resolvers,
  Browser, Node, SVG authoring notes, Migrating from node-buttonImage),
  Reference (definition, layers, API), Development, License.
- Rationale (Stream Deck-style hardware buttons, break-away from
  node-buttonImage, browser goal) inferred from the old README and the
  complete-* docs.
- ~~The README's browser backend example is untested~~ - obsolete: the
  package now ships a tested `browserBackend`.
- No contact-sheet image exists in the repo (scratch/ is gitignored), so the
  README will describe `npm run samples` rather than embed an image. (Option:
  commit a small icon-sheet PNG under e.g. `docs/` - would need the user's OK.)
- Brand-icon/Material-derived icon licensing note in the README is our best
  understanding, not legal advice; wording to be reviewed by the user.
- Utility exports (colour/recolor/svgSize/scale/material builders) get one
  line each, not full docs.
- The README replaces the current file entirely (keeping the two existing
  sections' content, re-homed).

## Plan
Each step edits only README.md (plus ticking this document). "Build" for
these steps = `npm test` still 0 failures (README changes can't break it, but
run it at least in step 10). Examples must use only options documented in
*Notes*; cross-check `src/layers/*.js` headers if unsure.

- [x] 1. **Skeleton + front matter.** Replace the `# button-face` heading
  area with: title, one-paragraph synopsis, Features (bullets), Rationale
  (short, incl. node-buttonImage heritage), Installation
  (`npm install toptensoftware/button-face`, Node >= 24, `@napi-rs/canvas`
  prebuilt/no system deps, bundler note: plain ESM, no pre-built bundle,
  import the core entry in browser code, never `/node`), and License (MIT +
  Material Symbols Apache-2.0 note + brand-logo trademark note). Add empty
  placeholder headings for the remaining sections in the order from
  *Flagged assumptions*. Leave the two existing sections at the bottom.
- [x] 2. **Quick start + Definitions & layers.** Quick start: one Node
  example (render to RGB buffer, e.g. Stream Deck `fillKeyBuffer`) and one
  browser example (`browserBackend`, `channels: 4`, `putImageData` onto a
  `<canvas>`). Definitions & layers: definition shape, layer order,
  common props (`type`, `visible`, `opacity`), one short example per layer
  type (fill, svg, text) and a combined button; async/parallel loading;
  strict validation and error message style.
- [x] 3. **Colors + Recoloring SVGs.** Accepted color formats (and what is
  not accepted). Recoloring model: `color`/`currentColor`, the `#848484` key,
  `colors` map (normalised matching, swaps, paint contexts), `tint`,
  fixed-colour parts, the element-level `color` gotcha. Examples for each.
- [x] 4. **Units & scaling.** Virtual pixels and `virtualSize`, which values
  scale (translate, padding, font by Y only), svg `scale` as a fraction of
  device height, the -7 / -14 example, non-square buttons. Rendering the
  same definition at several sizes example.
- [x] 5. **Built-in icons.** `#name` syntax, the 42 names (compact table or
  inline list), `Object.keys(icons)`, default grey + recoloring, fixed-colour
  icons, outline icons, `npm run samples` / `samples:browser` for a visual
  sheet (repo clone).
- [x] 6. **Material Symbols.** Re-home the existing "Material Symbols icons"
  section under the usage guide (syntax, settings table, weight 200 default,
  coloring, `pad`, caching Node/browser, offline/errors), with
  custom-resolver/network-URL detail moved into an "Advanced" sub-part.
  Remove the old copy at the bottom.
- [x] 7. **SVG sources & resolvers, Browser, Node, SVG authoring notes,
  Migrating.** Resolvers: `#`/`@`/file paths, `createSvgResolver`
  (prefixes, longest match, `null` removes, fallback e.g. fetching URLs),
  `createNodeSvgResolver` (`baseDir`, `material: { cacheDir } | false`), core
  render has no default resolver. Browser: `browserBackend` caveats (main
  thread, fonts, no external resources), Material + localStorage cache,
  output to canvas. Node: defaults, file paths relative to cwd, system fonts,
  saving a PNG via `napiBackend` canvas. Re-home "SVG authoring notes" (keep
  that exact heading; say `scripts/to-paths.js` is "in the repository").
  Migrating from node-buttonImage: `convertLegacyDefinition` mapping table,
  ignored options, behaviour differences. Remove the old copies.
- [x] 8. **Reference.** Tiny tables, one sentence per property: definition
  (`virtualSize`, `layers`), common layer props, fill, svg, text (type +
  default + sentence). API: core entry main exports (`render`,
  `browserBackend`, `createSvgResolver`, `createMaterialResolver`,
  `createStorageCache`, `convertLegacyDefinition`, `icons`), `render`
  options and result, Node entry (`render` defaults, `napiBackend`,
  `createNodeSvgResolver`, `resolveSvg`, `createFileResolver`,
  `createFsCache`), Backend contract (2 lines), and utilities one line each.
- [x] 9. **Development.** Clone + `npm install`, `npm test`, browser tests
  (Playwright engines, `BUTTON_FACE_BROWSER_TESTS`, installing
  Firefox/WebKit), live Material tests (`BUTTON_FACE_LIVE_TESTS=1`),
  `npm run samples`, `npm run samples:browser`, adding built-in icons
  (`icons/*.svg`, `npm run build:icons`, filled paths only, `to-paths.js`).
- [x] 10. **Verify + polish.** Copy every Node-runnable README example into
  `scratch/readme-examples.js` (gitignored, not committed), run it and fix
  any example that fails or contradicts the code. Check browser examples by
  reading against `src/backends/browser.js` and `scripts/browser-demo/demo.js`.
  Read the whole README for consistency, broken anchors, duplicated content
  (DRY: each fact documented once, cross-linked) and leftover placeholders.
  Run `npm test` (0 failures). Propose any Rule 4 doc updates found.
