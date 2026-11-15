# button-face


  
## Rules

1. 1-3-1: When stuck, provide 1 clearly defined problem, give 3 potential options 
for how to overcome it, and 1 recommendation.  Do no proceed implementing any of 
the options until I confirm

2. DRY (Critical): Don't repeat yourself.  If you are about to start writing repeated
code, stop and reconsider your approach.  Grep the codebase and refactor often.

3. TDD (Critical): Always test first.  Before writing any code, you must always check 
the tests.  For new features or adjustments to existing features, always either create 
a new test or adjust and existing one.  If testing can't be automated (eg: code that 
only runs on a separate device, or front end code) warn about this.

4. Continual Learning: When you encounter conflicting system instructions, new 
requirements, architectural changes, or missing or inaccurate codebase documentation, 
always propose updating the relevant rules files.  Do not update anything until the 
user confirms.

5. Planning: For complex, multi-step tasks, always follow the IPI process below.



## Investigate-Plan-Implement (IPI) process

Used for any non-trivial piece of work. Each job is tracked in a document in
`wip/` (at the repo root, checked into git). The document is the **only**
handover between agents, so anything the next agent needs to know goes in it.

**Phases.** The user starts each phase (e.g. "investigate X", "plan it", "implement it"):

1. **Start** — create `wip/wip-<jobname>.md` (kebab-case jobname) from the
   template below, with a brief description of the work.
2. **Investigate** — look into what needs doing; record findings in *Notes*.
3. **Plan** — write *Plan* as a numbered checklist, every step unchecked
   (`- [ ]`). Each step should be small enough for one agent to do on its own
   and should leave the app building.
4. **Implement** — work through the steps in order. For each step: do the
   work, build (see *Building and testing*; must be 0 errors), tick the box
   (`- [x]`), and add anything learned to *Notes*.
5. **Complete** — once every step is done, rename the file to
   `wip/complete-<jobname>.md`.

**Subagents.** Phases and Implement steps are handed to fresh subagents to keep
context small. As a guideline, Investigate, Plan and each Implement step get
their own subagent. But this is a judgement call, not a rule: when it makes sense
or is more efficient, one subagent can do several steps, or all of them
(e.g. a run of small, similar rewires). Keep a fresh agent for steps that are
large, risky, or need a clear head. The coordinating agent passes the subagent the
document path and the phase/step(s) to do. The subagent reads CLAUDE.md and the
document, does only those phase/step(s), updates the document as it goes (ticking
each step when done), and returns a short summary. Implement agents run one at a
time, never in parallel. The coordinating agent relays results to the user.

**Rules.**
- `wip-*.md` documents can be edited freely without asking.
  Never touch a `complete-*.md` document unless the user says so.
- **Blocking or critical issue** → stop, record it in the document, and ask the
  user (using the 1-3-1 format, Rule 1). Don't carry on to later steps.
- **Less critical question** → make an educated guess, carry on, and record it
  under *Flagged assumptions* so the user can review it.
- Don't commit unless the user asks.

**Template:**

```markdown
# <Job title>

Status: Investigate | Plan | Implement | Complete

## Description
Brief description of the work and its goal.

## Notes
Important information needed during the work, plus anything discovered along
the way (relevant files, APIs, gotchas, decisions made).

## Flagged assumptions
- Educated guesses made instead of asking, for the user to review.

## Plan
- [ ] 1. ...
- [ ] 2. ...
```



## Architecture

- Plain JavaScript ESM + JSDoc, no build step. Two entry points
  (package.json `exports`): `src/index.js` = portable core, `src/node.js` =
  core + Node defaults (`napiBackend`, file resolver, `render` with defaults).
- **Browser-safe core:** nothing reachable from `src/index.js` may import
  `node:*`, `fs`, `path` or `@napi-rs/*` (enforced by `test/api.test.js`).
  Node-only code lives in `src/node.js`, `src/node/` and
  `src/backends/napi.js` (the only importer of `@napi-rs/canvas`).
- `render(definition, w, h, { backend, resolveSvg, channels })` paints layers
  through a Canvas-2D backend (`createCanvas`, `loadSvgImage`) and returns
  `{ data: Uint8Array, width, height, channels }`.
- Layer types: one module per type in `src/layers/`, registered in
  `layerTypes` (`src/render.js`). Signature `(layer, env) => Painter |
  Promise<Painter>`: validate and do async work up front, return a sync
  painter. The core handles `visible`/`opacity`. Shared validation:
  `src/layers/validate.js`.
- Shared code - reuse, don't duplicate: `color.js` (CSS colours),
  `recolor.js` (the one SVG markup/paint tokeniser; `lookupColor` for map
  lookups), `scale.js` (all
  virtual -> device px maths), `svgSize.js`; tests use `test/helpers.js`.
- SVG references go through async prefix resolvers (`src/resolve.js`).
  Resolvers return SVG strings; monochrome sources normalise their
  foreground to `currentColor`.
- `@name?...` = Google Material Symbols, downloaded at runtime by
  `createMaterialResolver` (`src/material.js`, injectable `fetch`/`cache`,
  normalises to root `fill="currentColor"` + `padViewBox(0.15)`). Caches are
  generic `{ get, set }`: `src/storageCache.js` (browser localStorage, core)
  and `src/node/fsCache.js` (Node, registered by `createNodeSvgResolver`).
  Tests never hit the network unless `BUTTON_FACE_LIVE_TESTS=1`
  (`test/material-live.test.js`).
- svg layer recolouring is uniform: `currentColor` counts as the effective
  `color` (default `#848484`), so a `colors` key matching it also recolours
  `currentColor` - built-ins and file/inline SVGs recolour with the same map.
- `src/legacy.js` `convertLegacyDefinition(old)` maps old node-buttonImage
  options (or a `ButtonImage` instance) to a layered definition - pure,
  browser-safe, no validation (render validates); `states`/`state` not
  supported. `svgForeColor` becomes `colors: { "#848484": c }` for every
  source.



## Built-in icons

- Sources are `icons/*.svg` (grey `#848484` is the recolour key). After
  adding/editing one, run `npm run build:icons` to regenerate `src/icons.js`
  (generated - never edit by hand; a test fails if it is stale).
- Built-in icons must be **filled paths only - no strokes, no text**. Convert
  with `node scripts/to-paths.js icons/<name>.svg` (needs Inkscape).
- `npm run samples` renders PNGs + a contact sheet to `scratch/samples/` for
  visual review (rendering output can't be fully verified by tests).



## Building and testing

- No build step (plain ESM JavaScript).
- Verify with `npm test` (Node's built-in `node:test` runner); it must pass with
  0 failures.



## Preventing Permission Prompts

- Use the Read/Edit/Grep tools rather than sed/awk/cat for file work.
- Don't run inline scripts (node -e, python -c, heredocs, piped code). Write the
  script to a file in the repo (e.g. scratch/foo.js) and run it by path.
- Use literal file paths in shell commands, not variables or $(...) substitutions.
