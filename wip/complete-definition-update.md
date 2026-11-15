# Update old definitions to layered

Status: Complete

## Description
Add the ability to convert an image definition from the old project
(`node-buttonImage`) to the new layered definitions used by button-face.

## Notes

### Old format (C:\Users\Brad\Projects\node-buttonImage, read-only)
- A definition is a flat options object, used two ways:
  - `new ButtonImage(options)` (`ButtonImage.js`) - `Object.assign(this, options)`
    through private-field setters, **with defaults**; `render(w, h, channels)`
    shallow-merges `states[state]` over the base and calls `drawButton`.
  - `drawButton(width, height, options)` (`drawButton.js`) - the renderer,
    **without** most ButtonImage defaults (readme: "same settings as
    ButtonImage class, plus `channels`").
- Full detail of the rendering maths is in `wip/complete-initial.md`
  ("Old rendering pipeline (drawButton.js) - exact semantics"). Properties:

| Old prop | Type | ButtonImage default | drawButton handling |
|---|---|---|---|
| `virtualSize` | `{width,height}` | 72x72 | `?? {72,72}` |
| `backColor` | CSS colour (sharp/color-string) | `"black"` | `?? "black"`, always painted full-size |
| `svgFile` | `"#name"` (built-in `images/name.svg`) or file path (cwd-relative, `fs.readFileSync` at **set time**) | undefined | **ignored** - setter loads the file into `svgCode`; falsy -> `svgCode = null` |
| `svgCode` | SVG string | undefined | drawn only if truthy |
| `svgText` | string | null | `if (svgText)` -> literal replace of every `$(x)` (falsy, e.g. `0`/`""`, does nothing) |
| `svgForeColor` | string | null | `if (svgForeColor)` -> literal, case-sensitive `svg.replace(/#848484/g, c)` **anywhere in the text** (after svgText) |
| `svgScale` | number | 1 | `?? 1`; drawn height = device height x scale |
| `svgTranslate` | `{x?,y?}` virtual px | null | `?.x ?? 0` |
| `text` | string | null | drawn only if truthy and `!= ""` |
| `textColor` | CSS colour | `"white"` | passed through; drawText default `#ffffff` only for undefined (null -> canvas ignores -> black) |
| `textAlign` | left/center/right | center | invalid -> canvas ignores, x = left padding |
| `textVAlign` | top/center/bottom | center | other -> treated as top |
| `font` | CSS font with px size | `"bold 16px sans-serif"` | `?? default`, scaled by scaleY |
| `textLineSpacing` | number | 1 | `if (lineSpacing)` -> 0/falsy = 1 |
| `textPadding` | number \| `[tb, lr]` \| `[t,r,b,l]` | 3 | **no default** in drawButton (undefined -> NaN padding). Legacy bug: a 4-element array is mutated in place (scaled) each render |
| `textTranslate` | `{x?,y?}` virtual px | null | `?.x ?? 0` |
| `channels` | 3 \| 4 | (render arg) | output format, not appearance |
| `states` | `{ [name]: partialOptions }` | undefined | ButtonImage only: `resolvedState` = `state` if `states[state] !== undefined`, else `"normal"`; merge is `Object.assign(clone(base), states[rs])` **only when rs != "normal"** (so a `states.normal` entry is never applied) |
| `state` | string | `"normal"` | selects the state |
| `onInvalidate`, render cache | - | - | non-visual, drop |

- Layer order was fixed: background, then SVG (centred + translate, cropped),
  then text.
- Unused / irrelevant: `utils.getSvgSize` (dead), `StreamDeckDevice`/`Button`
  stubs, `test.js` (manual), `wrapLines.test.js` (only test).
- The 42 built-in names are identical in both projects (`icons/` here).

### Real-world old definitions (for test cases; read-only)
- `C:\Users\Brad\Projects\ControlBlock\host\src\bake\look.js` (`faceDef`,
  `foregroundDef`, `overrideLayer`): `backColor: "transparent"`; `svgCode`
  built at runtime (gradient face); `svgFile` `"#name"` or absolute path;
  `svgForeColor` default `"white"`; `svgScale`, `svgText`, `svgTranslate {x, y:-7}`;
  `text`, `textColor`, `textAlign`, `textVAlign` (bottom with icon),
  `font: "bold 11px sans-serif"`, `textPadding: [9, 4]`, `textTranslate`,
  `textLineSpacing`; non-square `virtualSize`.
- `ControlBlock/examples/demo.js` `iconDef` - same shape.
- `cantabile-streamdeck-demo/index.js` - `new ButtonImage({ svgFile: "#play" })`
  then mutating `svgForeColor` (null resets to grey).
- Old `test.js`: `{ backColor: "black", svgFile: "#apple-tv", svgForeColor:
  "#404040", svgTranslate: { y: -7 }, text: "Hello!", textColor: "white",
  textVAlign: "bottom", textAlign: "center" }`.

### New format (button-face)
- `Definition = { virtualSize?, layers?: Layer[] }` (`src/render.js`).
  Common layer props `visible` (bool), `opacity` (0..1), handled by the core.
- `fill` (`src/layers/fill.js`): `{ color = "black" }`.
- `svg` (`src/layers/svg.js`): `{ src | svg (exactly one), text, colors,
  color = "#848484", tint, scale = 1, translate }`. Pipeline: resolve ->
  `substituteText` (literal, substitutes any non-null incl. `0`) ->
  `applyColorMap(colors)` (normalised colour matching, paint contexts only) ->
  root `color` (always written) -> size/position exactly as old.
  Built-ins (`src/icons.js`) have `#848484` already converted to
  `currentColor`, so **currently** for `#name` icons only `color` recolours
  them and a `colors: {"#848484": c}` map is a no-op - Plan step 2 changes
  this (see "Decisions": uniform recolouring).
- `text` (`src/layers/text.js`): `{ text, font = "bold 16px sans-serif",
  color = "white", align, valign, lineSpacing = 1 (0 rejects), padding = 3,
  translate }` - same maths as old drawText.
- Resolution: `src` goes through `options.resolveSvg`; Node default
  (`src/node.js` `resolveSvg`) = `#name` built-ins + cwd-relative file
  fallback; core has only `#`. So `svgFile` paths work in Node as `src`.
- Validation is strict (bad colours/align/scale/lineSpacing reject); colours
  limited to `parseColor` syntaxes (hex, rgb/rgba, hsl/hsla, 148 names,
  `transparent`).
- `channels` is a render option (`render(def, w, h, { channels })`), not part
  of a definition.

### Mapping (old -> layered)
| Old | New | Notes |
|---|---|---|
| `virtualSize` | `definition.virtualSize` | copy if set |
| `backColor` (default black) | `{ type: "fill", color }` first layer | see assumption on `"transparent"` |
| `svgFile: "#name"` | svg `src: "#name"` | same names |
| `svgFile: path` | svg `src: path` | needs Node resolver (or custom fallback in browser); resolved at render time, not set time |
| `svgCode` | svg `svg` | |
| `svgText` (truthy only) | svg `text` | omit when falsy to keep old behaviour |
| `svgForeColor` (any source) | svg `colors: { "#848484": c }` | same for built-ins, files and `svgCode` - needs the svg layer change in "Decisions" below. New match is normalised + paint-context only (old: literal text anywhere) |
| `svgScale` | svg `scale` | omit when null/undefined |
| `svgTranslate` | svg `translate` | |
| `text` (truthy) | `{ type: "text", text: String(text) }` | |
| `textColor` | text `color` | |
| `textAlign` / `textVAlign` | text `align` / `valign` | |
| `font` | text `font` | |
| `textLineSpacing` (truthy) | text `lineSpacing` | omit 0/null (old treated as 1; new rejects 0) |
| `textPadding` | text `padding` | copy arrays (don't share the caller's array) |
| `textTranslate` | text `translate` | |
| `channels` | - | not part of a definition; drop (caller passes to render) |
| `states` / `state` | separate definitions | see below |
| `onInvalidate`, unknown keys | - | ignore |

### Gaps / behaviour differences
- **No svg source**: if neither `svgCode` nor `svgFile` is truthy, emit no svg
  layer; same for falsy `text` -> no text layer.
- **Both `svgFile` and `svgCode`**: in ButtonImage the last-assigned wins
  (svgFile's setter overwrites svgCode); in drawButton only `svgCode` counts.
- **User SVGs using `currentColor`**: old (librsvg) rendered them black; the new
  svg layer always sets root `color` (default `#848484`). ~~Converter could
  emit `color: "black"`~~ - decided: no special handling (never used in the
  old project).
- **svgForeColor literal replace vs colour map**: old also replaced `#848484`
  outside paint contexts (e.g. inside `<text>` content, ids) and did not match
  other spellings (`rgb(132,132,132)`, `#848484ff`); the new map matches
  normalised colours in paint contexts only. Edge cases only.
- **Colour syntax**: old accepted anything sharp/librsvg/node-canvas did; new
  rejects colours `parseColor` doesn't know (render-time error, not converter).
- **Null-vs-undefined defaults**: old `textColor: null` drew black (drawButton)
  - treat null as "unset" (white) - ButtonImage semantics.
- **Rendering engine differences** (Skia vs librsvg/Pango) are out of scope -
  covered by the initial port.
- ~~`textVerticalAlign` comment~~ - fixed to `textVAlign` in
  `src/layers/text.js` and `test/layers-text.test.js` headers. Layer props
  checked for redundant type prefixes (fill/svg/text): none - they already
  use `color`, `align`, `valign`, `padding`, `scale`, etc.

### Decisions (user, after Investigate)
- **Uniform recolouring (svg layer change):** built-ins must recolour with
  the same `colors: { "#848484": c }` map as file/inline SVGs, so the
  `svgForeColor` mapping is one rule. Agreed direction: in the svg layer,
  `currentColor` counts as the effective `color` (default `#848484`) for the
  colour map - if `colors` has a key matching `color` (normalised compare via
  `color.js`), the root colour becomes the mapped value. So a built-in
  "looks like" it is drawn in `#848484` whatever its internal form, and
  `color` keeps working. Needs svg layer tests first (TDD), plus updating
  the `src/layers/svg.js` header comment. Rule 4: propose a CLAUDE.md
  architecture note once implemented.
- **States are out of scope** - ignore `states`/`state`, no states helper.
- **Empty/falsy values must behave as before** (omit `svgText: 0`,
  `text: ""`, `textLineSpacing: 0`, null colours etc. so new defaults match
  old behaviour).
- **`currentColor` in user SVGs:** never used in the old project - no
  special handling (don't force `color: "black"`).
- **Stricter colour validation** is acceptable.
- All other flagged assumptions confirmed.

### Implementation notes (steps 1-2, done)
- `src/recolor.js`: private `colorMapLookup(map, caller)` parses a map once
  and returns `value -> mapped | undefined` (or null for missing/empty map);
  both `applyColorMap` and the new exported `lookupColor(map, value)` use it.
  Bad-key `TypeError` message is prefixed with the caller's name
  (`applyColorMap:` / `lookupColor:`).
- `src/layers/svg.js`: private `rootColor(colors, color)` = `lookupColor`
  result if `parseColor` accepts it (normalised via `formatColor`, like
  `validColor`), else `color`. Called after `applyColorMap`, so a bad map
  key still throws `applyColorMap:`'s error first. Header comment updated.
- `lookupColor` exported from `src/index.js`; `test/api.test.js` list updated.
- Tests: `test/recolor.test.js` (`lookupColor` suite),
  `test/layers-svg.test.js` (built-in uniform recolour cases, non-colour
  map value, inline SVG mixing `currentColor` + `#848484`, mutation test map
  extended). 652 tests pass.

### Implementation notes (steps 3-6, done)
- `src/legacy.js` exports `convertLegacyDefinition(old) -> Definition`
  (re-exported from `src/index.js`; added to `test/api.test.js` list). No
  imports. Header comment holds the mapping table. Internals: `svgLayer(old)`
  (null when no truthy `svgCode`/`svgFile`), `textLayer(old)`, and one helper
  `setIfSet(target, key, value, when = isSet)` - copies arrays/objects one
  level; `when = Boolean` for the "old ignored any falsy" props (`svgText`,
  `textLineSpacing`).
- `svgCode` checked first, so a falsy `svgCode` doesn't hide a set `svgFile`.
- A real old `ButtonImage` instance has `svgCode` already loaded by the
  `svgFile` setter, so it converts to an inline `svg` layer (file contents),
  not `src` - same pixels as the old renderer.
- Tests: `test/legacy.test.js` (mapping, falsy cases, FakeButtonImage class
  with private fields, deep-freeze + no shared objects, old `test.js` and
  ControlBlock-style defs). Step 6 tests passed without code changes. 676
  tests pass.

### Implementation notes (steps 7-8, done)
- `test/legacy-render.test.js` (separate file - `legacy.test.js` stays pure
  mapping): converted old `test.js` def == hand-written layered def (`data`
  equal, 3 and 4 channels); `svgForeColor: "red"` on `#square`/`#heart`
  (transparent back) -> red, unset -> grey; inline `svgCode` grey box ->
  all red / all grey; `backColor` in the corners; `textVAlign: "bottom"`
  label ink in the bottom half ending near `height - padding`. No converter
  changes needed.
- DRY: `outlinePixel` moved from `test/layers-svg.test.js` to
  `test/helpers.js` (used by both files). Gotcha: `#square`/`#heart` are
  outlines, so their centre pixel is the background - sample with
  `outlinePixel` on a transparent background.
- Docs: `src/layers/svg.js` and `src/legacy.js` headers re-checked (accurate).
  README.md has no API listing - unchanged. 682 tests pass.
- **Proposed CLAUDE.md wording (Rule 4 - awaiting user confirmation, not
  applied).** Add to *Architecture*:
  - "`src/legacy.js` `convertLegacyDefinition(old)` maps old node-buttonImage
    options (or a `ButtonImage` instance) to a layered definition - pure,
    browser-safe, no validation (render validates); `states`/`state` not
    supported. `svgForeColor` becomes `colors: { "#848484": c }` for every
    source."
  - "svg layer recolouring is uniform: `currentColor` counts as the effective
    `color` (default `#848484`), so a `colors` key matching it also recolours
    `currentColor` - built-ins and file/inline SVGs recolour with the same
    map."
  And in the *Architecture* "Shared code" bullet, after `recolor.js`: "(the one
  SVG markup/paint tokeniser; `lookupColor` for map lookups)".

### Where it should live / API sketch
- Pure object mapping, no I/O -> **browser-safe core**: new module e.g.
  `src/legacy.js` (no imports needed, or only `DEFAULT_VIRTUAL_SIZE`),
  exported from `src/index.js` (and so from `src/node.js` via `export *`).
  `test/api.test.js` export list must be extended; its import-graph test
  covers browser safety automatically.
- Candidate API:
  - `convertLegacyDefinition(old) -> Definition` (ignores `states`/`state`).
  - Read properties by name (not `Object.keys`) so a `ButtonImage` instance
    (getters, private fields) also converts.
- No validation in the converter beyond structure (render validates);
  throw `TypeError` for non-object input.

### Testing (TDD)
- `test/legacy.test.js` (name to match module):
  - Pure mapping tests with `assert.deepEqual` for each row of the mapping
    table, defaults/omissions, falsy edge cases (`svgText: 0`, `text: ""`,
    `textLineSpacing: 0`, `svgScale: null`), `svgForeColor` -> `colors` for
    every source, both svgFile+svgCode, no input mutation (padding array
    copied), `states`/`state` ignored.
  - svg layer tests (`test/` svg layer file) for the uniform-recolouring
    change: built-in + `colors: {"#848484": c}` paints `c`; explicit `color`
    still works; map keys not matching `color` don't touch `currentColor`.
  - Round-trip render tests via `render` + `napiBackend` and
    `test/helpers.js` (`pixelAt`, `findInkBounds`, `expectColorNear`,
    `expectAllPixels`): e.g. old `test.js` definition and a ControlBlock-style
    def render (back colour corners, icon colour, label ink near bottom);
    converted output renders identically to the equivalent hand-written
    layered def (compare `data` arrays).
  - Optional manual check (not a test): a `scratch/` script borrowing the old
    project's sharp + canvas from `../node-buttonImage/node_modules` (exists)
    via `createRequire`, rendering old `drawButton` vs converted new render
    for a few defs - like `scratch/sharp-compare.js`. Tests must not depend
    on the old repo (removed in the initial job).

## Flagged assumptions
(Reviewed by the user - see "Decisions" in Notes for the outcome.)
- Input semantics = **ButtonImage constructor options** (documented API):
  unset props take ButtonImage defaults (e.g. `textPadding` 3, which is also
  the new default). drawButton's NaN-padding/ignored-`svgFile` quirks are not
  reproduced.
- `backColor` always produces a `fill` layer (default `"black"`), even for
  `"transparent"` (harmless no-op), so output is a literal mapping. Alternative:
  omit the fill when transparent.
- ~~`svgForeColor` -> `color` for `#name`, else `colors`~~ - superseded:
  always `colors: { "#848484": c }` (see Decisions).
- For non-built-in SVGs, do **not** force `color: "black"` (confirmed).
- When both `svgFile` and `svgCode` are set, `svgCode` wins (drawButton
  semantics; key-order dependence of ButtonImage is not reproduced).
- Converter emits only properties that were set (and differ from "unset"), so
  new defaults apply; it does not validate values.
- `channels`, `state`, `onInvalidate` and unknown keys are ignored silently
  (no warnings).
- ~~States helper~~ - superseded: states out of scope.
- No CLI/script for converting JSON files (confirmed).
- (Plan) Name/location kept: `src/legacy.js` exporting
  `convertLegacyDefinition`, tests in `test/legacy.test.js`.
- (Plan) Uniform recolouring precedence: the effective root colour is
  `color` (explicit or default `#848484`); if a `colors` key matches it
  (normalised), the root colour becomes that entry's value. So
  `{ color: "red", colors: { red: "blue" } }` -> blue `currentColor`, and
  `{ colors: { "#848484": c } }` alone recolours built-ins. First matching
  entry wins (same as `applyColorMap`).
- (Plan) If the matched map value is not a parseable colour (e.g.
  `"currentColor"`, which `applyColorMap` allows as a replacement), the root
  colour is left unchanged rather than rejecting - keeps
  `colors: { "#848484": "currentColor" }` working as today.
- (Plan) `svgScale: 0` (old `?? 1` kept 0 -> zero-height draw) is copied
  as-is; the new svg layer rejects it (`validatePositive`). Edge case,
  accepted under "stricter validation is acceptable".
- (Implement, checked against the old code) Old `drawButton` computed
  `density = 72 * (svgScale ?? 1) * height / svgHeight` and passed it to
  `sharp(svg, { density })`; sharp (`lib/input.js`) **throws** unless density
  is a number in 1..100000. So old `svgScale` 0, negative or NaN made the
  whole render reject - nothing was drawn "silently". The new svg layer also
  rejects these (`validatePositive`), so copying as-is reproduces the old
  outcome (render error); omitting the layer would have *changed* behaviour.
  Only null/undefined are omitted (old `?? 1`). Tiny positive scales differ
  slightly: old threw when density < 1, new draws nothing when the rounded
  size is 0 - edge case, not handled.
- (Implement) `svgForeColor` uses truthiness (old `if (svgForeColor)`), so
  `""`/`null`/`0` are omitted; `textColor`/`textAlign`/`textVAlign`/`font`/
  `textPadding`/translates/`svgScale` use null/undefined (so `textPadding: 0`
  is kept).
- (Implement) `text: " "` (whitespace) is truthy and produces a text layer,
  as old drew it (nothing visible either way).
- (Implement, step 7) Round-trip tests live in a new
  `test/legacy-render.test.js` rather than `test/legacy.test.js`, keeping the
  mapping tests free of rendering.
- (Plan) The lookup helper is exported from `src/recolor.js` and the core
  entry (like the other recolor helpers), so `test/api.test.js` lists it.

## Plan
Every step: write/adjust tests first (see them fail where applicable), then
code; finish with `npm test` at 0 failures.

- [x] 1. **recolor.js lookup helper (DRY refactor).** Tests first in
  `test/recolor.test.js`: new `lookupColor(map, value)` (name may be adjusted)
  returns the mapped value for the first entry whose key matches `value`
  after normalisation (`parseColor` + `colorsEqual` from `color.js`), else
  `undefined`; accepts object or `Map`, null/empty map -> `undefined`;
  unparseable `value` -> `undefined`; bad key throws the same `TypeError` as
  `applyColorMap`. Implement by extracting the entry-parsing + `find` from
  `applyColorMap` into a shared internal function used by both (no
  duplicated parsing). Export from `src/recolor.js` and `src/index.js`; add
  to the core export list in `test/api.test.js`. Existing `applyColorMap`
  tests must still pass unchanged.
- [x] 2. **svg layer uniform recolouring.** Tests first in
  `test/layers-svg.test.js` (colour section, reuse `draw`, `outlinePixel`,
  `expectColorNear`): `#square`/`#circle` + `colors: {"#848484": "red"}` ->
  red; other spellings of the key (`rgb(132,132,132)`) also work;
  `color: "red", colors: {red: "blue"}` -> blue; `color: "red",
  colors: {"#848484": "blue"}` -> red (key doesn't match the effective
  colour); map with non-matching keys leaves built-ins grey;
  `colors: {"#848484": "currentColor"}` on an inline grey box still renders
  grey (root colour unchanged when the value isn't a colour); file/inline
  `colors` behaviour unchanged; layer object not mutated (extend the existing
  test with a matching map). Implement in `src/layers/svg.js`: after
  validating `color`, `rootColor = lookupColor(colors, colorValue)` and use
  it only if `parseColor` accepts it, else `colorValue`; pass to
  `setRootColor`. Update the svg.js header comment for `colors`/`color` to
  describe the rule.
- [x] 3. **Converter skeleton + export.** Tests first in new
  `test/legacy.test.js` (`assert.deepEqual`): non-object / null / array
  input throws `TypeError`; `{}` -> `{ layers: [{ type: "fill", color:
  "black" }] }`; `backColor` (incl. `"transparent"`, and null/undefined ->
  black); `virtualSize` copied (new object, not shared) only when set; extra
  keys (`channels`, `state`, `states`, `onInvalidate`, unknown) ignored.
  Add `convertLegacyDefinition` to the core export list in
  `test/api.test.js`. Implement `src/legacy.js` (no imports needed; JSDoc
  header listing the mapping table, reading props by name not
  `Object.keys`) and export it from `src/index.js`. Import-graph test
  covers browser safety.
- [x] 4. **svg mapping.** Tests first in `test/legacy.test.js`:
  `svgFile` `"#name"` and path -> `src`; `svgCode` -> `svg`; both set ->
  `svgCode` wins; neither truthy (incl. `""`, null) -> no svg layer;
  `svgText` truthy -> `text`, falsy (`0`, `""`, null) omitted;
  `svgForeColor` -> `colors: {"#848484": c}` for built-in, file and
  `svgCode` sources, falsy omitted; `svgScale` copied unless null/undefined
  (any other value, incl. `0`, copied as-is - see Flagged assumptions);
  `svgTranslate` copied as a new object. Implement in `src/legacy.js`.
- [x] 5. **text mapping.** Tests first: `text` truthy -> text layer with
  `String(text)` (numbers e.g. `42` -> `"42"`), falsy (`""`, null, `0`) -> no
  text layer; `textColor`, `textAlign`, `textVAlign`, `font` copied when not
  null/undefined (null -> omitted so new default white etc. applies);
  `textLineSpacing` copied only when truthy; `textPadding` number copied,
  arrays copied (not the caller's array); `textTranslate` copied as a new
  object; text-only props without `text` produce no layer. Layer order
  fill -> svg -> text. Implement in `src/legacy.js`.
- [x] 6. **Input forms + immutability.** Tests first: a class instance with
  getters / private fields (ButtonImage-like, written in the test) converts
  the same as the equivalent plain object; input object (and nested
  `textPadding`, `svgTranslate`, `textTranslate`, `virtualSize`) is not
  mutated and not shared with the output (deep-freeze input + identity
  checks); real-world shapes from Notes (old `test.js`, ControlBlock
  `look.js`-style def with `[9, 4]` padding, non-square `virtualSize`,
  `svgTranslate {x, y:-7}`) map to the expected literal definitions. Fix
  `src/legacy.js` if any fail; refactor any repeated "copy if set" logic
  into one small helper.
- [x] 7. **Render round-trip tests.** In `test/legacy.test.js` (or
  `test/legacy-render.test.js` if the file gets long), using `render` +
  `napiBackend` + `createSvgResolver()` and `test/helpers.js` (`pixelAt`,
  `findInkBounds`, `expectColorNear`, `expectAllPixels`): converted old
  `test.js` def renders identically (`data` arrays equal) to a hand-written
  layered def; `svgForeColor: "red"` on `#heart`/`#square` paints red; same
  for an inline `svgCode` grey box; `backColor` shows in corners; label ink
  sits near the bottom with `textVAlign: "bottom"`; both channel counts.
  No code changes expected (fix converter if a test exposes a bug).
- [x] 8. **Docs + Rule 4 proposal.** Re-check the `src/layers/svg.js` and
  `src/legacy.js` header comments; update README.md if it lists the API.
  Do **not** edit CLAUDE.md - write proposed wording into Notes (e.g.
  Architecture bullets: "`src/legacy.js` `convertLegacyDefinition` maps old
  node-buttonImage options to a layered definition (pure, browser-safe;
  states not supported)" and "svg layer recolouring is uniform: a `colors`
  key matching the effective `color` also recolours `currentColor`, so
  built-ins and files recolour the same way"). Coordinator relays it to the
  user for confirmation.
- [x] 9. *(Skipped at the user's request.)* *(Optional, manual - not automatable.)* Visual check vs the old
  project: a `scratch/legacy-compare.js` script loading the old
  `drawButton` with sharp/canvas from `../node-buttonImage/node_modules` via
  `createRequire` (like `scratch/sharp-compare.js`), rendering a few old defs
  and their converted new renders side by side into `scratch/`. Tests must
  not depend on the old repo. Only if the user wants it.
