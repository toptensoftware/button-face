# Direct Import of Material Icons

Status: Complete

## Description
Google Material font icons are a great fit for this project, but currently to use them
requires manually downloading the .svg for the required icon and patching it for color
replacement and sizing.

This job is about adding the ability to directly reference a material icon by name and
have the library automatically download and cache its .svg.

Besides the icon name, it should support at least the "fill" and "weight" settings of
the fonts.

Things to consider:

1. How to map the icon name and settings to a download url for the .svg
2. How to setup the color replacement (perhaps just white -> user color)
3. Where to cache results:
    - for node a configuration directory, default to system temp
    - for web, perhaps in local storage
4. How to specify to use a material font instead of svg (probably a prefix similar to
   `#` as used for the built-in icons)
5. Perhaps some automatic tweaking of the viewport to better fit typical usage in
   this library

All other scaling/sizing/recoloring etc... should be handled by the normal svg layer.

Depended on the initial port (`wip/complete-initial.md`, done) and builds on
the uniform recolouring from `wip/complete-definition-update.md` (done). Both
are read-only.

## Notes

### Current code state (checked at Plan time - supersedes older wording below)
The investigation was written before the initial port finished. What now
exists and must be **reused, not re-written**:
- `src/resolve.js`: `createSvgResolver({ prefixes, fallback })` (prefixes
  object or Map, longest prefix wins, `null` removes, `#` built-in by default;
  handler gets the ref with the prefix stripped, e.g. `"home?fill=1"`; result
  must be a string), `resolveBuiltinIcon`. Its JSDoc resolver contract already
  says monochrome sources normalise to `currentColor` and names
  `createMaterialResolver` in an `@example` - no function of that name exists
  yet.
- `src/recolor.js` (browser-safe): `getRootAttribute`, **`setRootAttribute`**
  (adds/replaces a root attribute, works on the one-line Material format -
  tested in `test/recolor.test.js` "adds the attribute when absent"),
  `setRootColor` (= `setRootAttribute(svg, "color", c)`), `applyColorMap`,
  `lookupColor`, `mapPaintValues`, `findPaintValues`.
- `src/svgSize.js`: `parseViewBox` / `getSvgSize` **already handle the
  negative origin** (`0 -960 960 960` + `width="24"` -> 24x24, tested), and
  **`padViewBox(svg, fraction)` already exists** and is tested
  (`0.15` -> `-144 -1104 1248 1248`, `0` returns the input unchanged,
  `<= -0.5` throws RangeError). Nothing to add there.
- `src/layers/svg.js`: `color` default `#848484` sets root `color`; uniform
  recolouring: a `colors` key matching the effective `color` (default
  `#848484`) also recolours `currentColor`. So a material icon normalised to
  root `fill="currentColor"` recolours via **both** `color: c` and
  `colors: { "#848484": c }`, exactly like built-ins.
- `test/fixtures/material-home.svg` exists (raw gstatic download, outlined,
  default variant, opsz 24, Apache-2.0). `test/layers-svg.test.js` already
  renders it with `setRootAttribute(..., "fill", "currentColor")` (red /
  default grey ink) - the no-network material path is proven.
- `icons/add.svg` = raw Material `add` wght200 with only the root patched
  (`height="24px" viewBox="-144 -1104 1248 1248" width="24px"
  fill="#848484"`) - useful for a pixel-equivalence test (`@add?weight=200`
  vs `#add`).
- `src/node.js`: `createNodeSvgResolver({ baseDir, prefixes })` =
  `createSvgResolver({ prefixes, fallback: createFileResolver({ baseDir }) })`;
  `resolveSvg` = default instance (created at import); `render` uses it.
  `src/node/` contains only `fileResolver.js`. complete-initial noted "the
  material job should register `@` in `createNodeSvgResolver`'s defaults".
- `test/api.test.js`: core export list (`core entry exports the portable
  API`), Node-only names that must be absent from core
  (`napiBackend`, `createFileResolver`, `createNodeSvgResolver`), import-graph
  browser-safety test (`importGraph("src/index.js")` must have no externals
  and pass `assertBrowserSafe` per file), and a companion test proving the
  walker sees Node imports from `src/node.js`. Node entry test checks every
  core export is re-exported.
- `test/helpers.js`: `readRepoFile`, `readFixture`, `pkg`, `assertBrowserSafe`,
  `importGraph`, `drawSvg`, `pixelAt`, `pixels`, `opaquePixels`,
  `findInkBounds`, `inkStats`, `expectAllPixels`, `expectColorNear`.
- Node is v24.14: global `fetch` exists; `globalThis.localStorage` is **not**
  defined without `--experimental-webstorage` (Node 25+ defines it by
  default) - so the storage cache must be tested with a fake Storage object
  and must look `localStorage` up lazily inside try/catch.
- README.md currently has only "SVG authoring notes".

### Which icon set: Material Symbols (not legacy Material Icons)
- **Material Symbols** (variable font, 3 styles: `outlined`, `rounded`,
  `sharp`; axes FILL 0/1, wght 100-700, GRAD -25/0/200, opsz 20-48) is the
  maintained set. **Legacy Material Icons** (`materialicons`,
  `materialiconsoutlined`, `materialiconsround`, `materialiconssharp`,
  `materialiconstwotone`) is frozen, has no axes, different 24-unit viewBox and
  a `<path d="M0 0h24v24H0z" fill="none"/>` background path. Target Symbols only.
- The old project's material-derived built-ins are exactly **Material Symbols
  Outlined, wght 200, fill 0, grade 0, opsz 24** (verified: `add.svg` and
  `delete.svg` paths are byte-identical to the downloaded `wght200/24px.svg`),
  with only the root patched: `height="24px" width="24px"
  viewBox="-144 -1104 1248 1248" fill="#848484"`.

### Download URL scheme (verified by fetching, 2026-11-15)
Primary - Google Fonts static (what fonts.google.com's download button uses):
```
https://fonts.gstatic.com/s/i/short-term/release/materialsymbols{style}/{name}/{variant}/{opsz}px.svg
```
- `style`: `outlined` | `rounded` | `sharp`.
- `name`: lowercase snake_case (`home`, `arrow_back`). Case-sensitive (`Home` -> 404).
- `variant`: concatenation **in this order** of `wght{W}` (omit if 400),
  `grad{G}` (`gradN25` or `grad200`; omit if 0), `fill1` (omit if 0); `default`
  if all omitted. E.g. `default`, `fill1`, `wght700`, `wght700fill1`,
  `wght300gradN25fill1`, `wght700grad200fill1`.
  - Non-canonical forms 404: `wght400`, `fill0`, `grad0`, wrong order
    (`fill1wght700`, `wght700fill1grad200`).
  - Weights available: 100, 200, 300, 500, 600, 700 (+ 400 = omitted). `wght250`,
    `wght800` 404 - only the 7 static instances.
  - Grades: -25, 0, 200 only.
- `opsz`: 20, 24, 40, 48 only (18/32/36/96 -> 404). Optical size changes the
  glyph design (stroke proportions), not just the width/height attrs.
- Response headers: `Content-Type: image/svg+xml`, **`Access-Control-Allow-Origin: *`**,
  `Cross-Origin-Resource-Policy: cross-origin`, `Cache-Control: public,
  max-age=86400`, `Last-Modified` 2023 - usable from the browser via `fetch`.
- Unknown icon / invalid variant: **HTTP 404 with an HTML body**
  (`text/html`), also with CORS `*`. So check `response.ok` and that the body
  starts with `<svg` (and/or content-type `image/svg+xml`).
- Stability: path contains `short-term/release` and is undocumented, but it is
  what Google's own site and many tools use, and has been stable for years.
  Mitigate by making the URL builder configurable (option `url(params) => string`).

Alternatives (verified):
- GitHub raw, google/material-design-icons (**Apache-2.0**, verified LICENSE):
  `https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/{name}/materialsymbols{style}/{name}_{variant}_{opsz}px.svg`
  where the `default` variant is omitted (`home_24px.svg`, `home_fill1_48px.svg`,
  `home_wght300gradN25fill1_24px.svg`). CORS `*`, `Cache-Control: max-age=300`.
  Rate-limited, not a CDN - fallback only.
- jsDelivr/unpkg npm `@material-symbols/svg-{100..700}` (community, marella,
  Apache-2.0, v0.49.0):
  `https://cdn.jsdelivr.net/npm/@material-symbols/svg-{wght}/{style}/{name}[-fill].svg`.
  Only weight + fill (grade 0, opsz 48 only); "optimized" (attribute order
  differs). CORS `*`, version-pinnable (most stable URL), but can't do grade/opsz.
- Name validation index: `https://fonts.google.com/metadata/icons?key=material_symbols&incomplete=true`
  is ~5.8 MB JSON with a `)]}'` XSSI prefix and **no CORS header** - not usable
  in browsers and too large. Don't use it; validate names syntactically
  (`/^[a-z0-9_]+$/`) and treat a 404 as "unknown icon or unsupported setting".

Licence: Material Symbols are Apache License 2.0. Redistributing cached copies
is fine; a note in the eventual README is sufficient (no attribution required
in rendered output). We don't bundle them, so no LICENSE change is needed.

### What the downloaded SVG looks like (gstatic)
```xml
<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="M240-200h120v-240h240v240h120v-360L480-740 240-560v360Zm-80 80v-480l320-240 320 240v480H520v-240h-80v240H160Zm320-350Z"/></svg>
```
- Single line, ~150-600 bytes. One root `<svg>`, `width`/`height` = opsz
  (unitless, e.g. `24`; the old patched files had `24px`), viewBox always
  `0 -960 960 960` (negative y origin, 960 grid), one or more `<path d>`.
- **No `fill` attribute anywhere, no `style`, no `stroke`** -> the glyph renders
  in SVG's initial fill, **implicit black**. There is nothing for a colour map
  (A->B) to match. (Contrary to the Description's guess, they are not white.)
- jsDelivr variant is the same shape (`width`/`height` order swapped).
- Samples saved (not in repo):
  `C:\Users\brad\AppData\Local\Temp\claude\eb4aae2ac08bdfd7\678195d1-7863-45fa-b1e8-a16aaf3e2fcf\scratchpad\mi\`.

### Recolouring fit (key finding; now implemented in the svg layer)
The svg layer has: `colors` A->B map (normalised), root `color` for
`currentColor` SVGs (`setRootColor`, default `#848484`), optional `tint`;
built-ins converted `#848484` -> `currentColor` at generate time; and (since
definition-update) a `colors` key matching the effective `color` also
recolours `currentColor`.

- `colors` map: **cannot** recolour Material Symbols (no paint values present).
- `tint`: works (monochrome glyph) but is a raster op, and it is the
  "monochrome-ise" escape hatch, not the primary colouring path.
- `color` (currentColor): works **if** the SVG says `fill="currentColor"`.
  `fill` is an inherited property, so a single `fill="currentColor"` on the
  root `<svg>` makes every unpainted shape use `color`; elements with explicit
  fills (e.g. legacy icons' `fill="none"` background path) are unaffected.

**Recommended single model - "currentColor is the foreground":**
1. The svg layer's `color` is *the* foreground colour for any SVG that uses
   `currentColor` (default `#848484`, unchanged from wip-initial).
2. Icon sources (resolvers / the build-time generator) are responsible for
   **normalising their icons to that convention** before returning them:
   - built-ins: generator maps `#848484` -> `currentColor` (already planned);
   - material resolver: injects `fill="currentColor"` on the root `<svg>`.
   Both use the same pure helpers in `recolor.js` (`applyColorMap`,
   `setRootAttribute`), so there is one mechanism, not two.
3. Arbitrary user SVGs: `colors` map for explicit colours; `tint` for
   "make it all one colour". Users whose own SVG relies on implicit black can
   add `colors`-free recolouring by authoring `fill="currentColor"`, or use
   `tint`. (Possible later generic option: svg-layer `rootFill` /
   `defaultFill`, reusing `setRootAttribute` - not needed now; see Flagged.)
4. Result: `{ src: "#add", color: "red" }` and `{ src: "@add", color: "red" }`
   behave identically, and old `svgForeColor` maps to `color` for both.

Rejected for the core model: making `applyColorMap` understand an "implicit
default" key (surprising, partial-recolour edge cases); auto-injecting root
`fill="currentColor"` whenever `color` is set on any SVG (would silently
recolour user SVGs that intentionally rely on black for some parts).

### Viewport / sizing
- Old built-ins padded the viewBox by 144 units on each side
  (`0 -960 960 960` -> `-144 -1104 1248 1248`), i.e. the 960 grid occupies
  960/1248 = **76.9%** of the rendered height, so with svg scale 1 (= button
  height) the icon had a margin. Material glyphs already have ~2/24 internal
  padding; together the visible glyph is ~64% of the button.
- In the new svg layer, the same effect is `scale: 0.769` on an unpadded icon,
  but then `@add` and `#add` would look different sizes at the same `scale`.
- Recommendation: the material resolver applies the **same padding by
  default** (option `pad`, default 0.15 of the viewBox per side, = 144/960;
  `pad: 0` gives the raw icon), so material icons are drop-in equivalents of
  the built-ins. Implement padding as a generic pure helper
  `padViewBox(svg, fraction)` next to `getSvgSize` (svgSize.js) so a future
  generic svg-layer `padding`/`inset` option can reuse it (DRY). All other
  sizing stays with the svg layer's `scale`/`translate`. **Done:**
  `padViewBox` already exists in `src/svgSize.js` (exported from core).
- Root `width`/`height` (`24`) are kept; `getSvgSize` already copes with the
  negative viewBox origin (tested).

### Reference syntax and resolver integration (plugs into `createSvgResolver`)
- Prefix `@` (parallels `#` for built-ins), settings as a query string parsed
  with `URLSearchParams` (works in Node and browser):
  `@home`, `@home?fill=1`, `@home?weight=700&fill=1&style=rounded`,
  optional `grade=-25|0|200`, `size=20|24|40|48` (opsz).
- Defaults: `style=outlined`, `fill=0`, `weight` (see Flagged), `grade=0`,
  `size=24`. Resolver-level defaults overridable at creation time.
- Validation before any network: name `/^[a-z0-9_]+$/`, style in set, fill
  0/1 (accept `true/false`), weight in {100..700 step 100}, grade in
  {-25,0,200}, size in {20,24,40,48}, unknown keys -> error. Clear error
  messages ("unknown material icon 'hoem' (404)").
- Plugs in as `createSvgResolver({ prefixes: { "@": createMaterialResolver(opts) } })`;
  the handler receives the remainder (`home?fill=1`) and returns
  `Promise<string>`. The Node entry would register it by default with the fs
  cache; the core entry exports the factory (portable: uses global `fetch`).
- `createMaterialResolver({ fetch = globalThis.fetch, cache, url, defaults, pad })`
  - injectable `fetch` and `cache` make it unit-testable with no network.

### Caching
- Cache key = canonical download identity, not the raw `src` string:
  `{style}/{name}/{variant}/{opsz}` (e.g. `outlined/home/wght700fill1/24`), so
  `@home?weight=400` and `@home` share an entry. Cache the **raw downloaded
  SVG** (before currentColor/padding normalisation), so changing `pad` or the
  normalisation code never needs a cache purge.
- Cache interface (async, both platforms): `{ get(key) -> Promise<string|undefined>,
  set(key, svg) -> Promise<void> }`. Layers:
  1. in-memory `Map` of **promises** (dedupes concurrent requests for the
     same icon; drop the entry if it rejects),
  2. persistent store:
     - Node: `src/node/fsCache.js`, dir option, default
       `path.join(os.tmpdir(), "button-face", "material")`; file
       `<dir>/<key>.svg`, i.e. `<dir>/<style>/<name>/<variant>/<opsz>.svg`
       (generic: key segments validated against `/^[a-z0-9_-]+$/` so no path
       traversal); write to temp file + rename
       (atomic, safe with concurrent processes); mkdir recursive.
     - Browser: `localStorage` with key prefix `button-face:material:`
       (icons ~0.2-0.6 KB each; 5 MB quota is thousands of icons), every access
       in try/catch (private mode / quota -> just skip caching). Cache API needs a
       secure context and IndexedDB is overkill; localStorage matches the
       Description and is synchronous-but-wrapped.
- Validate on read (must start with `<svg`); corrupt entries are ignored and
  re-fetched. No expiry (published glyphs are effectively immutable); a
  `clear()` helper is cheap to add.
- Don't persist 404s (memory only, if at all).
- Offline: cache hit works; miss rejects with a clear "could not download"
  error including the URL. Node 24 has global `fetch`.

### Testing notes (for Plan)
- Pure/unit (automatable): URL/variant builder (canonical order, omitted
  defaults), query parsing + validation, cache key, padViewBox, root fill
  injection, resolver with fake `fetch` (200, 404 HTML, network error) and
  fake cache (hit/miss/dedupe/corrupt), fs cache in a temp dir.
- Render test with the checked-in fixture (`test/fixtures/material-home.svg`
  exists; add `test/fixtures/material-add-wght200.svg` = `icons/add.svg` with
  the root un-patched to the raw gstatic form) served by a fake `fetch`
  through the svg layer: `color: red` -> red ink; `colors: {"#848484": red}`
  -> same; `@add?weight=200` renders pixel-identical to `#add`.
- Live network test: optional / skipped unless an env var is set (CI and
  offline machines must pass). Browser localStorage cache can't be fully
  tested in Node - test against a fake Storage object and warn.

### Implementation notes (steps 1-2)
- `src/material.js` exports `MATERIAL_DEFAULTS` (frozen), `validateMaterialParams(params, where?)`
  (partial object -> normalised partial; values may be numbers/booleans or
  strings; `undefined`/`null` -> `{}`), `parseMaterialRef(ref, defaults?)`
  (defaults = already-validated partial, merged over `MATERIAL_DEFAULTS`),
  `materialVariant`, `materialIconUrl`, `materialCacheKey`. Tests in
  `test/material.test.js` (16). Not yet exported from `src/index.js` (step 3).
- Error shapes: TypeError for bad name / unknown key / repeated key / empty
  value / non-object; RangeError for values outside the allowed set. Messages
  are prefixed `material icon '<ref>':` (ref as the handler receives it, i.e.
  without the `@`) or `material settings:` (override via `where`, e.g. step 3
  should pass `"material defaults"`).
- Gotcha: `URLSearchParams` decodes `+` as a space, so `weight=+200` arrives
  as `" 200"` (rejected). Percent-encoding is decoded before validation.
- The name is taken verbatim (not percent-decoded) and must match
  `/^[a-z0-9_]+$/`.

### Implementation notes (step 3)
- `createMaterialResolver({ fetch, cache, url = materialIconUrl, defaults, pad = 0.15 })`
  in `src/material.js` returns `async (ref) => svg`. Defaults validated at
  creation (`"material defaults"` prefix); `pad` validated at creation by
  calling `padViewBox` on a probe SVG (reuses its RangeError, no duplicate
  check). Memory layer = `Map<cacheKey, Promise<raw svg>>`, entry deleted on
  rejection. Persistent `cache` is optional (`cache?.get/set`); step 4 should
  just make `createStorageCache()` the default for `cache`.
- Body check: BOM stripped + trimmed must start with `<svg`; the **raw**
  body is stored in the cache, the trimmed body is returned/normalised.
  Cached entries go through the same check (corrupt -> re-fetch + overwrite).
- Errors: thrown network errors keep `cause`; 404 -> "unknown material icon
  ..."; other non-ok -> "could not download ... : HTTP <status>"; ok but not
  SVG -> "...: response is not an SVG".
- Exported from `src/index.js`: `createMaterialResolver`, `MATERIAL_DEFAULTS`,
  `validateMaterialParams`, `parseMaterialRef`, `materialVariant`,
  `materialIconUrl`, `materialCacheKey`; api.test core list + import-graph
  check include them. Tests: `test/material.test.js` (now 30). Test helpers
  `fakeFetch(routes)` / `fakeCache(entries)` are local to that file - move
  them to `test/helpers.js` if steps 6/7 need them (DRY).
- Bash heredocs containing quotes failed to parse in this environment; use
  the Edit/Write tools to add test code.

### Implementation notes (step 4)
- `src/storageCache.js`: `createStorageCache({ storage, prefix = "button-face:material:" })`
  -> `{ get, set }`; `storage ?? globalThis.localStorage` is looked up on
  **every** access inside one try/catch (`attempt` helper), so a missing or
  throwing localStorage is a no-op. Exported from core; api.test list and
  import-graph check updated.
- `createMaterialResolver`'s `cache` now defaults to `createStorageCache()`.
  Passing `cache: null` gives memory-only (the `cache?.get` path).
- Gotcha: `t.mock.property(globalThis, "localStorage", ...)` throws in Node 24
  (property must already exist). `test/storageCache.test.js` has a local
  `mockLocalStorage(t, descriptor)` that defines and restores it.
- **WARNING (not automatable):** real browser localStorage behaviour (quota
  exceeded, Safari private mode, SecurityError on sandboxed/opaque origins)
  is only tested via a fake Storage object and a throwing getter - verify
  manually in a browser if needed.

### Implementation notes (step 5)
- `src/node/fsCache.js`: `createFsCache({ dir })` -> `{ dir, get, set }`
  (`dir` exposed so callers/README can say where to clear). Key segments must
  match `/^[a-z0-9_-]+$/` (split on `/`); bad keys **reject** with TypeError
  from both `get` and `set` (async). `get` swallows every read error
  (miss, EISDIR, ...). `set` = mkdir recursive + write
  `<file>.<pid>-<n>.tmp` + rename; on failure the temp file is removed, and
  EPERM/EBUSY/EACCES are ignored if the target exists (Windows concurrent
  rename-over). 8 concurrent sets of one key passed 8/8 runs on Windows.
- Not yet imported by `src/node.js` (step 6). Tests: `test/fsCache.test.js` (6).

### Implementation notes (step 6)
- `src/node.js`: `createNodeSvgResolver({ baseDir, prefixes, material })`.
  Unless `material === false`, registers `"@"` =
  `createMaterialResolver({ cache: createFsCache({ dir: cacheDir }), ...rest })`
  where `{ cacheDir, ...rest } = material ?? {}` (so `material.cache` can also
  replace the fs cache). Defaults and user `prefixes` (object or Map) are
  merged into one Map, user entries last, so they win and `"@": null`
  removes it. Re-exports `createFsCache`. The default `resolveSvg` therefore
  has `@` with the fs cache in `<tmpdir>/button-face/material` (no I/O until
  used).
- `fakeFetch`, `NOT_FOUND_HTML` and new `tempDir(t)` moved to
  `test/helpers.js` (used by material, fsCache and api tests). Step 7 should
  use `fakeFetch` from there. `fakeCache` stays local to material.test.js.
- api.test: `createFsCache` in the Node-only list + re-export check,
  `src/node/fsCache.js` in the Node import graph, fake-fetch + temp cacheDir
  round-trip (second resolver served from disk, `pad` passes through),
  `material: false` / `"@": null` -> ENOENT, default `resolveSvg("@Bad")`
  rejects with the validation error. Suite: 728 tests, 0 failures.

### Implementation notes (step 7)
- Fixture `test/fixtures/material-add-wght200.svg` (raw gstatic root, no
  fill). `test/material-render.test.js` (5 tests): `node.render` with
  `createNodeSvgResolver({ material: { fetch: fakeFetch(...), cache: null } })`
  (routes keyed by `materialIconUrl(parseMaterialRef(ref))`). All passed first
  time - no production changes. `@add?weight=200` is **byte-identical**
  (`deepEqual` on pixel data) to `#add`, so the default pad/weight really are
  drop-in. Gotcha: the thin `add` glyph at 72px has exactly 100 fully opaque
  pixels, so ink-count thresholds must be lower for it. Suite: 733, 0 failures.

### Implementation notes (step 8)
- `test/material-live.test.js` (5 tests, each `{ skip }` unless
  `BUTTON_FACE_LIVE_TESTS` is set): resolver with `pad: 0` and an fs cache in
  `tempDir(t)`; checks root `fill="currentColor"`, paths present and
  `getSvgSize` = opsz; `hoem` -> 404 message; `@add?weight=200` path data ==
  `readIcon("add")` path data. Ran live 2026-11-15: **5/5 pass** (~1.4 s).
  Default `npm test`: 738 tests, 733 pass, 5 skipped, 0 failures.
- Run manually (PowerShell): `$env:BUTTON_FACE_LIVE_TESTS = "1"; node --test test/material-live.test.js`.

### Implementation notes (step 9)
- README: new "Material Symbols icons" section (syntax + settings table,
  defaults incl. weight 200, colouring, padding/`pad`, Node/browser caching
  + clearing, offline, custom resolver options, gstatic URL/CORS, Apache-2.0
  note). `src/resolve.js` contract JSDoc now names `createMaterialResolver`
  instead of "e.g. a Material Symbols resolver". No samples row added.
  Suite: 738 tests, 733 pass, 5 skipped (live), 0 failures.
- All plan steps done; doc left as `wip-` for the user/coordinator to
  complete. CLAUDE.md not edited - proposed wording below awaits confirmation.

## Flagged assumptions
- Target Material Symbols only (not legacy Material Icons).
- Primary source fonts.gstatic.com `short-term/release` scheme, URL builder
  overridable; no automatic fallback to GitHub raw/jsDelivr in v1.
- Prefix `@` with query-string settings (`@home?fill=1&weight=700`); keys
  `style`, `fill`, `weight`, `grade`, `size`.
- **Default weight: 200** (matches the existing built-ins' look and the user's
  manually patched icons) rather than Google's default 400. Default style
  outlined, fill 0, grade 0, size 24.
- Material resolver injects root `fill="currentColor"` (via shared
  `setRootAttribute`), so the svg layer's `color` (default `#848484`) colours
  it - no white->colour map.
- Material resolver pads the viewBox by default to match built-ins
  (`-144 -1104 1248 1248`), `pad` option to change/disable; implemented as a
  generic `padViewBox` helper.
- No generic svg-layer `rootFill`/`padding` option in this job (helpers are
  written so it can be added later without duplication).
- Cache raw downloaded SVG; Node default dir `os.tmpdir()/button-face/material`;
  browser `localStorage`; no expiry.
- (Plan) Module layout: `src/material.js` (pure ref parsing/validation,
  variant/URL/cache-key builders, `createMaterialResolver`),
  `src/storageCache.js` (generic `createStorageCache({ storage, prefix })`
  over a Web Storage object), `src/node/fsCache.js` (generic
  `createFsCache({ dir })`). Caches are generic `{ get, set }` keyed by
  strings, not material-specific, so they could be reused.
- (Plan) `createMaterialResolver`'s default `cache` (when none passed) =
  `createStorageCache()`, which uses `globalThis.localStorage` if it can be
  accessed and otherwise is a no-op (memory-only via the promise Map). The
  Node entry always passes an fs cache, so Node 25+'s global localStorage is
  never used by default there.
- (Plan) The Node default `resolveSvg` / `createNodeSvgResolver` registers
  `@` by default with an fs cache; new option `material` = options object
  passed to `createMaterialResolver` plus `cacheDir`, or `false` to not
  register `@`. An explicit `prefixes["@"]` still overrides (prefixes win).
- (Plan) Query parsing: repeated keys, empty values and unknown keys are
  errors; `fill` accepts `0|1|true|false`; numbers must be exact members of
  the allowed sets (`weight=200.0` rejected). Resolver-level `defaults` are
  validated at creation time with the same validator.
- (Plan) Cache key = `{style}/{name}/{variant}/{opsz}` (from the investigation)
  is independent of the `url` override - a custom `url` builder pointing at a
  different source shares cache entries. Acceptable (same glyphs); document it.
- (Plan) Download check: `response.ok` and body (trimmed, BOM stripped)
  starting with `<svg`; content-type not required (some mirrors send
  `text/plain`). 404 -> "unknown material icon '<name>' or unsupported
  settings (HTTP 404 <url>)"; other failures -> "could not download material
  icon '<name>' from <url>: <reason>".
- (Plan) Samples (`npm run samples`) get no material row by default (would
  need network); optional row only when the live env var is set - skipped
  unless trivial.
- (Plan) Live network test env var name: `BUTTON_FACE_LIVE_TESTS=1`.
- (Impl 1) Settings must be lowercase as written (`style=Rounded`,
  `fill=TRUE` rejected); `fill` also accepts booleans in creation-time
  defaults. A trailing `?` (`home?`) is allowed and means no settings.
- (Impl 3) Persistent cache `get`/`set` failures (throw or reject) are
  swallowed: the icon still resolves, just isn't cached (e.g. read-only
  cache dir shouldn't break rendering).
- (Impl 3) Successful downloads stay in the in-memory Map for the
  resolver's lifetime (no eviction).
- (Impl 4) `cache: null` on `createMaterialResolver` = memory only (only
  `undefined` gets the localStorage default).
- (Impl 5) fs cache keys that fail validation reject (async) rather than
  throwing synchronously; the resolver swallows cache errors anyway.
- (Impl 6) `material.cache` (if given) overrides the Node fs cache, since
  the rest of `material` is spread over the defaults.
- (Impl 9) No material row in `scripts/render-samples.js` (optional in the
  plan; would need network). The README section was added standalone at the
  top; the separate `wip/wip-readme.md` job is expected to fold it into the
  full README.

## Plan
Each step: write/adjust tests first, then code; `npm test` must end at 0
failures. Reuse existing helpers (`setRootAttribute`, `padViewBox`,
`createSvgResolver`, `test/helpers.js`) - don't re-implement them.

- [x] 1. **Ref parsing + validation (pure).** Tests first in new
  `test/material.test.js`: `parseMaterialRef("home?weight=700&fill=1&style=rounded", defaults)`
  -> `{ name, style, fill, weight, grade, size }` with defaults
  (outlined/0/200/0/24) and resolver-level overrides; `fill` true/false/0/1;
  every invalid case (bad name chars/case, empty name, unknown key, repeated
  key, empty value, weight 250/800/"abc", grade 1, size 18, style "filled")
  throws a clear TypeError/RangeError naming the ref. Add a `DEFAULTS` /
  `validateMaterialParams(params)` used for both refs and creation-time
  `defaults`. Code in new `src/material.js` using `URLSearchParams` (no
  Node imports).
- [x] 2. **Variant, URL and cache key builders (pure).** Tests first:
  `materialVariant(params)` canonical order `wght` -> `grad` (`gradN25`,
  `grad200`) -> `fill1`, omitting 400/0/0, `default` when empty (all
  examples from Notes: `default`, `fill1`, `wght700`, `wght700fill1`,
  `wght300gradN25fill1`, `wght700grad200fill1`); `materialIconUrl(params)` ->
  the gstatic URL; `materialCacheKey(params)` -> `outlined/home/wght700fill1/24`
  (and `@home?weight=400` vs explicit default weight 400 share a key).
- [x] 3. **`createMaterialResolver` core (injected fetch + cache).** Tests
  first with a fake `fetch` (serves `test/fixtures/material-home.svg`; 404
  HTML; rejects) and a fake in-memory `{ get, set }` cache: result is the raw
  SVG + root `fill="currentColor"` (via `setRootAttribute`) + `padViewBox(pad)`
  (default 0.15; `pad: 0` -> only the fill change); calls go to the URL from
  `url(params)` (default `materialIconUrl`); cache hit skips fetch; miss
  stores the **raw** body; corrupt cached entry (not `<svg`) is re-fetched and
  overwritten; concurrent identical refs fetch once (promise Map) and a
  rejected promise is dropped so a retry fetches again; 404 / network errors
  give the messages in Flagged assumptions and are not persisted; validation
  errors happen before any fetch; `fetch` defaults to `globalThis.fetch`
  looked up at call time. Works via
  `createSvgResolver({ prefixes: { "@": createMaterialResolver(...) } })`.
  Export `createMaterialResolver` (and the pure builders from steps 1-2) from
  `src/index.js`; add them to `test/api.test.js`'s core export list and assert
  `src/material.js` is in the core import graph (browser-safety test then
  covers it). Default `cache` for now: none (memory only) - step 4 adds the
  storage default.
- [x] 4. **Browser localStorage cache.** Tests first in
  `test/storageCache.test.js` with a fake Storage object (Map-backed
  `getItem`/`setItem`/`removeItem`): `createStorageCache({ storage, prefix =
  "button-face:material:" })` get/set round-trip with the prefix; a `storage`
  whose methods throw (quota, SecurityError) or a getter that throws -> get
  resolves undefined, set resolves without error; no storage available
  (`globalThis.localStorage` undefined in Node 24) -> no-op. `storage`
  defaults to a **lazy, try/catch-guarded** `globalThis.localStorage`
  lookup. Make it `createMaterialResolver`'s default `cache`. New file
  `src/storageCache.js` (browser-safe), exported from core; update api.test
  export list. **Warn:** real browser localStorage behaviour (quota, private
  mode) cannot be tested automatically - only via the fake.
- [x] 5. **Node fs cache.** Tests first in `test/fsCache.test.js` using a
  `fs.mkdtemp` temp dir (removed after): `createFsCache({ dir })` get on a
  miss -> undefined; set then get round-trips; file lands at
  `<dir>/outlined/home/default/24.svg`; directories created recursively;
  write is temp file + rename (no stray temp files left; two concurrent sets
  of the same key both succeed); keys with `..`, absolute paths, backslashes
  or other chars outside `/^[a-z0-9_-]+$/` per segment throw; unreadable
  entry -> undefined. Default `dir` =
  `path.join(os.tmpdir(), "button-face", "material")`. New file
  `src/node/fsCache.js` (Node-only, never imported by core).
- [x] 6. **Node default registration.** Tests first in `test/api.test.js`:
  `node.createFsCache` exported and absent from core (add to the Node-only
  names list); `importGraph("src/node.js")` includes `src/node/fsCache.js`;
  `createNodeSvgResolver({ material: { fetch: fake, cacheDir: tmp } })`
  resolves `@home?fill=1` through the fake fetch and writes the fs cache;
  a second resolver on the same `cacheDir` serves it with no fetch;
  `material: false` -> `@home` falls through to the file fallback (ENOENT);
  explicit `prefixes: { "@": ... }` overrides the default (existing test
  still passes); default `node.resolveSvg` has `@` registered (assert with a
  validation error such as `@Bad` rejecting before any network, so no
  network is used). Update `src/node.js` (`createNodeSvgResolver({ baseDir,
  prefixes, material })`, JSDoc, re-export `createFsCache`).
- [x] 7. **Render tests through the svg layer.** Add fixture
  `test/fixtures/material-add-wght200.svg` = `icons/add.svg`'s path with the
  raw gstatic root (`height="24" viewBox="0 -960 960 960" width="24"`, no
  fill). New tests (e.g. in `test/material-render.test.js`, using
  `test/helpers.js` pixel helpers) render via `node.render` with a resolver
  whose `@` uses a fake fetch serving the fixtures: `@home` + `color: "red"`
  -> red ink only; `@home` + `colors: { "#848484": "red" }` -> same pixels as
  the `color` case (uniform recolouring); no colour -> `#848484` ink;
  `@add?weight=200` with `color: red` is pixel-identical to `#add` with
  `color: red` (padding/size equivalence); `pad: 0` makes the ink bounds
  larger. No production code expected - fix only if a test exposes a bug.
- [x] 8. **Optional live network test.** `test/material-live.test.js`, every
  test `{ skip: !process.env.BUTTON_FACE_LIVE_TESTS && "set BUTTON_FACE_LIVE_TESTS=1" }`:
  real gstatic downloads of `home` (default), `home?fill=1&weight=700`,
  `arrow_back?style=rounded&grade=-25&size=48` return valid SVGs; `hoem`
  rejects with the 404 message; `@add?weight=200` raw path equals
  `icons/add.svg`'s path. Uses a temp fs cache. **Warn:** not run by default
  `npm test` (CI/offline must pass); run manually with the env var.
- [x] 9. **Docs and rules.** README: "Material Symbols icons" section
  (`@name?style=&fill=&weight=&grade=&size=` syntax, allowed values,
  defaults incl. weight 200, colouring via `color`/`colors`, padding /
  `pad`, caching locations + how to clear, browser localStorage, offline
  behaviour, network/CORS, Apache-2.0 licence note: icons are downloaded at
  runtime, not bundled). Update `src/resolve.js` contract JSDoc if wording
  is stale. Optionally add a material row to `scripts/render-samples.js`
  only when `BUTTON_FACE_LIVE_TESTS` is set. Record proposed CLAUDE.md
  wording below for the user to confirm (**do not edit CLAUDE.md**).
  `npm test` 0 failures.

### Proposed CLAUDE.md wording (for user confirmation in step 9 - not applied)
Under *Architecture*, after the SVG resolvers bullet:
- `@name?...` = Google Material Symbols, downloaded at runtime by
  `createMaterialResolver` (`src/material.js`, injectable `fetch`/`cache`,
  normalises to root `fill="currentColor"` + `padViewBox(0.15)`). Caches are
  generic `{ get, set }`: `src/storageCache.js` (browser localStorage, core)
  and `src/node/fsCache.js` (Node, registered by `createNodeSvgResolver`).
  Tests never hit the network unless `BUTTON_FACE_LIVE_TESTS=1`
  (`test/material-live.test.js`).
