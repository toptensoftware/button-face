# button-face

## Material Symbols icons

An svg layer's `src` can name a [Google Material Symbols](https://fonts.google.com/icons)
icon with an `@` prefix (built-in icons use `#`). The SVG is downloaded the
first time it is used and cached:

```js
{ type: "svg", src: "@home", color: "white" }
{ type: "svg", src: "@arrow_back?style=rounded&fill=1&weight=700" }
```

Syntax: `@name?style=&fill=&weight=&grade=&size=` (all settings optional, any
order, lowercase, each at most once). `name` is the icon's lowercase
snake_case name as shown on fonts.google.com (`home`, `arrow_back`).

| Setting  | Values                           | Default    |
|----------|----------------------------------|------------|
| `style`  | `outlined`, `rounded`, `sharp`   | `outlined` |
| `fill`   | `0`, `1` (or `false`, `true`)    | `0`        |
| `weight` | `100`, `200`, ... `700`          | `200`      |
| `grade`  | `-25`, `0`, `200`                | `0`        |
| `size`   | `20`, `24`, `40`, `48` (optical size) | `24`  |

The default weight is 200 (Google's is 400), matching the built-in icons, so
`@add` looks exactly like `#add`. Invalid names or settings are rejected
before any download; a name/setting combination Google doesn't publish fails
with "unknown material icon ... (HTTP 404 ...)".

**Colouring.** Icons are normalised to `fill="currentColor"`, so they colour
like the built-ins: `color: "red"` (default `#848484`), or equivalently
`colors: { "#848484": "red" }`.

**Sizing.** The icon's viewBox is padded by 15% per side, as the built-in
icons are, so it sits inside the button with a margin at `scale: 1`. Use the
svg layer's `scale` / `translate` to adjust, or create a resolver with
`pad: 0` for the unpadded icon.

**Caching.**
- Node (`@toptensoftware/button-face/node`): on disk in
  `<os.tmpdir()>/button-face/material/<style>/<name>/<variant>/<size>.svg`
  (plus in memory). Delete that directory to clear it. Change it with
  `createNodeSvgResolver({ material: { cacheDir } })`, or disable `@` with
  `material: false`.
- Browser (core entry): `localStorage`, keys prefixed
  `button-face:material:` (plus in memory). If `localStorage` is unavailable
  or full, icons are just not persisted. Clear by removing those keys.
- Cached icons are never refreshed (published glyphs don't change). Offline,
  cached icons still render; uncached ones fail with "could not download
  material icon ...".

**Custom resolver.** `createMaterialResolver({ fetch, cache, url, defaults, pad })`
returns the `@` handler for `createSvgResolver({ prefixes: { "@": ... } })`:
`fetch` (default global `fetch`), `cache` (any `{ get(key), set(key, svg) }`
returning promises; `null` = memory only), `url` (download URL builder,
default `materialIconUrl`), `defaults` (e.g. `{ weight: 400 }`), `pad`.

**Network.** Icons come from
`https://fonts.gstatic.com/s/i/short-term/release/materialsymbols{style}/{name}/{variant}/{size}px.svg`,
which allows cross-origin requests, so it works from browsers too. This URL
scheme is what fonts.google.com uses but is not formally documented; if it
changes, pass a `url` builder pointing elsewhere.

**Licence.** Material Symbols are © Google, under the
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). They are
downloaded at runtime, not bundled with button-face.

## SVG authoring notes

Avoid strokes and text in SVG icons: convert them to filled paths before use
(in Inkscape: *Path > Stroke to Path* and *Path > Object to Path*; this repo's
`scripts/to-paths.js` does both from the command line). Text also depends on
the fonts installed where the button is rendered.

Some renderers handle strokes inconsistently. For example Skia (used in Node
via `@napi-rs/canvas`) ignores a unitless `stroke-width` inside a `style`
attribute (`style="stroke-width:0.7"`), so the stroke is drawn at the wrong
width. button-face patches this common case, but filled paths render the same
everywhere and are the most reliable choice.
