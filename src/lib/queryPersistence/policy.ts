import { RECONCILE_KEYS } from "@/lib/campaignLiveSync/registry";
import type { PersistClass } from "./persistence";

/**
 * Which query keys are written to IndexedDB, and how they are trusted when
 * read back. Two classes.
 *
 * STATIC library content (the list below)
 *
 *   1. It is written to IndexedDB, and the first fetch of it in a later page
 *      session is answered from disk instead of the network (persistence.ts),
 *      so a cold start does not download the library lists again (the monster
 *      list alone is about 1.5 MB). A record is trusted for a day and a build.
 *   2. The wake-up heal in App.vue skips it. The content is the same before and
 *      after the app was away, so refetching it on every return after 60
 *      seconds is pure cost.
 *
 *   The test for adding a key: it is shared content that is identical for every
 *   account's session, no form in the app edits it, and it is expensive enough
 *   to matter. Every entry below was checked against its queryFn: it reads only
 *   shared, admin-managed or external reference content, and has
 *   `staleTime: Infinity` (or at least 30 minutes).
 *
 *   Art columns on library rows are admin-editable, so another account can see
 *   a changed image up to a day late.
 *
 * LIVE campaign data (#999): every root the campaign channel carries or
 * reconciles (`RECONCILE_KEYS` in lib/campaignLiveSync/registry.ts)
 *
 *   A returning DM or player used to wait on ~30 requests before anything
 *   painted. These keys are now also written to disk and the first fetch of one
 *   in a page session is answered from it, so the campaign is on screen at
 *   once. The disk copy is never trusted, though: it is returned and then
 *   revalidated immediately, whatever its age, because other people change
 *   campaign data while this device is away (the live channel only delivers
 *   what happens while it is open). Showing a stale copy for a beat is the
 *   price; a stale copy that stays is not allowed. Records are per user, are
 *   dropped after a week, and an account change clears them (see main.ts).
 *
 *   This was excluded until #946: a form is seeded from the query's data and
 *   most editors saved the whole record, so a copy restored from disk would
 *   have made the save revert what changed in between. Every edit surface now
 *   goes through `useRecordDraft`, which merges fresh server data into the
 *   fields the user has not touched and saves only the changed columns, so the
 *   correction landing after the disk paint is absorbed rather than reverted.
 *   A NEW editor that seeds a form from query data once and saves the whole
 *   record brings that bug back, disk or no disk; use `useRecordDraft`.
 *
 * Deliberately not on either list: `["plans"]` and `["library-art-defaults"]`
 * (admin-editable and cheap to refetch), `["library-monsters"]` and
 * `["library-spells"]` (one full row per key, read by id: not expensive enough
 * to matter, and the art repair panel edits them), `["library-monster-art"]` and
 * `["library-spell-art"]` (they mix the caller's own art rows with canonical
 * ones), `["mention-monster-name"]` (it reads the user's own monsters for some
 * ids), and every user-owned query the channel does not carry.
 */
export const STATIC_CONTENT_PREFIXES: readonly (readonly string[])[] = [
  ["library-species"],
  // The slim picker indexes (#972): every enabled library monster, item and
  // spell as id + name + facets. Their own prefixes, apart from
  // `library-monsters` and `library-spells`, which hold single full rows.
  ["library-monster-index"],
  ["library-item-index"],
  ["library-spell-index"],
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
  ["open5e-background-documents"],
  ["sound_library_credits"],
];

/** True when `queryKey` starts with a listed prefix, compared segment by segment. */
export function isStaticContent(queryKey: readonly unknown[]): boolean {
  return STATIC_CONTENT_PREFIXES.some(
    (prefix) => queryKey.length >= prefix.length && prefix.every((segment, i) => queryKey[i] === segment),
  );
}

/**
 * Root keys of live campaign data. Taken from the registry rather than listed
 * by hand so a table added to the channel is persisted, kept fresh in a
 * session and revalidated on a cold start by the same change.
 */
export const LIVE_ROOT_KEYS: readonly string[] = [...new Set(RECONCILE_KEYS)];

const LIVE_ROOTS = new Set<unknown>(LIVE_ROOT_KEYS);

/** The persistence class of a key, or null when it is not persisted. */
export function persistClass(queryKey: readonly unknown[]): PersistClass | null {
  if (isStaticContent(queryKey)) return "static";
  return queryKey.length > 0 && LIVE_ROOTS.has(queryKey[0]) ? "live" : null;
}
