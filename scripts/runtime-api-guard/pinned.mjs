/**
 * The runtime APIs in the bundle that someone has looked at and cleared.
 *
 * A name here is silent however often it appears. A name NOT here fails the
 * build. That asymmetry is the whole design: false positives cost one triage
 * each, permanently, rather than one argument per build until somebody
 * disables the check.
 *
 * Every value states *why the app survives* the API being absent, and each was
 * verified by reading the call site in the emitted bundle — not inferred from
 * the name. Adding an entry without doing that reading turns this file from a
 * record into a rubber stamp.
 */
export const PINNED = {
  // ── Installed by src/lib/polyfills before any module evaluates (#896) ─────
  "Object.hasOwn":
    "Polyfilled. reka-ui's useForwardExpose calls it whenever a forwarded ref is a component; " +
    "@vue/runtime-core, pinia and @vueuse call it too. This is the one that took /login down.",
  "Array.prototype.at":
    "Polyfilled. Mostly marked's lexer, plus a handful of app call sites.",
  "Array.prototype.findLast":
    "Polyfilled (with findLastIndex). One call in tiptap's selection handling.",
  "crypto.randomUUID":
    "Polyfilled from crypto.getRandomValues, RFC 4122 v4. 65 call sites in src/; also absent " +
    "in any browser on an insecure origin, since it is secure-context-only.",
  "structuredClone":
    "Polyfilled via @ungap/structured-clone. @vuepic/vue-datepicker and the cartographer, " +
    "which pass Dates — hence a real implementation rather than a JSON round-trip.",

  // ── Present in the bundle but never reached on an engine that lacks it ───
  "AbortSignal.any":
    "Feature-detected at the call site: model-viewer emits " +
    '`typeof AbortSignal.any === "function" ? AbortSignal.any([...]) : ...`, so an engine ' +
    "without it takes the other branch.",
  "Array.prototype.toSorted":
    "Definition, not a call. vue-core's reactive-array instrumentation declares " +
    "`toSorted(e){return ft(this).toSorted(e)}`; the native runs only if app code calls it, " +
    "and no call site in src/ does. Re-check that with " +
    "`rg '\\.toSorted\\(' src/` before assuming it still holds.",
  "Array.prototype.toReversed": "Same vue-core instrumentation as toSorted; no src/ call site.",
  "Array.prototype.toSpliced": "Same vue-core instrumentation as toSorted; no src/ call site.",
};
