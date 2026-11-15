# button-face

## SVG authoring notes

Avoid strokes in SVG icons: convert strokes to filled paths before use (in
Inkscape: *Path > Stroke to Path*; this repo's `scripts/strokes-to-paths.js`
does it from the command line).

Some renderers handle strokes inconsistently. For example Skia (used in Node
via `@napi-rs/canvas`) ignores a unitless `stroke-width` inside a `style`
attribute (`style="stroke-width:0.7"`), so the stroke is drawn at the wrong
width. button-face patches this common case, but filled paths render the same
everywhere and are the most reliable choice.
