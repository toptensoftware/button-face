# Browser rendering backend

Status: Complete

## Description

Implement a browser rendering backend that satisfies the `Backend` contract in
`src/backend.js` (`createCanvas`, `loadSvgImage`), as the browser counterpart
to `src/backends/napi.js` (`napiBackend`). Likely built on `OffscreenCanvas` /
`HTMLCanvasElement` and `Image` / `createImageBitmap`, and exported from the
browser-safe core (`src/index.js`) so browser users don't have to write their
own.

Equally important: figure out how to test and confirm it works. So far only the
Node backend has been exercised. Work out how to run the renderer in a real
browser (automated if possible - e.g. a headless browser test runner - with a
manual/visual fallback such as a demo page mirroring `npm run samples`), and
how to compare its output against the Node backend.

## Notes

- Backend contract: `src/backend.js` (types only). `loadSvgImage(svg, width,
  height)` gets the device-pixel draw size and must render vectors crisply at
  that size (no upscaled bitmap blur).
- Node backend: `src/backends/napi.js` - applies `normalizeStyleLengths`
  (from `src/recolor.js`) before decoding because Skia ignores unitless
  lengths in `style`; check whether browsers need the same.

### Implementation notes
- Steps 1-2 done: `src/svgSize.js` now has `getViewBox(svg)` (used by
  `padViewBox`) and `prepareSvgImage(svg, width, height)`; both exported
  from `src/index.js`. A private `formatViewBox` (tidy-formatted
  `x y w h`) is shared by `padViewBox` and `prepareSvgImage`. Width/height
  are stamped as `String(n)` (unitless). `xmlns` is added as the last root
  attribute when missing (`setRootAttribute` appends). `npm test` after
  step 2: 753 tests, 748 pass, 0 fail, 5 skipped.
- Step 3 done: `src/backend.js` now has runtime code - `assertSvgSource(svg,
  fnName)` (TypeError `"<fnName>: SVG source must be a non-empty string"`),
  used by napi + browser backends. `src/backends/browser.js` exports
  `createBrowserBackend(env = globalThis)` (env read on every call) and the
  frozen `browserBackend`; only `browserBackend` is exported from
  `src/index.js` (api.test asserts the factory is not). `loadSvgImage` order:
  assertSvgSource -> `prepareSvgImage` (non-SVG throws -> rejection, no URL
  created) -> check `env.Image` (clear error in workers, before creating a
  URL so nothing leaks) -> Blob/object URL -> `new Image`, `src`, `await
  decode()` -> revoke in `finally`. `createCanvas` error mentions
  `OffscreenCanvas` (in Node it throws). Fake-env unit tests:
  `test/backend-browser.test.js`. api.test core import-graph ban narrowed to
  `src/backends/napi.js` and now asserts `src/backends/browser.js` is
  reached. `npm test` after step 3: 768 tests, 763 pass, 0 fail, 5 skipped.
- Step 4 done: `scripts/sample-defs.js` (browser-safe, imports `icons` from
  `src/index.js`) exports `groups`, `sampleSize`, `sampleChannels`,
  `sampleFileName`, `isTextSample`, plus two extra shared helpers (DRY):
  `renderSample(render, sample, options)` (builds the definition, size and
  `channels`; extra options like `{ backend }` merged last) and
  `toRgba(result)` -> `Uint8ClampedArray` (RGB expanded with alpha 255; used
  by `render-samples.js`'s `toCanvas` and the demo page's `putImageData`).
  `render-samples.js` now only renders/writes/builds the contact sheet. The
  "writes sample PNGs" test now also asserts each group folder holds exactly
  the `sampleFileName` names. `npm run samples` still writes 147 samples.
  `npm test` after step 4: 777 tests, 772 pass, 0 fail, 5 skipped.
- Step 5 done: `scripts/static-server.js` `startStaticServer({ root, port =
  0, host = "127.0.0.1" })` -> `{ url (ends "/"), close() }` (close also
  calls `closeAllConnections()` so browser keep-alive sockets don't hang
  it). GET/HEAD only; directory -> its `index.html` (404 if none); query
  strings ignored; escaping/malformed/NUL paths -> 403; unknown extensions
  -> `application/octet-stream`. Tests use raw `node:http` requests because
  `fetch`/WHATWG URL normalises `..` and `%2e%2e` away before sending.
- Step 6 done: `npm run samples:browser` -> `scripts/serve-demo.js [port]`
  (port: argv, else `PORT`, else 8080; 0 = free port) serves the repo root
  on 127.0.0.1 and prints `http://127.0.0.1:<port>/scripts/browser-demo/`.
  `scripts/browser-demo/index.html` (one external module script, no inline
  JS) + `demo.js` (core `render` + `browserBackend` + `createSvgResolver()`
  - core `render` needs a resolver even for `#name` built-ins). Each cell:
  browser canvas on the left, `../../scratch/samples/<group>/<file>` napi PNG
  on the right (img removed on 404), error text in the cell on failure.
  When done the page sets `body[data-done="true"]` and `data-errors="<n>"` -
  a ready hook for step 8/9 automation. Tests: `test/browser-demo.test.js`
  (npm script, browser-safe import graph, served HTML/JS MIME + script tag,
  spawns `serve-demo.js 0` and fetches the printed URL, killed in
  `t.after`). Ad-hoc check (not a test, script deleted): headless installed
  Chrome 157 `--dump-dom` -> 147 samples rendered, 0 errors, ~300 ms; a
  screenshot of the icon groups showed browser and napi renders matching by
  eye. `npm test` after step 6: 788 tests, 783 pass, 0 fail, 5 skipped.
- Step 7 done: `playwright-core@^1.65.1` devDependency (`package.test.js`
  asserts it's the only one). Playwright-managed Firefox (`firefox-1572`) and
  WebKit 27.2 (`webkit-2388`, plus `ffmpeg`/`winldd`) installed into
  `%LOCALAPPDATA%\ms-playwright` via `node
  node_modules/playwright-core/cli.js install firefox webkit` (no Chromium
  download). `test/browser/launch.js`: `ENGINES` (chromium channels
  `chrome` -> `msedge` -> bundled; firefox; webkit), `browserTestMode(env)`
  (`auto`/`off`/`on`, other values throw), `findBrowsers({ env,
  loadPlaywright })` (launches all engines headless up front; one entry per
  engine with `browser` or a one-line `skip` reason; `=1` throws only when
  *no* engine launches), `closeBrowsers`, `openTestPage(browser, server)`
  (loads `test/browser/blank.html`, waits for `window.bf`, includes page /
  console errors in the failure), `callPage(page, name, ...args)` (returns
  `data` as `Uint8Array` so `test/helpers.js` pixel helpers work).
  `test/browser/page.js` exposes `window.bf = { render(def, w, h, channels),
  drawSvg(svg, w, h, bg) }`. DRY: `drawSvg`'s body moved to browser-safe
  `test/browser/drawSvg.js` (`drawSvgWith(backend, svg, w, h, bg)`), used by
  `page.js` and wrapped by `helpers.js` `drawSvg` (napi default unchanged).
  Tests: `test/browser-launch.test.js` (fake Playwright, always runs) and
  `test/browser.test.js` (smoke: `describe` per engine, skipped with the
  reason). **All three engines launch on this machine:** chromium (installed
  Chrome channel), firefox, webkit - no WebKit-on-Windows quirks seen for
  fills/simple SVG; the whole browser file takes ~2-3 s. **Gotcha:** `node
  --test` runs every `.js` under `test/` (default `**/test/**/*.js`
  pattern), so `test/browser/*.js` are imported by Node as test files - they
  must have no side effects outside a browser (`page.js` only sets `window.bf`
  when `window` exists; imports are relative, not `/src/...`). `npm test`
  after step 7: 811 tests, 806 pass, 0 fail, 5 skipped (the 3 browser
  suites run; `BUTTON_FACE_BROWSER_TESTS=0` shows them as skipped suites).
- Step 8 done: shared contract cases in `test/backend-cases.js`
  (`backendCases`: `{ name, run(ops) }`, plus exported `strokedBox`), run by
  `test/backend.test.js` against `backendOps(napiBackend)` and by
  `test/browser.test.js` per engine against `pageOps(page)`. `ops` API lives
  in browser-safe `test/browser/ops.js` (renamed from `drawSvg.js`):
  `drawSvgWith(backend, svg, w, h, bg, at = [x, y, w, h])` (optional draw
  rect, so the offset case shares it) and `backendOps(backend)` -> `{ render,
  drawSvg, fill(w, h, color?), loadSvg(svg, w, h) -> null }`. `page.js` now
  sets `window.bf` = `backendOps(browserBackend)` wrapped to plain arrays;
  `launch.js` adds `pageOps(page)` (Proxy over `callPage`), and `callPage`
  only converts `data` when present. Cases: canvas size/transparent,
  non-premultiplied RGBA, TypeError for ""/42/undefined, rejects
  garbage/whitespace/truncated, 10x10 no-viewBox at 20x20, viewBox-only (no
  width/height), no `xmlns`, `px` width/height, crisp edge (2x2 SVG at
  40x40), offset draw, unitless style stroke-width, background then SVG,
  render tint (canvas as drawable), render `channels` 4/3 -> `Uint8Array`.
  Browser-only extra: in-page `browserBackend` frozen/contract shape.
  **All cases pass on chromium (Chrome 157), firefox and webkit; no bugs
  found in `browser.js`/`prepareSvgImage`.** Engine findings: (a) Firefox
  loses the error *name* through `page.evaluate` (message is
  `page.evaluate: loadSvgImage: ...`, no `TypeError:`), so the shared case
  checks only the message (`assertSvgSource`'s own Node test checks the
  name). (b) Mutation check (prep step temporarily disabled): only the
  "no `xmlns`" case fails, in all three engines - viewBox-only SVGs, no-viewBox
  SVGs and the crisp-edge case all pass unprepared, i.e. current
  Chrome/Firefox/WebKit rasterise SVG images as vectors at the `drawImage`
  size and draw viewBox-only roots fine. So `xmlns` stamping is essential;
  width/height stamping is defensive (older Firefox) and harmless. Browser
  test file ~5 s for 3 engines. `npm test` after step 8: 866 tests, 861 pass,
  0 fail, 5 skipped.
- Step 9 done: `test/browser-compare.test.js` renders all 147 samples with
  napi (once, shared) and in each engine (one test per sample group per
  engine; a failure lists every out-of-tolerance sample as
  `group/label (kind): metric value > limit (stats)`). New helper
  `diffStats(a, b, threshold = 64)` in `test/helpers.js` (unit-tested in the
  compare file): on **premultiplied** RGBA -> `max` per-channel diff, `mean`
  per-channel diff, `bad` = % of pixels with a channel diff > 64, `bounds` =
  largest ink-bounds edge shift (ink = differs from `a`'s top-left pixel by
  >32; `null` if only one image has ink). Premultiplying matters: un-
  premultiplied low-alpha pixels in `channels: 4` samples otherwise showed
  max 255 / bad 0.37-0.68% on "icon only rgba" (arbitrary RGB at alpha ~1).
  **Measured worst cases (premultiplied), Chrome 157 / Firefox / WebKit:**
  shape (non-text) - max 100 / 91 / 91, mean 0.55 / 0.29 / 0.29, bad 0.15% /
  0.10% / 0.10%, bounds 1 / 1 / 1 (edge antialiasing only; Chrome's worst is
  `icon-categories/material (fill attr)`). Text - max 255 everywhere, mean
  9.34 / 14.16 / 15.37, bad 7.43% / 9.74% / 11.07%, bounds 2 / 3 / 2 (worst:
  `text-misc/4 lines wrap` in Firefox/WebKit, bottom-aligned `text-align`
  in Chrome). **Final tolerances (same for all engines, no skips):** shape
  `mean <= 1.5, bad <= 0.5%, bounds <= 1`; text `mean <= 22, bad <= 16%,
  bounds <= 4`; both also require the top-left (background) pixel within 2
  per channel. `max` isn't limited (single edge pixels legitimately differ).
  Sensitivity check (ad hoc, napi vs napi): a 0.5px icon shift gives bad
  1.1-7.2% -> caught; a 15% opacity change only moves mean 0.3-6.4 -> caught
  only on large icons (subtle colour shifts are a known blind spot).
  **No bugs found.** Text differences are font metrics, not a bug: all
  engines use the same Arial widths (`measureText("Xy").width` identical),
  but `actualBoundingBoxAscent/Descent` differ - bold 12px sans-serif:
  napi 8/2, Chrome 9/2, Firefox 8.59/2.53 (Firefox reports fractional
  metrics) - so `lineHeight` differs and wrapped/bottom-aligned lines move
  ~1px. **Engine finding:** Playwright WebKit on Windows has **no
  `OffscreenCanvas`**, so the backend's `document.createElement("canvas")`
  fallback is what WebKit exercises (good: both `createCanvas` paths are
  covered by real engines). **Speed:** `page.js` now returns `data` as a
  base64 string (decoded in `callPage`) instead of a `number[]` - Playwright
  serialised the array element by element; the corpus took ~9 s per engine
  before, ~1.5-2 s after. Compare file ~7 s for 3 engines; whole `npm test`
  ~9.5 s. `npm test` after step 9: 897 tests, 892 pass, 0 fail, 5 skipped.
- Step 10 done (no code changes). **Automated demo pass:** `npm run
  samples` (147 PNGs), then ad-hoc `scratch/demo-screenshots.js` (gitignored,
  kept for re-runs: `node scratch/demo-screenshots.js`) spawns
  `scripts/serve-demo.js 0`, loads the demo headless at 1400px wide in each
  engine, waits for `body[data-done=true]`, saves full-page screenshots, then
  closes every browser and kills the server. Results: Chrome 157.0.8103.52 -
  147 canvases, 147 napi PNGs loaded, `data-errors=0`, ~0.7 s; Edge
  157.0.4341.46 - same, ~0.9 s; Firefox 159.0 (Playwright) - same, ~0.3 s;
  WebKit 27.2 (Playwright) - same, ~1.9 s. Only console error: a 404 in
  Chrome/Edge for `/favicon.ico` (the page has no favicon link; harmless).
  Screenshots: `scratch/demo-shots/chrome.png`, `msedge.png`, `firefox.png`,
  `webkit.png`. **Eyeballed (Chrome, Firefox, WebKit; Edge only via the
  automated checks - same engine/size as Chrome):** every icon group,
  recolour, combos and sizes cell matches its napi neighbour (colours,
  tints, gradients in steam/playstation, opacity, checkerboard alpha in the
  rgba samples, `badgeSvg` "42"). Text matches in wording/wrapping; only the
  known ~1px vertical shift of wrapped/bottom-aligned lines in `text-align`
  (font metrics, see step 9) is visible. Nothing looked wrong.
  **Can't be automated / still untested (warn the user):** (a) visual
  quality is only eyeballed - tests compare against napi with tolerances,
  so a regression shared by both backends, or a subtle colour shift on small
  icons (step-9 blind spot), would pass; the user should look at the
  screenshots / `npm run samples:browser` themselves. (b) Real Safari on
  macOS/iOS (Playwright WebKit on Windows is not Safari: no OffscreenCanvas,
  different font stack), incl. Safari `<foreignObject>` canvas tainting. (c)
  Anti-fingerprinting noise in `getImageData` (Firefox
  `resistFingerprinting`, Brave, Safari advanced protection). (d) Web-font
  loading - text uses whatever the page has loaded; callers must `await
  document.fonts.load(font)` first. (e) Web Worker usage - `loadSvgImage`
  needs `Image` (main thread only); untested beyond the fake-env error case.
  (f) HiDPI/GPU-accelerated canvases (tests run headless, CPU, DPR 1). (g)
  Firefox/WebKit coverage depends on the Playwright-managed builds staying
  installed (they are on this machine; otherwise they skip).
- `npm test` after steps 10-11: 897 tests, 892 pass, 0 fail, 5 skipped.
- Step 11 done: **proposed CLAUDE.md wording** below - NOT applied, awaiting
  user confirmation (Rule 4). Also flagged: `wip/wip-readme.md` "Browser /
  bundler usage" says there is no browser backend - that job needs a
  `browserBackend` + `createSvgResolver({ prefixes: { "@":
  createMaterialResolver() } })` example, the font-loading, main-thread-only
  (`loadSvgImage`) and SVG-as-image (no external images/web fonts inside
  SVGs) caveats. Not edited here.

  *Architecture* - replace the "Browser-safe core" bullet and add two:

  ```markdown
  - **Browser-safe core:** nothing reachable from `src/index.js` may import
    `node:*`, `fs`, `path` or `@napi-rs/*`, nor `src/backends/napi.js`
    (enforced by `test/api.test.js`). Node-only code lives in `src/node.js`,
    `src/node/` and `src/backends/napi.js` (the only importer of
    `@napi-rs/canvas`).
  - Backends: `napiBackend` (`src/backends/napi.js`, Node entry) and
    `browserBackend` (`src/backends/browser.js`, core entry; globals looked
    up at call time, `createBrowserBackend(env)` for fakes in tests).
    Browser `createCanvas` = `OffscreenCanvas`, else `<canvas>`;
    `loadSvgImage` = Blob URL + `Image.decode()`, main thread only (no
    `Image` in workers). Both share `assertSvgSource` (`src/backend.js`).
    Browsers need `prepareSvgImage(svg, w, h)` (`src/svgSize.js`: adds
    viewBox/`xmlns` when missing, stamps width/height, normalises style
    lengths) - `xmlns` is essential, the rest defensive.
  - Sample corpus: `scripts/sample-defs.js` (browser-safe) is shared by
    `npm run samples`, the browser demo (`scripts/browser-demo/`) and
    `test/browser-compare.test.js`. `scripts/static-server.js` is the one
    static server (demo + browser tests).
  ```

  *Building and testing* - add:

  ```markdown
  - Browser tests (`test/browser*.test.js`) drive real browsers through the
    `playwright-core` devDependency: Chromium via installed Chrome, then
    Edge (`channel`); Firefox and WebKit via Playwright-managed builds
    (`node node_modules/playwright-core/cli.js install firefox webkit`,
    re-run after upgrading `playwright-core`). Engines that can't launch are
    skipped with a reason. `BUTTON_FACE_BROWSER_TESTS`: unset = run what's
    available, `0` = skip all, `1` = fail if no engine launches.
  - Browser-vs-Node pixel comparison of every sample is in
    `test/browser-compare.test.js` (tolerances in its header; text differs
    by font metrics). Shared backend contract cases: `test/backend-cases.js`.
  - `node --test` loads every `.js` under `test/`, including the page-side
    files in `test/browser/` - they must have no side effects outside a
    browser and use relative imports.
  - `npm run samples:browser` serves a demo page (default port 8080) that
    renders every sample with `browserBackend` beside the `npm run samples`
    PNGs, for visual review in any browser.
  ```
- `test/api.test.js` enforces that nothing reachable from `src/index.js`
  imports `node:*`, `fs`, `path` or `@napi-rs/*`.
- `wip/wip-readme.md` (in progress) assumes the web version works - results
  here may need to feed back into the README.

### Investigation findings (Investigate phase)

**Baseline:** `npm test` = 738 tests, 733 pass, 0 fail, 5 skipped (the
`BUTTON_FACE_LIVE_TESTS` ones). Node v24.14.0.

#### 1. What the core asks of a backend (Canvas 2D usage)
- `src/render.js`: `backend.createCanvas(w, h).getContext("2d")` (no context
  options), per painter `save`/`globalAlpha`/`restore`; for `channels == 3`
  `globalCompositeOperation = "destination-over"` + black `fillRect`; then
  `ctx.getImageData(0, 0, w, h).data` -> wrapped as `Uint8Array` over the same
  buffer (works for a browser `Uint8ClampedArray` too) or `stripAlpha` copy.
- `layers/fill.js`: `fillStyle` + `fillRect`. Colours always go through
  `validColor` -> canonical `#rrggbb` / `rgba()` (fine in every browser).
- `layers/svg.js`: string pipeline (substituteText -> applyColorMap ->
  setRootColor) then `getSvgSize(svg)` (aspect only), computes rounded
  `svgW`/`svgH`, calls `backend.loadSvgImage(svg, svgW, svgH)`, paints with
  `ctx.drawImage(image, left, top, svgW, svgH)`. Tint path (`tintImage`):
  `backend.createCanvas(w, h)`, `drawImage(image,0,0,w,h)`,
  `globalCompositeOperation = "source-in"`, `fillRect`, and returns **the
  canvas itself as the drawable** -> the backend's canvases must be accepted
  by its contexts' `drawImage` (true for both `OffscreenCanvas` and
  `HTMLCanvasElement`). So `createCanvas` must return a real canvas, not a
  wrapper (rules out wrapping `getContext` to inject `willReadFrequently`).
- `layers/text.js`: `ctx.font = scaleFont(font, sy)` (e.g. `"bold 32px
  sans-serif"`), `fillStyle`, `textAlign`, `textBaseline = "top"`,
  `measureText(s).width` (wrapping) and
  `measureText("Xy").actualBoundingBoxAscent/Descent` (line height),
  `fillText`. All supported by every current browser on both
  `CanvasRenderingContext2D` and `OffscreenCanvasRenderingContext2D`. No
  filters, no `letterSpacing`, no `ctx.fonts`, no `putImageData`.
- Output: always non-premultiplied RGBA from `getImageData` (browsers store
  premultiplied internally and un-premultiply on read; Skia/napi does the
  same) -> tiny rounding at low alpha in `channels: 4`; `channels: 3` output is
  fully opaque so unaffected.
- Browser-specific risks: (a) fonts - text uses whatever the page has;
  web fonts must already be loaded (`await document.fonts.load(font)`) or
  measurement uses a fallback; invalid `ctx.font` strings are silently
  ignored (same as Skia). (b) GPU-accelerated canvases can antialias slightly
  differently from CPU; `getContext("2d")` is called with no options so we
  can't request `willReadFrequently` (just a perf hint / minor). (c)
  anti-fingerprinting (Firefox `resistFingerprinting`, Brave, Safari private
  "advanced fingerprinting protection") may add noise to `getImageData` -
  document, can't fix.

#### 2. SVG decoding in browsers
- **`Image` + Blob URL (recommended)**: `new Blob([svg], { type:
  "image/svg+xml" })` -> `URL.createObjectURL` -> `img.src` -> `await
  img.decode()` (rejects with EncodingError on bad XML) -> revoke URL in
  `finally` (safe once decoded/loaded). Works on the main thread in Chrome,
  Firefox, Safari. A `data:image/svg+xml;charset=utf-8,` +
  `encodeURIComponent(svg)` URL is an alternative (no revoke; very old Safari
  tainted canvases with SVG data URLs).
- **`createImageBitmap(blob)` with SVG**: not supported in Chromium (fails to
  decode SVG blobs) and not reliable elsewhere -> don't use. Consequence:
  **no SVG decoding in Web Workers** (no `Image`/DOM there). The backend is
  main-thread only for `loadSvgImage`; document this. (`createImageBitmap(img,
  { resizeWidth, resizeHeight })` from an `Image` would work but adds nothing.)
- **Canvases**: `OffscreenCanvas` (2d on main thread: Chrome 69+, Firefox
  105+, Safari 16.4+) else `document.createElement("canvas")` with
  width/height set. Prefer `OffscreenCanvas` when defined, fall back to
  `<canvas>` (keeps it working without a DOM-attached canvas, and lets
  `createCanvas` alone work in workers).
- **Intrinsic size / crispness**: Firefox refuses to draw (or reports 0x0
  for) SVG images whose root has no `width`/`height`; browsers may rasterise
  at intrinsic size in some paths. Fix both by **stamping the draw size onto
  the root**: `setRootAttribute(svg, "width", w)` and `"height", h` (from
  `src/recolor.js`). **Gotcha:** if the SVG has no `viewBox`, changing
  width/height changes the viewport without scaling the content (e.g. a
  `width="10"` rect drawn at 20 would only fill the top-left quarter), so
  first add `viewBox="0 0 W H"` from the *original* `getSvgSize(svg)` when
  `parseViewBox(getRootAttribute(svg, "viewBox"))` is null. `svgW/svgH` keep
  the natural aspect (rounded) and default `preserveAspectRatio` is
  `xMidYMid meet`, so stamping is safe. (`padViewBox` in `svgSize.js` already
  does the "viewBox from natural size" dance - reuse its logic / factor out a
  helper rather than duplicate, per DRY.) Built-in icons and Material icons
  already have width/height/viewBox (`24px`); user SVGs may not.
- **`xmlns`**: browsers parse SVG-as-image strictly as XML; a root without
  `xmlns="http://www.w3.org/2000/svg"` renders nothing / fails. Skia is
  lenient. Suggest stamping `xmlns` when missing (cheap, harmless).
- **`normalizeStyleLengths`**: not needed in browsers (they accept unitless
  lengths in `style`), but harmless (`8` -> `8px` is equivalent). Recommend
  applying it anyway so both backends see identical markup (parity, simpler
  comparison tests).
- Put the pure "prepare SVG for the browser" step (viewBox/width/height/
  xmlns/normalizeStyleLengths) in one exported pure function so it is
  unit-testable under node:test without a browser.
- **Tainting**: blob: URLs are same-origin, and SVG-as-image never loads
  external resources (scripts, external `<image>`, web fonts, external CSS
  are all blocked in image context), so `getImageData` stays readable.
  Chrome/Firefox no longer taint for `<foreignObject>`; Safari may - edge case
  for user SVGs only, document. Side effect: SVG `<text>` (e.g. the
  `badgeSvg` sample) can only use system fonts, and external `<image href>`
  inside user SVGs won't load in browsers (differs from Skia).

#### 3. Where it lives / exports
- Suggested `src/backends/browser.js` exporting a frozen `browserBackend`
  (mirrors `napiBackend`), using only globals looked up lazily at call time
  (so the module imports fine in Node - `src/node.js` re-exports
  `index.js`, and `api.test.js` imports both entries).
- Export from `src/index.js` (browser users import the core entry). Then
  `src/node.js` also re-exports it via `export *` - fine (the "node entry
  re-exports the core API" test iterates core keys).
- **Test conflict:** `test/api.test.js` "core import graph is browser-safe"
  asserts no reachable file starts with `src/backends/`. Must narrow that to
  `src/backends/napi.js` (keep the "external deps == []" and
  `assertBrowserSafe` checks), and add `browserBackend` to the "core entry
  exports" list. Alternatively place it at `src/browserBackend.js` - but
  `src/backends/` is the natural home.
- `package.json` `exports` stay `{ ".", "./node" }` (`package.test.js` asserts
  exactly that); `files: ["src/"]` already covers the new file. The only
  runtime dependency must stay `@napi-rs/canvas` (`package.test.js`), so any
  test tooling goes in `devDependencies` (none exist yet).

#### 4. Testing strategy
- **What's on this machine:** `node_modules` has only `@napi-rs/canvas` (no
  devDependencies, no `.bin`). No Playwright browsers
  (`%LOCALAPPDATA%\ms-playwright` absent). Installed: **Google Chrome 157**
  (`C:\Program Files\Google\Chrome\Application`) and **Edge 157**
  (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`). No
  Firefox. A stale puppeteer cache (`~/.cache/puppeteer`, Chrome 146 +
  headless shell) exists but no puppeteer package anywhere. Global npm has
  no playwright/puppeteer.
- **(a) Automated in-browser tests (primary):** drive headless Chromium, load
  a tiny page that `import`s `/src/index.js` (+ the backend), run `render()`
  in-page for a list of definitions, return the bytes (e.g. base64 or plain
  array via evaluate), and compare in Node against `napiBackend` renders of
  the same definitions. Page-side code must stay minimal: `test/helpers.js`
  imports `node:fs` and the napi backend, so it can't load in the page; do
  all comparison in Node with existing helpers (`pixelAt`, `pixels`,
  `inkStats`, `findInkBounds`, `expectColorNear`, `drawSvg` with a backend
  arg). Serving modules: either Playwright `page.route("http://button-face.test/**")`
  mapping to repo files (no port), or a small `node:http` static server on
  port 0 in the test. No bundler needed: the core import graph has zero bare
  specifiers (enforced by `api.test.js`), so only repo-relative files are
  requested. Serve `.js` as `text/javascript` (module scripts require a JS
  MIME type).
  - Tooling options: (i) **`playwright-core` devDependency** (no browser
    download) using `channel: "chrome"` / `"msedge"` - installed browsers;
    Firefox/WebKit only if the user runs `npx playwright install firefox
    webkit` (downloads), and those projects skip when absent. (ii)
    **zero-dependency CDP**: spawn installed `chrome.exe`/`msedge.exe
    --headless=new --remote-debugging-port=0 --user-data-dir=<tmp>`, read
    `DevToolsActivePort`, talk CDP over Node 24's global `WebSocket`
    (`Page.navigate`, `Runtime.evaluate` with `awaitPromise`) - ~100 lines,
    Chromium only (Firefox dropped CDP). (iii) full `playwright` with
    downloaded Chromium+Firefox+WebKit for real cross-browser coverage.
  - Gating so `npm test` stays green everywhere: skip (with a reason, like
    `material-live.test.js`'s `{ skip }`) when the tooling isn't importable or
    no browser launches. Optionally also an env var (e.g.
    `BUTTON_FACE_BROWSER_TESTS=0/1`) to force off/on. Browser tests make no
    network requests (no `@name` refs; or a fake fetch injected in-page).
- **(b) Manual demo page:** `scripts/` or `test/browser/` HTML page that
  renders the same sample groups as `scripts/render-samples.js` into
  `<canvas>` cells (putImageData from `channels: 4` output, checkerboard
  background) - optionally side by side with the napi PNGs from
  `scratch/samples/` for eyeballing. Serve with a tiny `node:http` static
  server script (e.g. `npm run samples:browser` -> `http://localhost:PORT/`).
  DRY: move the sample `groups` definitions out of `render-samples.js` into a
  shared browser-safe module (e.g. `scripts/sample-defs.js`, no Node
  imports) used by both the Node script, the demo page and the automated
  comparison test (a natural corpus to compare).
- **(c) Unit tests under node:test with fakes:** test the pure SVG-prep
  function (viewBox added only when missing, width/height stamped, xmlns
  added, nested `<svg>` untouched, original sizes via getSvgSize) and the
  backend's control flow with injected fakes (`Image`, `Blob`, `URL`,
  `OffscreenCanvas` stubs on `globalThis` or via a
  `createBrowserBackend({ ... })` factory) - e.g. URL revoked on success
  and on decode failure, rejects on non-string/empty input, OffscreenCanvas
  vs `document.createElement` fallback. Always runs; no browser.
- **Comparison tolerances:** fill/SVG-only samples: per-pixel compare with
  a tolerance (both are Skia-family in Chrome, but antialiasing on edges can
  differ by more than 2) - e.g. compare `inkStats` (coverage within a few %,
  bounds within 1px, mean colour within a few levels) plus exact checks on
  interior/background pixels. Text samples: fonts/hinting differ (Chrome on
  Windows maps `sans-serif` to Arial; napi-rs Skia uses DirectWrite system
  fonts), so compare only loosely (ink bounds within a couple of px,
  coverage within ~10-15%, wrap line count) or skip pixel comparison for
  text. Chromium-vs-Firefox differences will be larger than
  Chromium-vs-napi.

#### 5. Other gotchas
- Material `@name` resolver in the browser: `createMaterialResolver()`
  defaults to `globalThis.fetch` + `createStorageCache()` (localStorage).
  Checked: `fonts.gstatic.com` icon URLs return
  `Access-Control-Allow-Origin: *` (and on 404 too), so cross-origin fetch
  from a page works. Browser tests must not hit it by default (inject a fake
  `fetch` in-page or avoid `@` refs; a live variant can be gated on
  `BUTTON_FACE_LIVE_TESTS=1`).
- `loadSvgImage` contract: reject on undecodable SVG. With
  `setRootAttribute` in the prep step, non-SVG input already throws
  ("root element is not <svg>") inside the async function -> rejection, as
  the napi tests expect for "garbage"/"" ; truncated markup rejects via
  `img.decode()`. Keep the napi backend's `TypeError` for non-string/empty.
- Core `render` has no default resolver; browser usage needs
  `resolveSvg: createSvgResolver({ prefixes: { "@": createMaterialResolver() } })`
  (README concern, see `wip/wip-readme.md` "Browser / bundler usage", which
  currently says "There is no browser backend in the package" - update once
  this ships).

### Planning notes (Plan phase)
- `padViewBox` (`src/svgSize.js`) inlines the "viewBox or `{0, 0,
  ...getSvgSize}`" fallback; step 1 factors that into a helper so step 2's
  prep function reuses it (DRY).
- `getRootAttribute`/`setRootAttribute` (`src/recolor.js`) work on any exact
  attribute name, so `xmlns` can be read/added with them (no new tokeniser).
- The sample definitions in `scripts/render-samples.js` only need `icons`
  from the package (currently imported from `../src/node.js`); importing it
  from `../src/index.js` makes the moved module browser-safe. No sample uses
  an `@name` ref, so the sample corpus never touches the network. Text-bearing
  samples: every `text` layer plus the `badgeSvg` svg (SVG `<text>`) -> loose
  tolerances.
- `scratch/` is gitignored, so the demo page must live in a tracked folder
  (`scripts/browser-demo/`); it may *optionally* show `scratch/samples/` PNGs
  beside the browser renders when they exist.
- The static file server is needed twice (demo page + automated browser
  tests) -> one shared module (`scripts/static-server.js`), DRY.
- The napi and browser backends both need the "non-empty string" `TypeError`
  check -> share one helper rather than duplicate it.
- Browser-side test code (page module) can't import `test/helpers.js` (it
  imports `node:fs` + napi); the page returns raw RGBA bytes and all
  assertions run in Node with the existing helpers.

### Wrap-up (coordinator)
- Firefox demo screenshot was 32px taller: page HTML text only (Firefox's
  default `line-height: normal` is ~1px taller per line); canvas sizes were
  identical. Fixed with `font: 14px/1.2 sans-serif` on the demo `body` -
  Chrome and Firefox layouts now match exactly (2807px).
- User confirmed the proposed CLAUDE.md wording; applied to Architecture and
  Building and testing. `npm test`: 897 tests, 892 pass, 0 fail, 5 skipped.
- Follow-up: `wip/wip-readme.md` still says there's no browser backend.

## Flagged assumptions
- **USER DECISIONS (2026-11-15):** (1) `playwright-core` devDependency is
  APPROVED (step 7 may proceed). (2) Firefox/WebKit coverage is WANTED - the
  user approved `npx playwright install firefox webkit`. User says Firefox is
  installed on this machine, but Playwright can't drive stock Firefox (it
  needs its own patched build), so install the Playwright-managed
  Firefox/WebKit in step 7 and run browser tests across chromium (Chrome/Edge
  channel), firefox and webkit, each skipping when unavailable.
- **Test tooling (needs user decision before Plan/Implement adds a
  devDependency):** recommend adding **`playwright-core`** as a
  devDependency, driving the installed Chrome/Edge (`channel`), no browser
  download; Firefox/WebKit tests run only if the user installs those
  browsers (`npx playwright install firefox webkit`) and skip otherwise.
  Alternative with zero deps: a small CDP driver over Node's built-in
  `WebSocket` against installed Chrome/Edge (Chromium only). Firefox
  coverage matters because of the SVG width/height quirk - without it that
  path is only verified by unit tests with fakes.
- Browser tests run automatically in `npm test` when tooling + a browser are
  available, and skip with a reason otherwise (rather than opt-in via env
  var, so regressions are noticed). Could be flipped to opt-in like
  `BUTTON_FACE_LIVE_TESTS` if `npm test` gets too slow.
- Backend lives at `src/backends/browser.js` as `browserBackend`, exported
  from `src/index.js`; `api.test.js`'s "no `src/backends/`" rule is narrowed
  to `src/backends/napi.js`.
- The backend always stamps width/height (draw size), adds a viewBox when
  missing, adds `xmlns` when missing, and applies `normalizeStyleLengths`
  (parity with napi).
- Worker support: `createCanvas` works in workers (OffscreenCanvas) but
  `loadSvgImage` needs `Image` (main thread); documented, not worked around
  (a JS/wasm SVG rasteriser would be out of scope).
- Manual demo page + shared sample definitions (refactor out of
  `scripts/render-samples.js`) are worth doing as the visual fallback.
- (Plan) The SVG-prep function is `prepareSvgImage(svg, width, height)` in
  `src/svgSize.js` (that module already owns viewBox/size logic and imports
  `recolor.js`), and is exported from `src/index.js` so people writing their
  own backend (e.g. a worker with a wasm rasteriser) can reuse it.
- (Plan) `src/backends/browser.js` exports `createBrowserBackend(env =
  globalThis)` (for injecting fakes in tests) plus the frozen
  `browserBackend = createBrowserBackend()`; only `browserBackend` is
  exported from `src/index.js`, the factory stays module-internal (tests
  import the module directly).
- (Plan) The shared "SVG source must be a non-empty string" check lives in
  `src/backend.js` as a small exported `assertSvgSource(svg, fnName)` (so
  that file stops being types-only), used by both backends.
- (Plan) Gating env var `BUTTON_FACE_BROWSER_TESTS`: unset = run when a
  browser is available, skip with reason otherwise; `0` = always skip; `1` =
  fail (not skip) if no browser can be launched (for CI).
- (Plan) Browser tests use a Chromium channel in this order: `chrome`,
  `msedge`, then Playwright-managed `chromium`; Firefox/WebKit are added as
  extra runs only when `npx playwright install firefox webkit` has been done.
- (Plan) Comparison tolerances are tuned empirically in step 9 and recorded
  in Notes; starting points: non-text samples - `findInkBounds` within 1px,
  `inkStats` coverage within 3%, mean colour within 6 levels; text samples -
  bounds within 3px, coverage within 15%.
- (Step 3) `loadSvgImage` returns the decoded `HTMLImageElement` itself (no
  `createImageBitmap` conversion) and doesn't set `img.width/height` - the
  draw size is stamped into the SVG markup instead. Real-browser
  verification is deferred to step 8.
- (Steps 4-6) Added two sample helpers beyond the plan, `renderSample` and
  `toRgba`, in `scripts/sample-defs.js` so the Node script, demo page and
  comparison test share one render call / RGBA conversion (DRY).
- (Step 5) Static server binds `127.0.0.1` only (not `localhost`/all
  interfaces), returns 403 for escaping paths, and has a small fixed MIME
  table (html/js/mjs/css/json/svg/png/txt/md) - extend if tests need more.
- (Step 6) Demo default port 8080; the demo shows the napi PNG beside each
  browser render rather than a separate contact-sheet layout, and uses a CSS
  checkerboard behind both images.
- (Step 7) `findBrowsers` launches every engine once per test file (rather
  than probing then relaunching), so steps 8/9 should reuse one launch per
  file. Browsers run headless with Playwright defaults (no
  `deviceScaleFactor`/GPU flags). The bundled-Chromium fallback is only used
  if neither Chrome nor Edge launches (not downloaded here).
- (Step 7) Firefox/WebKit are Playwright-managed builds in
  `%LOCALAPPDATA%\ms-playwright` (outside the repo); a `playwright-core`
  upgrade may need `npx playwright-core install firefox webkit` again,
  otherwise those engines just skip with "Executable doesn't exist".
- (Step 8) Renamed `test/browser/drawSvg.js` -> `test/browser/ops.js`
  (it now holds `backendOps` too) and removed the step-7 `bf.drawSvg` smoke
  test from `browser.test.js` (covered by the shared cases). Shared cases go
  through ops (`fill`/`drawSvg`/`loadSvg`/`render`) rather than raw backend
  objects, since the browser backend can only be called in-page. Added cases
  beyond the plan: `px` width/height and an explicit crisp-edge check; the
  "empty string" invalid-SVG case became "whitespace" (empty is covered by
  the TypeError case). `pageOps` has no `addInitScript`/fake-fetch support yet
  (not needed - no `@name` refs).
- (Step 9) Compared with a per-pixel `diffStats` (new helper) instead of the
  plan's `inkStats`/`findInkBounds`: samples are mostly opaque RGB on a fill,
  where alpha-based `inkStats` says nothing. Tolerances are one set for all
  engines (no per-engine values or skips were needed). Group-level tests
  (7 per engine) rather than one test per sample (441), with every failing
  sample listed in the message. Changed `page.js`/`callPage` transport to
  base64 for speed (affects all browser tests, transparent to callers).
- (Step 7) Added `test/browser-launch.test.js` (fake-Playwright unit tests
  for the launcher/env-var logic) beyond the plan's single smoke test.

## Plan

Steps 1-6 need nothing new installed. Step 7 adds a devDependency and **must
not start until the user approves it**; steps 8-10 depend on it.

- [x] 1. **Factor the viewBox fallback out of `padViewBox`.** Tests first in
  `test/svgSize.test.js`: a new exported `getViewBox(svg)` in `src/svgSize.js`
  returns the parsed root viewBox, or `{ x: 0, y: 0, ...getSvgSize(svg) }`
  when missing/invalid (cases: valid viewBox, none + width/height, none +
  nothing -> 300x150, invalid viewBox, throws on non-`<svg>` root). Then
  rewrite `padViewBox` to use it (its existing tests must still pass
  unchanged). Export `getViewBox` from `src/index.js` and add it to the
  "core entry exports the portable API" list in `test/api.test.js`.
- [x] 2. **Pure SVG-prep function `prepareSvgImage(svg, width, height)`** in
  `src/svgSize.js`. Tests first (`test/svgSize.test.js`): adds
  `viewBox` from the *original* natural size (via `getViewBox`) only when
  the root has no valid viewBox, and does so before stamping; stamps root
  `width`/`height` to the given numbers (replacing existing ones, incl. `24px`
  / `%` values); adds `xmlns="http://www.w3.org/2000/svg"` only when missing
  (use `getRootAttribute`/`setRootAttribute`); applies
  `normalizeStyleLengths`; nested `<svg>` elements untouched; built-in icon
  markup (`icons.heart`) keeps its viewBox; throws on non-`<svg>` root.
  Export from `src/index.js` + add to the api.test.js export list.
- [x] 3. **Browser backend with fakes.** Tests first in new
  `test/backend-browser.test.js` (no real browser): fake `env` objects
  (`OffscreenCanvas`, `document.createElement`, `Image` with a controllable
  `decode()`, `Blob`, `URL.createObjectURL`/`revokeObjectURL`). Cases:
  frozen + implements contract; `createCanvas` prefers `OffscreenCanvas`,
  falls back to `document.createElement("canvas")` with width/height set,
  throws a clear error with neither; globals looked up at call time (module
  imports fine in Node, where `browserBackend.createCanvas` throws);
  `loadSvgImage` passes `prepareSvgImage(svg, w, h)` output as an
  `image/svg+xml` Blob, sets `img.src` to the object URL, awaits `decode()`,
  returns the image, revokes the URL on success *and* on decode rejection;
  rejects (`TypeError`) on non-string/empty; rejects on non-SVG markup.
  Also first add `assertSvgSource(svg, fnName)` to `src/backend.js` and use
  it in `src/backends/napi.js` (existing napi tests in `test/backend.test.js`
  keep passing). Then implement `src/backends/browser.js`
  (`createBrowserBackend(env = globalThis)`, `browserBackend`), JSDoc noting
  main-thread only for `loadSvgImage` (no `Image` in workers) and fonts must
  be loaded first. Update `test/api.test.js`: narrow "core import graph is
  browser-safe" ban from `src/backends/` to `src/backends/napi.js` (keep the
  external-deps and `assertBrowserSafe` checks), add `browserBackend` to the
  core export list; export it from `src/index.js`; update `src/index.js`
  header comment.
- [x] 4. **Shared sample definitions.** Test first in `test/samples.test.js`:
  `scripts/sample-defs.js` is browser-safe (`importGraph` +
  `assertBrowserSafe` from `test/helpers.js`), exports a non-empty `groups`
  array with unique group names, and helpers `sampleSize(sample)` -> `[w, h]`
  (default 72), `sampleChannels(sample)` (default 3) and
  `sampleFileName(index, sample)` (the current `01-label[-rgba].png` naming,
  incl. `slug`). Move `fill`/`icon`/`text`/`userSvg`/`badgeSvg`/`labelled`/
  `example`/`groups` out of `scripts/render-samples.js` into it (importing
  `icons` from `../src/index.js`), and add `isTextSample(sample)` (has a
  `text` layer or an svg layer with `text`) for the comparison test.
  `render-samples.js` imports them; existing "writes sample PNGs" test still
  passes with the same file names.
- [x] 5. **Shared static file server.** Tests first in new
  `test/static-server.test.js` (local loopback only, port 0):
  `startStaticServer({ root, port = 0 })` in `scripts/static-server.js`
  resolves `{ url, close() }`; serves files with correct MIME types (`.js` ->
  `text/javascript`, `.html`, `.css`, `.svg`, `.png`, `.json`), 404 for
  missing files, refuses paths escaping `root` (`..`, encoded `%2e%2e`),
  `Cache-Control: no-store`; `close()` stops it. Node-only (it's in
  `scripts/`, not `src/`).
- [x] 6. **Manual demo page.** Test first (`test/samples.test.js` or a new
  `test/browser-demo.test.js`): `package.json` has
  `"samples:browser": "node scripts/serve-demo.js"`; the demo module
  `scripts/browser-demo/demo.js` import graph is browser-safe; serving the
  repo root with `startStaticServer` returns the demo HTML and it references
  `demo.js` via `<script type="module" src>` (no inline scripts). Then add
  `scripts/browser-demo/index.html` + `demo.js` (renders every
  `sample-defs.js` group with `browserBackend` into `<canvas>` cells via
  `putImageData` - RGB expanded to RGBA - on a checkerboard with labels,
  mirroring the contact sheet; shows `/scratch/samples/<group>/<sampleFileName>`
  beside each cell when it exists, for napi-vs-browser eyeballing; shows any
  render error in the cell) and `scripts/serve-demo.js` (serves repo root on
  a fixed default port, e.g. 8080 / `PORT` env / argv, prints the URL).
  **Warn:** the page's visual output can't be verified automatically here
  (step 8/9 cover it once Playwright is approved).
- [x] 7. **[NEEDS USER APPROVAL - new devDependency] Add `playwright-core`
  and a browser launch helper.** Do not start until the user has approved
  adding `playwright-core` (see Flagged assumptions). Test first: update
  `test/package.test.js` so `devDependencies` may contain exactly
  `playwright-core` (and `dependencies` stays only `@napi-rs/canvas`). Then
  `npm install --save-dev playwright-core` (no browser download). Add
  `test/browser/launch.js` (Node-side): `findBrowsers()` returns the
  launchable browsers per the Flagged-assumptions order (dynamic `import`
  of `playwright-core` so a missing package -> skip reason), honouring
  `BUTTON_FACE_BROWSER_TESTS` (`0` skip, `1` fail if none); plus
  `openTestPage(browser, server)` that loads `test/browser/blank.html`
  (tiny HTML loading `test/browser/page.js` as a module). `page.js` imports
  `/src/index.js` and exposes `window.bf = { drawSvg(svg, w, h, bg),
  render(def, w, h, channels), ... }` returning `{ data: number[], width,
  height, channels }`. A small smoke test (`test/browser.test.js`) asserts
  the page loads and `bf.render` of a single fill returns the right pixel;
  it skips with a reason when no browser is found.
- [x] 8. **Real-browser backend tests.** Extend `test/browser.test.js` (one
  launch per browser, `describe` per browser): mirror the
  `test/backend.test.js` napi cases in-browser with assertions in Node
  (`pixelAt`, `expectColorNear`, `expectAllPixels`): non-premultiplied
  `getImageData`; 10x10 rect drawn at 20x20 fills (crispness/stamping);
  SVG without viewBox scales; SVG without `xmlns` renders; unitless style
  lengths; garbage/empty/truncated SVG rejects; tint path (canvas as
  drawable); `render()` returns a `Uint8Array` with `channels: 3` and 4. If
  the case list duplicates `backend.test.js`, factor shared case data into
  `test/backend-cases.js` and use it from both (DRY).
- [x] 9. **Browser-vs-napi comparison test.** New
  `test/browser-compare.test.js`: for every sample in `sample-defs.js`, render
  in the browser (via `bf.render`) and with `napiBackend` in Node; compare
  with `findInkBounds`, `inkStats` and background/interior `pixelAt` checks
  using tight tolerances for non-text samples and loose ones for
  `isTextSample` samples (see Flagged assumptions). Failure messages name
  the group/sample label and the metric. Tune tolerances against real runs
  on installed Chrome/Edge, record the final values and any notable
  differences in Notes. Skips like step 7.
- [x] 10. **Document what can't be automated.** Record in Notes (and warn the
  user in the summary): visual quality is only eyeballed via `npm run
  samples` + `npm run samples:browser`; Firefox/WebKit are covered only
  after `npx playwright install firefox webkit` (run the suite once that way
  if the user agrees, otherwise flag); Safari/real WebKit `<foreignObject>`
  tainting, anti-fingerprinting noise, web-font loading and Web Worker usage
  are untested. Do a manual pass of the demo page in Chrome (and Edge) and
  note results.
- [x] 11. **Docs proposal (Rule 4 - ask before editing CLAUDE.md).** Write
  proposed CLAUDE.md wording into Notes: Architecture - `browserBackend`
  (`src/backends/browser.js`, core entry, main-thread `loadSvgImage`,
  `prepareSvgImage`), the narrowed `src/backends/napi.js` rule, shared
  `scripts/sample-defs.js` / `scripts/static-server.js`; Building and
  testing - browser tests (`playwright-core`, installed Chrome/Edge,
  `BUTTON_FACE_BROWSER_TESTS`, skip behaviour, optional Firefox/WebKit),
  `npm run samples:browser` demo. Ask the user to confirm before editing
  CLAUDE.md. Flag the follow-up for the separate `wip/wip-readme.md` job
  (its "Browser / bundler usage" section says there is no browser backend;
  needs `browserBackend` + `createSvgResolver`/`createMaterialResolver`
  example, font-loading and worker caveats) - don't edit it here.
