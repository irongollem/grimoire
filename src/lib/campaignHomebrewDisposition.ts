/**
 * `class_features.campaign_id`, `custom_classes.campaign_id`, and
 * `custom_subclasses.campaign_id` are FKs to `campaigns` left as the default
 * `NO ACTION` — deliberately, unlike every other campaign-scoped table (#585).
 *
 * For these three tables `campaign_id IS NULL` is *meaningful*: it means
 * "available in every campaign" (see `campaignContentGating.ts`'s
 * `allowedCampaignScoped`). That rules out both natural FK defaults:
 * - `ON DELETE SET NULL` would silently *promote* campaign-exclusive
 *   homebrew to universal — the opposite of what the DM asked for.
 * - `ON DELETE CASCADE` would *destroy* authored homebrew as a side effect
 *   of deleting the campaign it happened to be scoped to.
 *
 * So the app resolves it explicitly before the campaign row is deleted, and
 * the FK stays `NO ACTION` as a guarantee that this resolution ran — no
 * future code path can silently promote or destroy homebrew by skipping it.
 */

/** The three homebrew kinds with a `campaign_id` FK to `campaigns`. */
export type HomebrewKind = "classes" | "subclasses" | "features";

/** What happens to homebrew scoped exclusively to a campaign that's being
 *  deleted:
 *  - `"promote"` — set `campaign_id = null`; the homebrew becomes universal.
 *  - `"delete"`  — delete the rows along with the campaign. */
export type HomebrewDisposition = "promote" | "delete";

/** Table each homebrew kind lives in. */
export const HOMEBREW_TABLES: Record<HomebrewKind, string> = {
  classes: "custom_classes",
  subclasses: "custom_subclasses",
  features: "class_features",
};

export interface HomebrewCounts {
  classes: number;
  subclasses: number;
  features: number;
}

export const EMPTY_HOMEBREW_COUNTS: HomebrewCounts = { classes: 0, subclasses: 0, features: 0 };

const HOMEBREW_LABELS: Record<HomebrewKind, { singular: string; plural: string }> = {
  classes: { singular: "class", plural: "classes" },
  subclasses: { singular: "subclass", plural: "subclasses" },
  features: { singular: "feature", plural: "features" },
};

const HOMEBREW_KINDS = Object.keys(HOMEBREW_TABLES) as HomebrewKind[];

/** True when any homebrew is scoped exclusively to the campaign — the signal
 *  for whether the DM must be asked to choose a disposition before deleting
 *  it at all. When false, the delete dialog needs no extra step. */
export function hasScopedHomebrew(counts: HomebrewCounts): boolean {
  return HOMEBREW_KINDS.some((kind) => counts[kind] > 0);
}

/** "2 classes, 1 subclass, 4 features" — only kinds with a non-zero count,
 *  each pluralized correctly, comma-joined in `classes, subclasses, features`
 *  order. Empty string when nothing is scoped. */
export function summarizeHomebrewCounts(counts: HomebrewCounts): string {
  return HOMEBREW_KINDS
    .filter((kind) => counts[kind] > 0)
    .map((kind) => {
      const count = counts[kind];
      const { singular, plural } = HOMEBREW_LABELS[kind];
      return `${count} ${count === 1 ? singular : plural}`;
    })
    .join(", ");
}

export interface HomebrewDispositionAction {
  kind: HomebrewKind;
  table: string;
  disposition: HomebrewDisposition;
}

/** What to do, per homebrew table, for the chosen disposition — only the
 *  tables that actually have rows scoped to the campaign. Pure planning
 *  step; the composable executes each action's `disposition` (update to
 *  null, or delete) against `table` filtered to that campaign's rows. */
export function planHomebrewDisposition(
  counts: HomebrewCounts,
  disposition: HomebrewDisposition,
): HomebrewDispositionAction[] {
  return HOMEBREW_KINDS
    .filter((kind) => counts[kind] > 0)
    .map((kind) => ({ kind, table: HOMEBREW_TABLES[kind], disposition }));
}
