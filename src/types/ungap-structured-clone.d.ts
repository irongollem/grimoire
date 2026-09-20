/**
 * `@ungap/structured-clone` ships no types. Declared here alongside the other
 * untyped-package shims (model-viewer, pagedjs).
 *
 * Only the default export is declared, because that is all
 * `lib/polyfills/index.ts` uses. Note what it does: the package checks for a
 * native `structuredClone` at module-evaluation time and delegates to it when
 * present, falling back to its own serialize/deserialize pair otherwise — so
 * on a modern engine our inlined copy is the native, and on an old one it is
 * the real implementation, which is the point of using a package here rather
 * than a JSON round-trip that would drop Dates, Maps, Sets and cycles.
 *
 * `transfer` is accepted by the real signature and ignored when polyfilled, so
 * it is deliberately not declared — nothing should pass it expecting it to work.
 */
declare module "@ungap/structured-clone" {
  export default function structuredClone<T>(
    value: T,
    options?: { json?: boolean; lossy?: boolean },
  ): T;
}
