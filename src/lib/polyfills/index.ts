/**
 * The runtime APIs the app uses and pre-2022 engines lack.
 *
 * WHY THIS EXISTS. `TypeError: Object.hasOwn is not a function` took
 * app.dungeongrimoire.com/login down in production: AppButton forwards a ref
 * through reka-ui's `useForwardExpose`, which calls `Object.hasOwn`, and Vue's
 * errorHandler swallowed the throw — so the "Enter the Realm" button simply did
 * nothing. `@vue/runtime-core`, `pinia` and `@vueuse` call it too.
 *
 * WHY NO BUILD SETTING CATCHES THIS. `build.target` transpiles *syntax*. These
 * are *runtime* methods on built-ins, so no target, however modern, ever emits
 * a fallback — the engine has them or it throws. Node has all of them, so
 * vue-tsc, oxlint, vitest and `vite build` are structurally blind to the whole
 * class. The only signal was a production stack trace.
 *
 * SCOPE IS MEASURED, NOT GUESSED. Every entry below was found by scanning the
 * 477 emitted chunks for post-Safari-15.0 runtime APIs, then reading each hit
 * in context. That pass is what turned up `crypto.randomUUID` — 65 call sites
 * in src/, none of them near the login screen, and invisible to anyone fixing
 * only the reported crash. Three candidates were ruled out by the same reading
 * and must not be re-added on a grep alone:
 *
 *   - `toSorted`/`toReversed`/`toSpliced` — vue-core only *defines* these on
 *     its reactive-array instrumentation; they call the native only if app code
 *     calls them, and no call site in src/ does.
 *   - `AbortSignal.any` — model-viewer already feature-detects it.
 *   - The RegExp `d` flag — every hit was a division (`1e3/d`), not a regex.
 *
 * Re-measure before adding a fourth; do not reason from a compat table.
 *
 * `installPolyfills` is called from ./install.ts, which vite.config.ts bundles
 * to an IIFE and inlines at the top of index.html's <head>. It cannot be an
 * ordinary import: ES imports hoist, so a shim imported from main.ts runs only
 * after every chunk main.ts imports has evaluated. That is not theoretical —
 * tracing the real bundle shows core-js calling `Object.hasOwn` 64 times at
 * module-evaluation time during boot.
 */
import structuredCloneShim from "@ungap/structured-clone";

/** `Object.hasOwn` — Safari 15.4, Chrome 93, Firefox 92. */
export function hasOwn(target: unknown, key: PropertyKey): boolean {
  if (target == null) {
    throw new TypeError("Cannot convert undefined or null to object");
  }
  return Object.prototype.hasOwnProperty.call(Object(target), key);
}

/**
 * ToIntegerOrInfinity, as the spec's index coercion. `undefined` and `NaN`
 * both become 0, which `|| 0` gives for free; the infinities survive and fall
 * out of range at the call site.
 */
function toIndex(value: unknown): number {
  return Math.trunc(Number(value)) || 0;
}

/** `Array.prototype.at` — Safari 15.4. */
export function at(this: ArrayLike<unknown>, index?: number): unknown {
  const target = Object(this) as ArrayLike<unknown>;
  const length = target.length >>> 0;
  let offset = toIndex(index);
  if (offset < 0) offset += length;
  return offset < 0 || offset >= length ? undefined : target[offset];
}

/** `Array.prototype.findLastIndex` — Safari 15.4. */
export function findLastIndex(
  this: ArrayLike<unknown>,
  predicate: (value: unknown, index: number, array: unknown) => unknown,
  thisArg?: unknown,
): number {
  const target = Object(this) as ArrayLike<unknown>;
  if (typeof predicate !== "function") {
    throw new TypeError("predicate is not a function");
  }
  for (let index = (target.length >>> 0) - 1; index >= 0; index--) {
    if (predicate.call(thisArg, target[index], index, target)) return index;
  }
  return -1;
}

/** `Array.prototype.findLast` — Safari 15.4. */
export function findLast(
  this: ArrayLike<unknown>,
  predicate: (value: unknown, index: number, array: unknown) => unknown,
  thisArg?: unknown,
): unknown {
  const index = findLastIndex.call(this, predicate, thisArg);
  return index === -1 ? undefined : (Object(this) as ArrayLike<unknown>)[index];
}

const HEX_BYTE: string[] = [];
for (let byte = 0; byte < 256; byte++) HEX_BYTE.push((byte + 0x100).toString(16).slice(1));

/**
 * `crypto.randomUUID` — Safari 15.4, and *also* absent in any browser on an
 * insecure origin, since it is secure-context-only while `getRandomValues` is
 * not. An RFC 4122 v4 id, byte for byte.
 *
 * Deliberately no `Math.random` fallback. These ids become database primary
 * keys; an engine with no CSPRNG should keep throwing a clear "not a function"
 * rather than quietly minting guessable ones. `installPolyfills` therefore
 * skips this one entirely when `getRandomValues` is missing.
 */
export function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (byte) => HEX_BYTE[byte]);
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-") as `${string}-${string}-${string}-${string}-${string}`;
}

/** Install anything this engine is missing. Idempotent; a no-op on a modern one. */
export function installPolyfills(): void {
  const define = (target: object, name: string, value: unknown) => {
    Object.defineProperty(target, name, {
      value,
      // Non-enumerable is load-bearing on Array.prototype: an enumerable
      // property there turns up in every `for...in` over an array in the app,
      // which is a worse bug than any of the ones being fixed.
      writable: true,
      enumerable: false,
      configurable: true,
    });
  };

  if (typeof Object.hasOwn !== "function") define(Object, "hasOwn", hasOwn);
  if (typeof Array.prototype.at !== "function") define(Array.prototype, "at", at);
  // Read through a cast because tsconfig's `lib` is ES2022 and findLast is
  // ES2023 — the very gap this file exists to close, so TypeScript not knowing
  // the method is the expected state rather than a misconfiguration.
  if (typeof (Array.prototype as unknown as Record<string, unknown>).findLast !== "function") {
    define(Array.prototype, "findLast", findLast);
    define(Array.prototype, "findLastIndex", findLastIndex);
  }
  if (typeof globalThis.structuredClone !== "function") {
    define(globalThis, "structuredClone", structuredCloneShim);
  }
  const webCrypto = globalThis.crypto;
  if (
    webCrypto &&
    typeof webCrypto.randomUUID !== "function" &&
    typeof webCrypto.getRandomValues === "function"
  ) {
    define(webCrypto, "randomUUID", randomUUID);
  }
}
