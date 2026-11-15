# button-face

button-face renders button images from layers: solid fills, SVG icons and
word-wrapped text. You describe a button as a small, JSON-friendly
*definition*, call `render(definition, width, height)`, and get back a raw
pixel buffer (RGB or RGBA) at any size. Its main use is the key images of
Stream Deck-style hardware button panels, but the same definitions render
for on-screen previews and UIs. It runs in Node (Skia via `@napi-rs/canvas`)
and in the browser (the page's own canvas).

```js
import { render } from "@toptensoftware/button-face/node";

let { data } = await render({
    layers: [
        { type: "fill", color: "#202020" },
        { type: "svg", src: "#play", color: "white", scale: 0.6, translate: { y: -8 } },
        { type: "text", text: "Play", font: "bold 12px sans-serif", valign: "bottom" },
    ],
}, 72, 72);
// data: 72 x 72 x 3 bytes of RGB
```

## Contents

- [Features](#features)
- [Rationale](#rationale)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Usage guide](#usage-guide)
  - [Definitions and layers](#definitions-and-layers)
  - [Colors](#colors)
  - [Recoloring SVGs](#recoloring-svgs)
  - [Units and scaling](#units-and-scaling)
  - [Built-in icons](#built-in-icons)
  - [Material Symbols](#material-symbols)
  - [SVG sources and resolvers](#svg-sources-and-resolvers)
  - [Using button-face in the browser](#using-button-face-in-the-browser)
  - [Using button-face in Node](#using-button-face-in-node)
  - [SVG authoring notes](#svg-authoring-notes)
- [Switching from node-buttonImage](#switching-from-node-buttonimage)
- [Reference](#reference)
- [Development](#development)
- [License](#license)

## Features

- **Layered definitions** - stack any number of `fill`, `svg` and `text`
  layers, each with `visible` and `opacity`. Definitions are plain data, so
  they can be stored as JSON.
- **Resolution independent** - author in *virtual pixels* (72 x 72 by
  default) and render at any device size.
- **42 built-in icons** (`#play`, `#volume-up`, `#settings`, ...) bundled
  with the package.
- **Thousands of Google Material Symbols** by name (`@home`,
  `@arrow_back?fill=1&weight=700`), downloaded on first use and cached.
- **Flexible SVG recoloring** - set the icon color, remap specific colors
  with a color map, or tint everything to one color.
- **Word-wrapped text** with alignment, line spacing, padding and any CSS
  font.
- **Node and browser** - the same definitions render through Skia in Node
  or the browser's canvas, with a pluggable backend for anything else.
- **Raw output** - `Uint8Array` pixels, RGB (default) or RGBA, ready for a
  device or a canvas.
- **Strict validation** with clear error messages.
- **Plain ESM JavaScript** with JSDoc types, no build step.

## Rationale

button-face is a fresh break-away from
[node-buttonImage](https://github.com/toptensoftware/node-buttonImage), a
library for generating button images for Stream Deck and similar devices.
That library had a single flat set of options (`backColor`, `svgFile`,
`svgForeColor`, `text`, ...), recolored icons by literally replacing one gray
in the SVG text, depended on sharp and node-canvas, and only ran in Node.

button-face keeps what worked - virtual-pixel resolution independence, the
built-in icon set, the text layout - and changes the rest:

- **Typed layers** instead of a fixed set of properties, so a button can
  have several icons or text blocks.
- **Better recoloring**: color maps that understand SVG paint values,
  `currentColor`, and tinting.
- **One Canvas-2D renderer** that runs in Node and in the browser, with a
  single native dependency (`@napi-rs/canvas`, prebuilt) instead of sharp +
  node-canvas.
- **Material Symbols by name**, with no manual downloading or patching of
  SVG files.
- **No state or caching**: button states and render caches are left to the
  caller, which keeps the library small and predictable.

Old node-buttonImage options can be converted with one call - see
[Switching from node-buttonImage](#switching-from-node-buttonimage).

## Installation

```sh
npm install toptensoftware/button-face
```

This installs from GitHub (the package isn't published to the npm registry).
Import it by its package name, `@toptensoftware/button-face`.

- **Node**: version 24 or later. Rendering uses
  [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) (Skia), which
  ships prebuilt binaries - no system libraries or compilers needed.
- **Browser**: there is no pre-built bundle; bring the package in with your
  own bundler. It is plain ESM with no build step, and the core entry imports
  nothing outside the package. In browser code import
  `@toptensoftware/button-face`, never `@toptensoftware/button-face/node`.
  (`@napi-rs/canvas` is a regular dependency, so `npm install` downloads it
  even for web-only use, but a bundler won't include it.)

The package has two entry points:

| Import | Contents |
|---|---|
| `@toptensoftware/button-face` | The portable, browser-safe core: `render` (backend required), `browserBackend`, resolvers, icons and utilities. |
| `@toptensoftware/button-face/node` | Everything in the core, plus `napiBackend`, file and disk-cache helpers, and a `render` with Node defaults. |

## Quick start

**Node** - render a key image as raw RGB, e.g. for a Stream Deck library's
`fillKeyBuffer`:

```js
import { render } from "@toptensoftware/button-face/node";

let definition = {
    layers: [
        { type: "fill", color: "#1d3557" },
        { type: "svg", src: "#volume-up", color: "white" },
    ],
};

let { data, width, height, channels } = await render(definition, 72, 72);
// data is a Uint8Array of width * height * channels bytes (channels = 3, RGB)
```

**Browser** - render RGBA and draw it onto a `<canvas>`:

```js
import { render, browserBackend, createSvgResolver } from "@toptensoftware/button-face";

let { data, width, height } = await render(definition, 96, 96, {
    backend: browserBackend,
    resolveSvg: createSvgResolver(),
    channels: 4,
});

let canvas = document.querySelector("canvas");
canvas.width = width;
canvas.height = height;
let pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
canvas.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
```

## Usage guide

### Definitions and layers

A definition is a plain object:

```js
{
    virtualSize: { width: 72, height: 72 },  // optional, default 72 x 72
    layers: [ /* painted bottom to top */ ],  // optional
}
```

`render(definition, width, height, options)` paints the layers in array
order (first = bottom) onto a `width` x `height` pixel image and resolves to
`{ data, width, height, channels }`. With no layers the result is black (RGB)
or transparent (RGBA). `virtualSize` sets the coordinate space the layers are
authored in - see [Units and scaling](#units-and-scaling).

Every layer has a `type` and two optional common properties:

- `visible` - `false` skips the layer.
- `opacity` - 0 to 1, multiplies the layer's alpha (`0` skips it).

There are three layer types.

**fill** paints the whole button one color:

```js
{ type: "fill", color: "#2a9d8f" }
```

**svg** draws an SVG, centered. `src` is a reference to an icon or file
(see [SVG sources and resolvers](#svg-sources-and-resolvers)); `svg` is
inline markup instead. Use exactly one of them.

```js
{ type: "svg", src: "#heart", color: "crimson", scale: 0.8 }
{ type: "svg", src: "@home" }                       // Material Symbols icon
{ type: "svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#848484"/></svg>' }
```

The SVG is drawn `scale` x the button's height (default `1`, the full
height), keeping its aspect ratio, and offset from the center by
`translate`. If the SVG contains the literal text `$(x)`, the layer's `text`
property replaces every occurrence (the text isn't XML-escaped). Coloring
options are covered in [Recoloring SVGs](#recoloring-svgs).

**text** draws word-wrapped, aligned text:

```js
{
    type: "text",
    text: "Mute\nMic",                // "\n" forces a line break
    font: "bold 14px sans-serif",     // any CSS font with a px size
    color: "yellow",
    align: "center",                  // left | center | right
    valign: "bottom",                 // top | center | bottom
    padding: [3, 6],                  // [top/bottom, left/right]
}
```

Text wraps on spaces; a word wider than the button gets a line of its own
(it isn't clipped). Text is measured with the same font engine that draws it,
so wrapping always matches the output. The font must be available where the
button is rendered (see the [browser](#using-button-face-in-the-browser) and
[Node](#using-button-face-in-node) notes).

Putting it together - a dimmed "disabled" style button with a caption:

```js
let definition = {
    layers: [
        { type: "fill", color: "#333" },
        { type: "svg", src: "@mic_off?fill=1", color: "#e63946", scale: 0.6, translate: { y: -8 } },
        { type: "text", text: "Muted", font: "bold 12px sans-serif", valign: "bottom" },
        { type: "fill", color: "black", opacity: 0.5, visible: isDisabled },
    ],
};
```

**Async and errors.** `render` is async: all layers are validated and their
SVGs loaded concurrently, then painted in order. Validation is strict - an
unknown color, a bad `align`, `scale: 0` and the like all reject the render
before anything is drawn, with a `TypeError` or `RangeError` whose message
names the layer type:

```js
await render({ layers: [{ type: "svg", src: "#play", tint: "nope" }] }, 72, 72);
// TypeError: svg layer: invalid tint 'nope'
```

The full list of properties and defaults is in the [Reference](#reference).

### Colors

Anywhere a color is expected (`color`, `tint`, keys of `colors`) these CSS
formats are accepted:

| Format | Examples |
|---|---|
| Hex | `#fa0`, `#fa08`, `#ffaa00`, `#ffaa0080` (any case) |
| `rgb()` / `rgba()` | `rgb(255, 170, 0)`, `rgba(255, 170, 0, 0.5)`, `rgb(255 170 0 / 0.5)` |
| `hsl()` / `hsla()` | `hsl(40, 100%, 50%)`, `hsl(40deg 100% 50% / 0.5)`, `hsl(0.1turn 100% 50%)` |
| Named colors | the 148 CSS names (`red`, `rebeccapurple`, ...), case-insensitive, and `transparent` |

`rgb()` and `rgba()` are aliases (as are `hsl()` / `hsla()`) and accept both
comma and space syntax; out-of-range values are clamped. Hue units may be
`deg`, `grad`, `rad`, `turn` or none; saturation and lightness must be
percentages.

Not accepted: `currentColor`, `none`, `hwb()`, `lab()`, `oklch()`, `color()`
and `var()`. An invalid color rejects the render.

### Recoloring SVGs

An svg layer has three coloring tools, applied in this order: `colors`
(a color map), `color` (what `currentColor` means) and `tint`.

**`color` and `currentColor`.** The built-in icons and Material Symbols are
single-color icons painted with `currentColor`. The layer's `color` (default
gray `#848484`) is what `currentColor` resolves to, so it recolors them:

```js
{ type: "svg", src: "#play", color: "white" }
{ type: "svg", src: "@home", color: "rgb(0 200 255)" }
```

Your own SVGs can do the same by painting with `currentColor`.

**The `#848484` recolor key.** By convention (inherited from
node-buttonImage), icons are drawn in gray `#848484`, and the default
`color` is that same gray. A `colors` key that matches the layer's `color`
also recolors `currentColor`, so this map recolors built-ins, Material icons
*and* your own SVGs drawn in `#848484` alike:

```js
{ type: "svg", src: "icons/mute.svg", colors: { "#848484": "white" } }
{ type: "svg", src: "#volume-mute", colors: { "#848484": "white" } }   // same as color: "white"
```

**`colors` - color maps.** `colors` maps colors in the SVG to new ones. It
looks at paint values - `fill`, `stroke`, `stop-color`, `flood-color`,
`lighting-color` and `color`, whether written as attributes, in `style=""`
or in `<style>` rules - and never touches `url(...)` references, `none` or
ids.

```js
{
    type: "svg",
    src: "logo.svg",
    colors: {
        "#ff0000": "#00ff00",   // red parts become green
        "#00ff00": "#ff0000",   // and green parts red - swaps work
        "white": "transparent",
    },
}
```

- Keys must be valid [colors](#colors). Matching is by value, not text:
  `#848484`, `rgb(132,132,132)` and `#848484ff` are the same key.
- The first matching key wins, and replaced values are not mapped again
  (which is why swaps work).
- Values are written as given, so they can be any CSS color or e.g.
  `currentColor`.
- `colors` may also be a `Map`.

The key-matching rule for `currentColor` works with any `color`:
`{ color: "red", colors: { red: "blue" } }` draws `currentColor` blue.

**`tint`.** `tint` paints every non-transparent pixel one color, keeping each
pixel's alpha - handy for turning a multi-color icon into a single color.
The tint's own alpha multiplies in.

```js
{ type: "svg", src: "#steam", tint: "white" }
```

**Fixed colors.** Only `currentColor` follows `color`. Parts of an icon
drawn in other colors - for example the red dot on `#hdd`, or the logo colors
of `#steam` and `#playstation` - stay as they are; remap them with `colors`
or flatten everything with `tint`.

**Gotcha:** a `color` attribute or style on an element inside your SVG
overrides the layer's `color` for `currentColor` within that element.

### Units and scaling

Definitions are authored in *virtual pixels* on a button of `virtualSize`
(default 72 x 72) and rendered at whatever device size you ask for. The
horizontal and vertical scale factors are `width / virtualSize.width` and
`height / virtualSize.height`.

These values are in virtual pixels and scale with the output:

- `translate` (svg and text layers) - x by the horizontal scale, y by the
  vertical scale.
- text `padding` - left/right horizontally, top/bottom vertically.
- the text `font` size - by the **vertical** scale only.

So with the default virtual size, `translate: { y: -7 }` moves a layer up
about 10% of the button height at any size: 7 device pixels at 72 x 72, 14
at 144 x 144.

The svg layer's `scale` is different: it is a fraction of the *device*
button height and doesn't depend on `virtualSize`. The SVG's own size only
supplies its aspect ratio. A `scale: 0.5` icon is always half the button's
height.

Rendering one definition at several sizes:

```js
for (let size of [72, 96, 144])
{
    let { data } = await render(definition, size, size);
    // ...
}
```

**Non-square buttons.** Set `virtualSize` to the button's shape, e.g.
`virtualSize: { width: 144, height: 72 }` for a 144 x 72 device button.
Otherwise horizontal and vertical values scale differently, and because
fonts follow the height only, text can look narrow or wide relative to its
padding.

Sizes and positions are rounded to whole pixels, and anything outside the
button is clipped.

### Built-in icons

42 icons are bundled with the package and referenced with a `#` prefix:

```js
{ type: "svg", src: "#power", color: "#e63946" }
```

`add`, `apple-tv`, `apps`, `arrow-down`, `arrow-left`, `arrow-right`,
`arrow-up`, `cancel`, `cancel-circle`, `check`, `circle`, `cross`, `delete`,
`diamond`, `forward`, `function`, `guide`, `hdd`, `heart`, `home`, `info`,
`list`, `next-track`, `ok`, `option`, `pause`, `play`, `play-pause`,
`playstation`, `power`, `previous-track`, `refresh`, `rewind`, `settings`,
`square`, `star`, `steam`, `stop`, `triangle`, `volume-down`, `volume-mute`,
`volume-up`.

The list is also available at runtime: `Object.keys(icons)` (the `icons`
export maps each name to its SVG markup).

- Icons are gray `#848484` by default and recolor with `color` - see
  [Recoloring SVGs](#recoloring-svgs).
- `hdd`, `steam` and `playstation` have fixed-color parts that `color`
  doesn't change.
- `heart`, `square` and `circle` are outlines.
- Most are derived from Material Symbols (Outlined, weight 200), so they
  match the [Material Symbols](#material-symbols) icons.

To see them all, run `npm run samples` or `npm run samples:browser` in a
clone of the repository (see [Development](#development)).

### Material Symbols

An svg layer's `src` can name any [Google Material Symbols](https://fonts.google.com/icons)
icon with an `@` prefix. The SVG is downloaded the first time it is used and
cached:

```js
{ type: "svg", src: "@home", color: "white" }
{ type: "svg", src: "@arrow_back?style=rounded&fill=1&weight=700" }
```

Syntax: `@name?style=&fill=&weight=&grade=&size=`. `name` is the icon's
lowercase snake_case name as shown on fonts.google.com (`home`,
`arrow_back`). All settings are optional, in any order, lowercase, each at
most once.

| Setting  | Values                                 | Default    |
|----------|----------------------------------------|------------|
| `style`  | `outlined`, `rounded`, `sharp`         | `outlined` |
| `fill`   | `0`, `1` (or `false`, `true`)          | `0`        |
| `weight` | `100`, `200`, ... `700`                | `200`      |
| `grade`  | `-25`, `0`, `200`                      | `0`        |
| `size`   | `20`, `24`, `40`, `48` (optical size)  | `24`       |

The default weight is 200 (Google's is 400), matching the built-in icons, so
`@add` looks exactly like `#add`.

**Coloring and sizing.** Material icons are normalized to paint with
`currentColor` and their viewBox is padded by 15% per side, so they color
and size just like the built-in icons: `color: "red"` (or
`colors: { "#848484": "red" }`), with a margin around the icon at
`scale: 1`. Adjust with the layer's `scale` / `translate`, or use a resolver
with `pad: 0` (see [Advanced](#advanced-custom-material-resolvers)) for
unpadded icons.

**Caching.**

- Node (`@toptensoftware/button-face/node`): on disk in
  `<os.tmpdir()>/button-face/material/<style>/<name>/<variant>/<size>.svg`,
  plus in memory. Delete that directory to clear it. Change the location with
  `createNodeSvgResolver({ material: { cacheDir } })` (see
  [SVG sources and resolvers](#svg-sources-and-resolvers)).
- Browser: `localStorage`, keys prefixed `button-face:material:`, plus in
  memory. If `localStorage` is unavailable or full, icons just aren't
  persisted. Clear by removing those keys.
- Cached icons are never refreshed (published glyphs don't change), and
  cache failures are ignored.

**Errors and offline use.** Invalid names or settings are rejected before
any download. A name/setting combination Google doesn't publish fails with
"unknown material icon ... (HTTP 404 ...)". Offline, cached icons still
render; uncached ones fail with "could not download material icon ...".
Identical concurrent requests share one download.

#### Advanced: custom Material resolvers

`createMaterialResolver(options)` returns the `@` handler, to register with
[`createSvgResolver`](#svg-sources-and-resolvers):

```js
import { createSvgResolver, createMaterialResolver } from "@toptensoftware/button-face";

let resolveSvg = createSvgResolver({
    prefixes: { "@": createMaterialResolver({ defaults: { weight: 400 }, pad: 0 }) },
});
```

| Option | Default | Description |
|---|---|---|
| `fetch` | global `fetch` | The function used to download icons. |
| `cache` | `createStorageCache()` (`localStorage`) | Any `{ get(key), set(key, svg) }` returning promises; `null` = memory only. |
| `url` | `materialIconUrl` | Builds the download URL from the parsed reference. |
| `defaults` | - | Settings applied under each reference's own, e.g. `{ weight: 400 }` (validated on creation). |
| `pad` | `0.15` | viewBox padding per side, as a fraction; `0` = unpadded. |

Icons are downloaded from
`https://fonts.gstatic.com/s/i/short-term/release/materialsymbols{style}/{name}/{variant}/{size}px.svg`,
which allows cross-origin requests, so it works from browsers too. This is
the URL scheme fonts.google.com uses but it isn't formally documented; if it
changes, pass a `url` builder pointing elsewhere.

### SVG sources and resolvers

An svg layer's `src` is passed to a *resolver*, an async function
`(src) => svgString`. A resolver picks a handler by prefix:

| `src` | Handler | Available |
|---|---|---|
| `#name` | [built-in icons](#built-in-icons) | always |
| `@name?...` | [Material Symbols](#material-symbols) | Node default; add it yourself elsewhere |
| anything else | file path, relative to the current directory | Node default only |

The Node entry's `render` uses a ready-made resolver with all three. The core
`render` has **no default resolver**: pass `resolveSvg` if any layer uses
`src` (layers using inline `svg` don't need one).

**`createSvgResolver({ prefixes, fallback })`** builds a resolver.
`#` is registered by default; `prefixes` (an object or `Map`) adds or
replaces handlers, and a `null` value removes one. The longest matching
prefix wins, and its handler gets `src` with the prefix removed. `fallback`
gets the whole `src` when no prefix matches; with neither, the render
rejects with "no SVG resolver for '...'". Handlers may be sync or async,
must return an SVG string and report errors by throwing.

For example, a browser resolver with built-ins, Material Symbols, a custom
prefix and URL fetching for everything else:

```js
import { createSvgResolver, createMaterialResolver } from "@toptensoftware/button-face";

const myIcons = { logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">...</svg>' };

let resolveSvg = createSvgResolver({
    prefixes: {
        "@": createMaterialResolver(),
        "my:": (name) => myIcons[name],          // src: "my:logo"
    },
    fallback: async (url) => {                   // src: "/icons/mute.svg"
        let res = await fetch(url);
        if (!res.ok)
            throw new Error(`can't load ${url}: HTTP ${res.status}`);
        return res.text();
    },
});
```

**`createNodeSvgResolver({ baseDir, prefixes, material })`** (Node entry)
builds the Node-style resolver: `#` built-ins, `@` Material Symbols cached on
disk, your extra `prefixes` (these win over the defaults; `"@": null`
removes Material), and file paths for everything else.

```js
import { render, createNodeSvgResolver } from "@toptensoftware/button-face/node";

let resolveSvg = createNodeSvgResolver({
    baseDir: "./assets/icons",                       // file paths resolve here
    material: { cacheDir: "./cache/material" },      // or false to disable "@"
});

await render({ layers: [{ type: "svg", src: "mute.svg" }] }, 72, 72, { resolveSvg });
```

`baseDir` defaults to the current directory at resolve time. `material`
takes the [`createMaterialResolver` options](#advanced-custom-material-resolvers)
plus `cacheDir`, or `false`.

### Using button-face in the browser

Import the core entry and pass `browserBackend` and a resolver to `render`
(see the [Quick start](#quick-start) for drawing the result onto a canvas):

```js
import { render, browserBackend, createSvgResolver, createMaterialResolver } from "@toptensoftware/button-face";

const options = {
    backend: browserBackend,
    resolveSvg: createSvgResolver({ prefixes: { "@": createMaterialResolver() } }),
    channels: 4,
};

let result = await render(definition, 72, 72, options);
```

`createMaterialResolver()` downloads with the global `fetch` and caches in
`localStorage` (see [Material Symbols](#material-symbols)). There is no
file-path fallback in the browser; add one that fetches URLs as shown in
[SVG sources and resolvers](#svg-sources-and-resolvers).

Things to know:

- **Main thread only.** `browserBackend` draws on an `OffscreenCanvas` (or a
  `<canvas>` element), but decodes SVGs with `Image`, which isn't available
  in Web Workers.
- **Fonts.** Text layers use the page's fonts. Load web fonts before
  rendering, or a fallback font is used:
  `await document.fonts.load("bold 16px MyFont")`.
- **No external resources in SVGs.** Browsers decode SVGs as images, which
  can't load web fonts, `<image href>` or external CSS (Node can). Keep SVGs
  self-contained.
- SVGs missing `xmlns` or a viewBox are patched automatically before
  decoding.

### Using button-face in Node

Import the Node entry. Its `render` defaults `backend` to `napiBackend`
(Skia via `@napi-rs/canvas`) and `resolveSvg` to the default Node resolver
(`#`, `@` and file paths relative to the current directory - see
[SVG sources and resolvers](#svg-sources-and-resolvers)). Text layers use
the fonts installed on the system.

```js
import { render } from "@toptensoftware/button-face/node";

let rgb = await render(definition, 72, 72);                     // RGB
let rgba = await render(definition, 72, 72, { channels: 4 });   // RGBA
```

There is no PNG helper, but the `napiBackend` canvas can encode one:

```js
import { writeFile } from "node:fs/promises";
import { render, napiBackend } from "@toptensoftware/button-face/node";

let { data, width, height } = await render(definition, 144, 144, { channels: 4 });
let canvas = napiBackend.createCanvas(width, height);
let ctx = canvas.getContext("2d");
let image = ctx.createImageData(width, height);
image.data.set(data);
ctx.putImageData(image, 0, 0);
await writeFile("button.png", canvas.toBuffer("image/png"));
```

### SVG authoring notes

Avoid strokes and text in SVG icons: convert them to filled paths before use
(in Inkscape: *Path > Stroke to Path* and *Path > Object to Path*; the
script `scripts/to-paths.js` in the repository does both from the command
line). Text also depends on the fonts installed where the button is
rendered.

Some renderers handle strokes inconsistently. For example Skia (used in Node
via `@napi-rs/canvas`) ignores a unitless `stroke-width` inside a `style`
attribute (`style="stroke-width:0.7"`), so the stroke is drawn at the wrong
width. button-face patches this common case, but filled paths render the same
everywhere and are the most reliable choice.

For icons that should follow the layer's `color`, paint them with
`currentColor` or the `#848484` key (see [Recoloring SVGs](#recoloring-svgs)),
and keep them self-contained (no external images, fonts or CSS).

## Switching from node-buttonImage

button-face replaces
[node-buttonImage](https://github.com/toptensoftware/node-buttonImage). The
look of a button carries over almost exactly, but the API is different: there
is no `ButtonImage` class, and a button is described by a plain
[definition](#definitions-and-layers) made of layers instead of one flat set
of options.

### Converting old definitions

Old options are **not** converted automatically. Passing one straight to
`render` rejects with a hint:

```
TypeError: render: definition looks like a node-buttonImage definition (has 'backColor') - convert it with convertLegacyDefinition()
```

`convertLegacyDefinition(old)` turns node-buttonImage options (or a
`ButtonImage` instance) into a button-face definition. A definition that
already has a `layers` key is returned unchanged, so during a migration you
can pass old and new definitions through it alike. It doesn't validate;
`render` does.

```js
import { render, convertLegacyDefinition } from "@toptensoftware/button-face/node";

let definition = convertLegacyDefinition({
    backColor: "#202020",
    svgFile: "icons/mute.svg",
    svgForeColor: "white",
    svgScale: 0.6,
    text: "Mute",
    textVAlign: "bottom",
});
let { data } = await render(definition, 72, 72);
```

| node-buttonImage | button-face |
|---|---|
| `virtualSize` | definition `virtualSize` |
| `backColor` (default black) | first layer: `{ type: "fill", color }` |
| `svgCode` / `svgFile` | svg layer `svg` / `src` (`svgCode` wins if both are set) |
| `svgText` | svg `text` |
| `svgForeColor` | svg `colors: { "#848484": color }` |
| `svgScale`, `svgTranslate` | svg `scale`, `translate` |
| `text` | last layer: `{ type: "text", text }` |
| `textColor`, `textAlign`, `textVAlign` | text `color`, `align`, `valign` |
| `font`, `textLineSpacing`, `textPadding`, `textTranslate` | text `font`, `lineSpacing`, `padding`, `translate` |

`channels`, `states` / `state`, `onInvalidate` and unknown keys are ignored
(see below).

### API changes

| node-buttonImage | button-face |
|---|---|
| `new ButtonImage(options)` then `await bi.render(w, h, channels)` | `await render(definition, w, h, { channels })` |
| `drawButton(w, h, { ...options, channels })` | `render(definition, w, h, { channels })` |
| `render` resolves to a raw pixel buffer | `render` resolves to `{ data, width, height, channels }` - send `data` to the device |
| `svgFile` read from disk when the property is set | `src` resolved when rendering (relative to the current directory, or `baseDir` - see [SVG sources and resolvers](#svg-sources-and-resolvers)) |
| Node only (sharp + node-canvas) | Node (`/node` entry) and browser (core entry, `browserBackend`) |

### What's different

- **Layers.** A button can have any number of fill, svg and text layers in
  any order, each with its own `visible` and `opacity`.
- **Recoloring.** `svgForeColor` replaced the literal text `#848484`
  anywhere in the SVG. The svg layer's `colors` map matches colors by value
  (`#848484`, `#848484ff` and `rgb(132, 132, 132)` all match) and only in
  paint values; `color` and `tint` are new. See
  [Recoloring SVGs](#recoloring-svgs).
- **Validation is strict.** Invalid colors, alignments or sizes reject the
  render with a clear message, where the old library often ignored them or
  fell back silently.
- **Material icons by name.** Instead of downloading icons and patching
  their `viewBox` and fill by hand, use `src: "@name"` (see
  [Material Symbols](#material-symbols)); the padding and default weight
  match the built-in icons.
- **Rendering engine.** Skia (`@napi-rs/canvas`) in Node, the browser's
  canvas in browsers, instead of sharp/librsvg and node-canvas/Pango. Expect
  tiny pixel differences, mostly in text.

### No longer supported

- **The `ButtonImage` class** and with it:
  - **Button states** (`states` / `state`): keep one definition per state.
    To convert old states, merge each one over the base options yourself:
    `convertLegacyDefinition({ ...old, ...old.states.checked })`.
  - **Invalidation** (`onInvalidate`): definitions are plain data; re-render
    when you change one.
  - **Render caching**: `render` always renders. Keep the results yourself
    if you need to (one per size, state and device).
- **`drawButton` and `drawText`** - use `render`.
- **`StreamDeckDevice` and `Button`** - device handling is out of scope;
  send `data` from `render` to your device library yourself.
- **The `channels` option in a definition** - pass it to `render` instead.

## Reference

### Definition

| Property | Type | Default | Description |
|---|---|---|---|
| `virtualSize` | `{ width, height }` | `{ width: 72, height: 72 }` | Size of the virtual-pixel space layers are authored in (both > 0). |
| `layers` | array | `[]` | Layers, painted bottom (first) to top (last). |

### Layers

All layers:

| Property | Type | Default | Description |
|---|---|---|---|
| `type` | `"fill"` \| `"svg"` \| `"text"` | required | The layer type. |
| `visible` | boolean | `true` | `false` skips the layer (it isn't validated further). |
| `opacity` | number 0-1 | `1` | Multiplies the layer's alpha; `0` skips it. |

**fill**

| Property | Type | Default | Description |
|---|---|---|---|
| `color` | color | `"black"` | Color that fills the whole button. |

**svg**

| Property | Type | Default | Description |
|---|---|---|---|
| `src` | string | - | Reference resolved by `resolveSvg` (`#name`, `@name?...`, file path); exactly one of `src` / `svg`. |
| `svg` | string | - | Inline SVG markup. |
| `text` | string \| number | - | Replaces every literal `$(x)` in the SVG. |
| `colors` | object \| `Map` | - | Color map `{ from: to }` applied to the SVG's paint values. |
| `color` | color | `"#848484"` | What `currentColor` resolves to. |
| `tint` | color | - | Paints every non-transparent pixel this color, keeping alpha. |
| `scale` | number > 0 | `1` | Drawn height as a fraction of the device button height (aspect ratio kept). |
| `translate` | `{ x?, y? }` | - (centered) | Offset from the center, in virtual pixels. |

**text**

| Property | Type | Default | Description |
|---|---|---|---|
| `text` | string \| number | - | The text; `\n` forces a line break, empty draws nothing. |
| `font` | CSS font | `"bold 16px sans-serif"` | Font, with its size in virtual `px` (required). |
| `color` | color | `"white"` | Text color. |
| `align` | `"left"` \| `"center"` \| `"right"` | `"center"` | Horizontal alignment. |
| `valign` | `"top"` \| `"center"` \| `"bottom"` | `"center"` | Vertical alignment. |
| `lineSpacing` | number > 0 | `1` | Line height multiplier. |
| `padding` | number \| `[tb, lr]` \| `[t, r, b, l]` | `3` | Inset from the button edges, in virtual pixels. |
| `translate` | `{ x?, y? }` | - | Offset of the text block, in virtual pixels. |

### API: core entry (`@toptensoftware/button-face`)

| Export | Description |
|---|---|
| `render(definition, width, height, options)` | Renders a definition to pixels (see below). |
| `browserBackend` | Backend using the browser's canvas and `Image` ([caveats](#using-button-face-in-the-browser)). |
| `createSvgResolver({ prefixes?, fallback? })` | Builds a resolver with `#` built-ins ([details](#svg-sources-and-resolvers)). |
| `createMaterialResolver(options?)` | Builds the `@` Material Symbols handler ([options](#advanced-custom-material-resolvers)). |
| `createStorageCache({ storage?, prefix? })` | `{ get, set }` string cache over Web Storage (default `localStorage`, prefix `"button-face:material:"`). |
| `convertLegacyDefinition(old)` | Converts node-buttonImage options; returns a definition with `layers` unchanged ([details](#converting-old-definitions)). |
| `icons` | Frozen `{ name: svgMarkup }` of the [built-in icons](#built-in-icons). |
| `resolveBuiltinIcon(name)` | The `#` handler: returns a built-in icon's SVG. |
| `layerTypes` | Frozen registry of the layer types (read-only). |

`render` options and result:

| Option | Type | Default | Description |
|---|---|---|---|
| `width`, `height` | integer > 0 | required | Output size in device pixels. |
| `backend` | Backend | required (Node entry: `napiBackend`) | The canvas backend to draw with. |
| `resolveSvg` | `(src) => Promise<string>` | none (Node entry: default Node resolver) | Resolves svg layer `src` references. |
| `channels` | `3` \| `4` | `3` | `3` = RGB composited over black, `4` = RGBA (not premultiplied). |

It resolves to `{ data, width, height, channels }`, where `data` is a
`Uint8Array` of `width * height * channels` bytes, row by row, with no
padding.

**Custom backends.** A backend is any object
`{ createCanvas(width, height), loadSvgImage(svg, width, height) }`.
`createCanvas` returns a transparent canvas with `getContext("2d")`;
`loadSvgImage` resolves to something `drawImage` accepts, rendered crisply at
that size, and rejects if the SVG can't be decoded.

**Utilities** (also exported from the core entry):

| Export | Description |
|---|---|
| `parseColor(css)` | Parses a CSS color to `{ r, g, b, a }`, or `null` if invalid. |
| `colorsEqual(a, b)` | Compares two CSS colors by value. |
| `formatColor({ r, g, b, a })` | Formats a color as `#rrggbb` or `rgba(...)`. |
| `namedColors` | The CSS named colors. |
| `applyColorMap(svg, map)` | Applies a `colors` map to SVG markup. |
| `lookupColor(map, value)` | Looks a color up in a color map (normalized matching). |
| `mapPaintValues(svg, fn)` | Rewrites every paint value in SVG markup with `fn`. |
| `findPaintValues(svg)` | Lists the paint values in SVG markup. |
| `getRootAttribute(svg, name)` | Reads an attribute of the root `<svg>`. |
| `setRootAttribute(svg, name, value)` | Sets an attribute on the root `<svg>`. |
| `setRootColor(svg, color)` | Sets the root `color` attribute. |
| `substituteText(svg, text)` | Replaces every `$(x)` with `text`. |
| `normalizeStyleLengths(svg)` | Adds `px` to unitless lengths in CSS (the Skia `stroke-width` fix). |
| `getSvgSize(svg)` | The SVG's natural size, from width/height/viewBox. |
| `getViewBox(svg)` | The root viewBox. |
| `padViewBox(svg, fraction)` | Pads the viewBox by a fraction per side. |
| `parseViewBox(value)` | Parses a viewBox attribute value. |
| `parseLength(value)` | Parses an SVG length. |
| `prepareSvgImage(svg, width, height)` | Readies SVG markup for browser image decoding (adds `xmlns`/viewBox, sets size). |
| `createScaler(virtualSize, width, height)` | Virtual-to-device pixel scaler. |
| `scaleFont(font, scale)` | Scales the px size in a CSS font string. |
| `DEFAULT_VIRTUAL_SIZE` | `{ width: 72, height: 72 }`. |
| `wrapLines(text, measure, maxWidth)` | The text layer's word wrapper. |
| `MATERIAL_DEFAULTS` | Default Material Symbols settings. |
| `validateMaterialParams(params)` | Validates Material Symbols settings. |
| `parseMaterialRef(ref)` | Parses a Material reference (without the `@`). |
| `materialVariant(params)` | The download variant segment (e.g. `wght200fill1`). |
| `materialIconUrl(params)` | The default download URL builder. |
| `materialCacheKey(params)` | The cache key for a Material icon. |

### API: Node entry (`@toptensoftware/button-face/node`)

Everything from the core entry, plus:

| Export | Description |
|---|---|
| `render(definition, width, height, options?)` | The core `render` with `backend` defaulting to `napiBackend` and `resolveSvg` to `resolveSvg`. |
| `napiBackend` | Backend over `@napi-rs/canvas` (Skia). |
| `createNodeSvgResolver({ baseDir?, prefixes?, material? })` | Builds a resolver with `#`, `@` and file paths ([details](#svg-sources-and-resolvers)). |
| `resolveSvg` | The default Node resolver, `createNodeSvgResolver()`. |
| `createFileResolver({ baseDir? })` | Resolver that reads SVG files (relative to `baseDir`, default the current directory). |
| `createFsCache({ dir? })` | `{ get, set, dir }` directory cache (default `<os.tmpdir()>/button-face/material`). |

## Development

```sh
git clone https://github.com/toptensoftware/button-face.git
cd button-face
npm install
npm test
```

- **Tests** use Node's built-in test runner (`npm test`) and must pass with
  0 failures.
- **Browser tests** (`test/browser*.test.js`) drive real browsers with
  `playwright-core`: Chromium through an installed Chrome, then Edge, and
  Firefox and WebKit through Playwright-managed builds. Install those with
  `node node_modules/playwright-core/cli.js install firefox webkit` (again
  after upgrading `playwright-core`). Engines that can't launch are skipped.
  `BUTTON_FACE_BROWSER_TESTS`: unset = run what's available, `0` = skip all,
  `1` = fail if no engine launches. `test/browser-compare.test.js` compares
  every sample's browser render with Node's, pixel by pixel.
- **Live Material tests** are off by default (tests never touch the network);
  run them with `BUTTON_FACE_LIVE_TESTS=1 node --test test/material-live.test.js`.
- **Samples:** `npm run samples` renders every sample to PNGs plus a contact
  sheet in `scratch/samples/` for visual review. `npm run samples:browser`
  serves a demo page (port 8080; pass another port as an argument or in
  `PORT`) that renders the same samples with `browserBackend` beside the Node
  PNGs.
- **Adding a built-in icon:** add `icons/<name>.svg`, drawn in the `#848484`
  key gray, then run `npm run build:icons` to regenerate `src/icons.js`
  (generated - don't edit it; a test fails if it is stale). Built-in icons
  must be filled paths only, with no strokes or text (see
  [SVG authoring notes](#svg-authoring-notes)); convert with
  `node scripts/to-paths.js icons/<name>.svg` (needs Inkscape).

## License

MIT - Copyright © 2026 Topten Software. See [LICENSE](LICENSE).

- [Material Symbols](https://fonts.google.com/icons) are © Google, under the
  [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). Icons
  referenced with `@` are downloaded at runtime, not bundled. Many of the
  built-in icons are derived from Material Symbols and are bundled under the
  same license.
- The `steam`, `playstation` and `apple-tv` built-in icons are brand logos;
  the marks are trademarks of their respective owners.
