# runtime-api-guard

Fails CI when the built bundle starts using a runtime API that browsers we
claim to support do not have.

Run it yourself with `npm run check:runtime-apis` — it reads `dist/`, so build
first. `node scripts/runtime-api-guard/cli.mjs --list` prints the detected set
with the chunks each name came from.

## Why this is not covered by anything else

`build.target` transpiles **syntax**. These are **runtime** methods on built-in
objects, so no target setting, however modern, ever emits a fallback — the
engine has the method or it throws. `vue-tsc`, `oxlint`, `vitest` and
`vite build` all run on Node, which has every one of them, so the whole class
is invisible to them. #896 is what that looks like in production: reka-ui
called `Object.hasOwn`, Vue's `errorHandler` swallowed the throw, and the
sign-in button silently did nothing.

Babel would not have caught it either. `@babel/preset-env`'s
`useBuiltIns: "usage"` analyses your own source, not pre-bundled
`node_modules`, and four of the five APIs #896 had to polyfill live in
dependencies.

## When it fails

It prints each unapproved name and the chunks it appears in. Read the call site
before deciding — then do one of three things:

1. **Polyfill it** in `src/lib/polyfills`, and add it to `pinned.mjs` saying so.
2. **Establish it is already safe** — feature-detected at the call site, or in
   code that never runs — and add it to `pinned.mjs` with that reason.
3. **Stop using it.**

Recording a false positive is a real outcome, not a cop-out: prototype-method
detection over-reports by design, because JavaScript cannot tell `array.at()`
from `myThing.at()` without type information.

## The two design decisions worth knowing

**It gates on the set of names, never on counts.** The first draft was a text
search and three of its six findings were wrong — it read `1e3/d` as a regex
`d` flag, did not know vue-core merely *defines* `toSorted` on its
reactive-array instrumentation, and could not see that model-viewer
feature-detects `AbortSignal.any`. A gate that cries wolf gets switched off. So
a known name is silent however often it appears, and only a *new* name fails.
Same discipline as `supabase/tests/anon_rpc_surface.test.sql`.

**It scans every chunk, not the boot path.** `bootBudgetPlugin` was calibrated
against `npm run build` when what ships is `vercel build --prod`; the two group
chunks differently (38 files vs 28), the ceiling landed below the real payload,
and the release job failed on every push to main until it was fixed (#899).
Regrouping moves code between files but does not change which code exists, so
scanning the union of all chunks gives the same answer under either command.
Verified: the detected set is identical for a default and a preview build.
There is no number to calibrate and no privileged build to measure.

## Maintaining the probe list

`probes.mjs` lists JS built-ins and a few globals that shipped after Safari
15.0, the floor `src/lib/polyfills` targets. Add to it when a browser ships
something new. `@mdn/browser-compat-data` would derive the list instead of
asserting it and is the upgrade path if it starts feeling stale — it was not
worth a ~15 MB dependency for a list this size.

Names that collide with ordinary domain vocabulary are deliberately **not**
probed — see the note at the bottom of `probes.mjs`. Pinning them would buy
nothing, since an approved name is silent whatever later uses it.
