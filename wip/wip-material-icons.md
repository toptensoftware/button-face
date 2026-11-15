# Direct Import of Material Icons

Status: Investigate

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

Depends on `wip/wip-initial.md` (svg layer, recolouring, prefix-keyed async
resolver - Plan steps 4, 5, 6, 9, 11). See "Proposed changes from
material-icons investigation" in that document's Notes.

## Notes

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

### Recolouring fit with wip-initial design (key finding)
wip-initial plans: `colors` A->B map (normalised), root `color` for
`currentColor` SVGs (`setRootColor`, default `#848484`), optional `tint`;
built-ins converted `#848484` -> `currentColor` at generate time.

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
  sizing stays with the svg layer's `scale`/`translate`.
- Root `width`/`height` (`24`) are kept; `getSvgSize` must cope with the
  negative viewBox origin (only width/height of the viewBox matter for size).

### Reference syntax and resolver integration (wip-initial step 9)
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
       `<dir>/<style>/<name>/<variant>_<opsz>.svg`; write to temp file + rename
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
- Render test with a checked-in fixture copy of a Material SVG (e.g.
  `test/fixtures/material-home.svg`) through the svg layer: `color: red` ->
  red ink; size equivalent to the built-in `#add` style padding.
- Live network test: optional / skipped unless an env var is set (CI and
  offline machines must pass). Browser localStorage cache can't be fully
  tested in Node - test against a fake Storage object and warn.

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

## Plan
(To be written in the Plan phase.)
