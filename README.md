# button-face

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
