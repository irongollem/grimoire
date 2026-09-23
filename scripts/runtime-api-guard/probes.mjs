/**
 * The runtime APIs newer than the oldest engine this app intends to serve.
 *
 * THE FLOOR IS SAFARI 15.0, set by #896: `src/lib/polyfills` installs the five
 * Safari-15.4 APIs the bundle needs, so an iOS 15.0 device can use the app.
 * Everything listed here shipped after that floor, which is exactly the set
 * that can throw `X is not a function` on a device we claim to support.
 *
 * WHY A LIST AND NOT A COMPAT DATABASE. `@mdn/browser-compat-data` would
 * derive this instead of asserting it, and is the upgrade path if this list
 * starts feeling stale — but it is a ~15 MB dependency, and the honest scope
 * here is small: JS built-ins above the floor, plus the handful of globals the
 * polyfill layer is already responsible for. Add to it when a browser ships
 * something new; the pinned set in `pinned.mjs` is what makes a gap visible
 * rather than silent.
 *
 * `kind` is not decoration — it is how much the detection can be trusted:
 *
 *   static     `Object.hasOwn`, `AbortSignal.any`. Namespace-qualified, so a
 *              match is the real API. High confidence.
 *   global     `structuredClone(...)`. A bare identifier; a local variable of
 *              the same name would be a false positive, which no bundle here
 *              has produced but which is possible in principle.
 *   prototype  `.at()`, `.toSorted()`. JavaScript cannot tell `array.at()`
 *              from `myThing.at()` without type information, so these WILL
 *              over-report. That is tolerable only because the gate fires on
 *              *new names*, never on counts — see pinned.mjs.
 *   regexflag  The `d` and `v` flags, read off the parsed literal's own
 *              `flags` string. Exact: the regex-shaped text search this
 *              replaced read `1e3/d` as a flag and reported three phantoms.
 */

/** The oldest engine the polyfill layer targets. Stated for the reader; the list below is filtered by it. */
export const SAFARI_FLOOR = "15.0";

export const PROBES = [
  // ── Safari 15.4 — the five #896 polyfills, plus their neighbours ──────────
  { name: "Object.hasOwn", kind: "static", object: "Object", property: "hasOwn", safari: "15.4" },
  { name: "structuredClone", kind: "global", identifier: "structuredClone", safari: "15.4" },
  { name: "crypto.randomUUID", kind: "static", object: "crypto", property: "randomUUID", safari: "15.4" },
  { name: "Array.prototype.at", kind: "prototype", property: "at", safari: "15.4" },
  { name: "Array.prototype.findLast", kind: "prototype", property: "findLast", safari: "15.4" },
  { name: "Array.prototype.findLastIndex", kind: "prototype", property: "findLastIndex", safari: "15.4" },

  // ── Safari 16.0–16.4 ──────────────────────────────────────────────────────
  { name: "AbortSignal.timeout", kind: "static", object: "AbortSignal", property: "timeout", safari: "16.0" },
  { name: "Array.prototype.toSorted", kind: "prototype", property: "toSorted", safari: "16.4" },
  { name: "Array.prototype.toReversed", kind: "prototype", property: "toReversed", safari: "16.4" },
  { name: "Array.prototype.toSpliced", kind: "prototype", property: "toSpliced", safari: "16.4" },
  { name: "Array.prototype.with", kind: "prototype", property: "with", safari: "16.4" },

  // ── Safari 17 ─────────────────────────────────────────────────────────────
  { name: "RegExp d flag", kind: "regexflag", flag: "d", safari: "17.0" },
  { name: "RegExp v flag", kind: "regexflag", flag: "v", safari: "17.0" },
  { name: "String.prototype.isWellFormed", kind: "prototype", property: "isWellFormed", safari: "17.0" },
  { name: "String.prototype.toWellFormed", kind: "prototype", property: "toWellFormed", safari: "17.0" },
  { name: "Set.prototype.symmetricDifference", kind: "prototype", property: "symmetricDifference", safari: "17.0" },
  { name: "Set.prototype.isSubsetOf", kind: "prototype", property: "isSubsetOf", safari: "17.0" },
  { name: "Set.prototype.isSupersetOf", kind: "prototype", property: "isSupersetOf", safari: "17.0" },
  { name: "Set.prototype.isDisjointFrom", kind: "prototype", property: "isDisjointFrom", safari: "17.0" },

  // ── Safari 17.4 ───────────────────────────────────────────────────────────
  { name: "Object.groupBy", kind: "static", object: "Object", property: "groupBy", safari: "17.4" },
  { name: "Map.groupBy", kind: "static", object: "Map", property: "groupBy", safari: "17.4" },
  { name: "Promise.withResolvers", kind: "static", object: "Promise", property: "withResolvers", safari: "17.4" },
  { name: "AbortSignal.any", kind: "static", object: "AbortSignal", property: "any", safari: "17.4" },

  // ── Safari 18+ ────────────────────────────────────────────────────────────
  { name: "Array.fromAsync", kind: "static", object: "Array", property: "fromAsync", safari: "18.0" },
  { name: "Iterator.from", kind: "static", object: "Iterator", property: "from", safari: "18.4" },
];

/**
 * DELIBERATELY NOT PROBED, because the name carries no information.
 *
 * `Set.prototype.union` / `.intersection` / `.difference` and
 * `Iterator.prototype.toArray` were probed in the first draft and every hit
 * was something else: `this.boundingBox.union(...)` is three.js merging
 * bounding volumes, and `toArray` is the source-map library's ArraySet and
 * Sortable.js via vue-draggable-plus. These are ordinary domain verbs, so a
 * detection cannot distinguish the real built-in from a method someone wrote.
 *
 * Note that *pinning* them instead would buy nothing: an approved name stays
 * silent whatever later uses it, so a genuine `Set.prototype.union` would slip
 * past either way. Dropping them keeps the same coverage without the noise,
 * and without implying these methods are watched when they are not. The
 * distinctive Set methods above (`isSubsetOf`, `isDisjointFrom`,
 * `symmetricDifference`) are kept for exactly the opposite reason.
 */
