import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

/**
 * One row of `prompt_screenings`, as `get_prompt_screening_hints` returns it —
 * only the rows the migration decided a human should read (near or over a
 * threshold, or refused by the renderer after we allowed it). See
 * `supabase/migrations/20260915225357_prompt_screening_log.sql`.
 */
export interface PromptScreeningRow {
  id: string;
  created_at: string;
  generation_type: string;
  image_provider: string;
  blocked: boolean;
  categories_over: string[];
  /** Null until the render resolves, or forever for a row we blocked before rendering. */
  provider_outcome: "rendered" | "refused" | "error" | null;
  prompt: string;
  /** All 13 omni-moderation-latest categories, not merely the gated ones. */
  scores: Record<string, number>;
}

/** The distribution for one category in `IMAGE_PROMPT_THRESHOLDS`, over the window. */
export interface PromptScreeningCategoryHint {
  category: string;
  threshold: number;
  samples: number;
  /** Null when the window holds no samples for this category. */
  p50: number | null;
  p95: number | null;
  /**
   * The highest score among prompts we ALLOWED. Null when nothing in the
   * window passed — every sample was blocked, or there were no samples.
   */
  max_allowed: number | null;
  blocked_here: number;
  /** The headline: we allowed it, the image model refused it anyway. */
  refused_after_pass: number;
}

/**
 * One calling surface's share of the window — always the WHOLE window, never
 * narrowed by `p_generation_type`. This is the composition `total`/`blocked`/
 * `refused_after_pass`/`categories`/`rows` are a slice of, so the panel can
 * show "here is everything" beside "here is what you filtered to".
 */
export interface PromptScreeningTypeBreakdown {
  generation_type: string;
  screenings: number;
  blocked: number;
  refused_after_pass: number;
}

export interface PromptScreeningHints {
  since: string;
  /** These five are narrowed to `p_generation_type` when one is passed. */
  total: number;
  blocked: number;
  refused_after_pass: number;
  rendered: number;
  categories: PromptScreeningCategoryHint[];
  rows: PromptScreeningRow[];
  /** Ordered by `screenings` desc. Never narrowed — see the type doc above. */
  by_type: PromptScreeningTypeBreakdown[];
}

/** The day-window choices the panel's picker offers. */
export const PROMPT_SCREENING_WINDOWS = [7, 14, 30, 90] as const;
export type PromptScreeningWindowDays = (typeof PROMPT_SCREENING_WINDOWS)[number];

/**
 * `generationType` narrows every field except `by_type` (see its doc). Pass
 * `null` (the default) for the whole window across every calling surface.
 */
export function usePromptScreening(
  days: MaybeRefOrGetter<number>,
  generationType: MaybeRefOrGetter<string | null> = null,
) {
  return useQuery({
    queryKey: computed(() => [
      "admin", "prompt-screening-hints", toValue(days), toValue(generationType),
    ] as const),
    queryFn: async ({ queryKey: [, , d, generationTypeKey] }) => {
      const { data, error } = await supabase.rpc("get_prompt_screening_hints", {
        p_days: d,
        p_generation_type: generationTypeKey,
      });
      if (error) throw error;
      return data as PromptScreeningHints;
    },
  });
}

// ── Reading the numbers ──────────────────────────────────────────────────────
//
// The panel exists to answer one question per category: is the threshold set
// wrong, and in which direction? These are the pure rules behind that read,
// pulled out so they're testable without a network call.

export type CategoryDiagnosis = "too_high" | "headroom" | "steady" | "no_data";

/**
 * How far below its threshold `max_allowed` has to sit before "this threshold
 * has room" is a claim worth making rather than noise from a small sample.
 * Half the threshold is a deliberately conservative bar — these thresholds
 * run 0.85–0.9, so this asks for real daylight, not a rounding difference.
 */
const HEADROOM_RATIO = 0.5;

/**
 * `too_high` outranks `headroom`: a disagreement (the renderer refused a
 * prompt we allowed) is direct evidence the line sits in the wrong place,
 * while headroom is only an inference from where traffic happens to land.
 * A category cannot need to move in both directions at once — if the numbers
 * ever looked that way, the measured disagreement is the one to trust.
 */
export function diagnoseCategory(hint: PromptScreeningCategoryHint): CategoryDiagnosis {
  if (hint.samples === 0) return "no_data";
  if (hint.refused_after_pass > 0) return "too_high";
  if (hint.max_allowed !== null && hint.max_allowed <= hint.threshold * HEADROOM_RATIO) {
    return "headroom";
  }
  return "steady";
}

/**
 * "sexual/minors" -> "Sexual / minors". Capitalises the first segment only,
 * matching how moderation.ts itself writes these names. No lookup table on
 * purpose — the category vocabulary belongs to OpenAI, and a renamed or
 * added category should still render sensibly rather than fall through to
 * a blank label.
 */
export function formatCategoryLabel(category: string): string {
  const [head, ...rest] = category.split("/");
  const label = head ? head[0]!.toUpperCase() + head.slice(1) : category;
  return [label, ...rest].join(" / ");
}

/**
 * A 0..1 score as a clamped 0–100 bar position. Scores are probabilities and
 * should never leave that range, but the clamp keeps a freak out-of-range
 * reading from drawing a marker off the gauge instead of at its edge.
 */
export function gaugePercent(value: number): number {
  return Math.min(100, Math.max(0, value * 100));
}

// ── Composition — one surface can drown out the rest ────────────────────────

/**
 * "npc_disguise_portrait" -> "NPC Disguise Portrait". A handful of acronyms
 * get spelled out properly; everything else is just title-cased, so a new
 * generation_type still renders sensibly with no lookup entry of its own.
 */
const GENERATION_TYPE_ACRONYMS: Readonly<Record<string, string>> = { npc: "NPC" };

export function formatGenerationType(generationType: string): string {
  return generationType
    .split("_")
    .map((word) => GENERATION_TYPE_ACRONYMS[word] ?? (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Generation types whose prompts are machine-authored and near-duplicate by
 * construction, not one-per-DM-request. `tile_pack` is the one measured case:
 * `tile-pack-generator`'s `generateSlot` screens one prompt per tile, and a
 * pack fills dozens of slots from templated prompts in one DM action. Measured
 * on fixture rows: three `tile_pack` screenings alone dragged the unfiltered
 * `sexual` p50 from 0.9150 (the `entity_image`-only reading) to 0.0000. That
 * is not a wrong number — it is the honest percentile of a mixed population —
 * but it answers "is this threshold calibrated for D&D art in general" rather
 * than "for portraits and scenes", which is the question the panel exists to
 * answer. Hence the surface filter, and the dominance note below.
 */
export const BULK_GENERATION_TYPES: ReadonlySet<string> = new Set(["tile_pack"]);

export function isBulkGenerationType(generationType: string): boolean {
  return BULK_GENERATION_TYPES.has(generationType);
}

/** Share of the window one surface must reach before an unfiltered percentile
 *  carries a "mostly this surface" caveat. */
const DOMINANCE_SHARE = 0.5;

export interface DominantSurface {
  generation_type: string;
  /** 0..1 share of the window's total screenings this surface accounts for. */
  share: number;
  bulk: boolean;
}

/**
 * The surface accounting for at least `DOMINANCE_SHARE` of the window, if
 * any — found by scanning rather than trusting `by_type`'s own ordering, so
 * this stays correct even if that ordering guarantee ever changes. Null when
 * no single surface dominates, or the window (or breakdown) is empty.
 */
export function dominantSurface(
  byType: readonly PromptScreeningTypeBreakdown[],
): DominantSurface | null {
  const total = byType.reduce((sum, t) => sum + t.screenings, 0);
  if (total === 0) return null;
  const top = byType.reduce((max, t) => (t.screenings > max.screenings ? t : max), byType[0]!);
  const share = top.screenings / total;
  if (share < DOMINANCE_SHARE) return null;
  return { generation_type: top.generation_type, share, bulk: isBulkGenerationType(top.generation_type) };
}
