/**
 * Merges shared SRD rows with a user's own rows for the compendium-style lists
 * (items #303, species #303, and any future shared/custom split). A custom row
 * "shadows" — hides — its shared counterpart so a user who imported or
 * customized a row before the shared table existed sees exactly one entry, with
 * their edits preserved.
 *
 * Shadow rule, in priority order:
 *  - by source identity `(source_document_key, source_record_key)` when the
 *    custom row carries both keys (the normal case for anything imported after
 *    the versioning migration 20260720000018);
 *  - by lowercase name as a fallback for legacy rows that predate that
 *    migration — they only ever got `ruleset` backfilled, so their identity
 *    keys are null but `source` is set;
 *  - homebrew rows (`source` null) never shadow anything: a hand-authored
 *    "Longsword" and the SRD "Longsword" are genuinely distinct and both show.
 */
export interface Shadowable {
  name: string;
  source?: string | null;
  source_document_key?: string | null;
  source_record_key?: string | null;
}

function shadowSets<T extends Shadowable>(custom: readonly T[]): { ids: Set<string>; names: Set<string> } {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const c of custom) {
    if (c.source_document_key && c.source_record_key) {
      ids.add(`${c.source_document_key}::${c.source_record_key}`);
    } else if (c.source) {
      names.add(c.name.toLowerCase());
    }
  }
  return { ids, names };
}

/** Returns the shared rows not shadowed by a custom row, followed by all custom
 *  rows, sorted by name. See the module doc for the shadow rule. */
export function mergeSrdWithCustom<T extends Shadowable>(srd: readonly T[], custom: readonly T[]): T[] {
  const { ids, names } = shadowSets(custom);
  const visibleSrd = srd.filter((s) =>
    !ids.has(`${s.source_document_key}::${s.source_record_key}`) &&
    !names.has(s.name.toLowerCase()),
  );
  return [...visibleSrd, ...custom].sort((a, b) => a.name.localeCompare(b.name));
}
