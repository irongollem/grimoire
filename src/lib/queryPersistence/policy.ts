/**
 * The allow-list of query keys that count as static library content.
 *
 * A key on this list gets two things:
 *
 *   1. It is written to IndexedDB, and the first fetch of it in a later page
 *      session is answered from disk instead of the network (persistence.ts),
 *      so a cold start does not download the library lists again (the monster
 *      list alone is about 1.5 MB).
 *   2. The wake-up heal in App.vue skips it. The content is the same before and
 *      after the app was away, so refetching it on every return after 60
 *      seconds is pure cost.
 *
 * The test for adding a key: it is shared content that is identical for every
 * account's session, no form in the app edits it, and it is expensive enough to
 * matter. Every entry below was checked against its queryFn: it reads only
 * shared, admin-managed or external reference content, and has
 * `staleTime: Infinity` (or at least 30 minutes).
 *
 * Campaign data and user data must not be added until the editors are
 * concurrency-safe (issue #946). A form is seeded once from the query's data
 * and keeps that copy after the refetch lands, and most editors then save the
 * whole record, so a copy restored from disk days later would make the save
 * revert whatever changed in between. Persisting only shared library content
 * keeps every editor's record fresh from the network.
 *
 * Art columns on library rows are admin-editable, so another account can see a
 * changed image up to a day late (a stored record older than 24 hours is shown
 * and refetched in the background).
 *
 * Deliberately not on the list: `["plans"]` and `["library-art-defaults"]`
 * (admin-editable and cheap to refetch), `["library-monster-art"]` and
 * `["library-spell-art"]` (they mix the caller's own art rows with canonical
 * ones), `["mention-monster-name"]` (it reads the user's own monsters for some
 * ids), and every user-owned or campaign-owned query.
 */
export const STATIC_CONTENT_PREFIXES: readonly (readonly string[])[] = [
  ["library-monsters"],
  ["library-spells"],
  ["library-items"],
  ["library-species"],
  ["library_rules"],
  ["system_classes"],
  ["classRitualPolicies"],
  ["metamagicOptions"],
  ["multiclass_prerequisites"],
  ["content-licenses"],
  ["audio-licenses"],
  ["available-library-sources"],
  ["available-library-spell-sources"],
  ["available-library-item-sources"],
  ["available-library-species-sources"],
  ["open5e-documents"],
  ["open5e-background-documents"],
  ["sound_library_credits"],
];

/** True when `queryKey` starts with a listed prefix, compared segment by segment. */
export function isStaticContent(queryKey: readonly unknown[]): boolean {
  return STATIC_CONTENT_PREFIXES.some(
    (prefix) => queryKey.length >= prefix.length && prefix.every((segment, i) => queryKey[i] === segment),
  );
}
