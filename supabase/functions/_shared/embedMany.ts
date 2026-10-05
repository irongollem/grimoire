/**
 * Pure pieces of embed-content's `many` mode (#972): the caller hands over up
 * to MANY_MAX_IDS ids it created in one go, and the function embeds the stale
 * ones in ONE provider call. Kept free of Deno and Supabase imports so vitest
 * covers the decisions that matter (dedupe, cap, who may embed what).
 */

export const MANY_MAX_IDS = 100;

export type ParsedIds = { ids: string[] } | { error: string; status: 400 };

/** Validates and dedupes the caller's id list, preserving first-seen order. */
export function parseManyIds(raw: unknown, max = MANY_MAX_IDS): ParsedIds {
  if (!Array.isArray(raw)) return { error: "ids must be an array", status: 400 };
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || !value) return { error: "ids must be non-empty strings", status: 400 };
    seen.add(value);
  }
  if (seen.size === 0) return { error: "ids is empty", status: 400 };
  if (seen.size > max) return { error: `At most ${max} ids per call`, status: 400 };
  return { ids: [...seen] };
}

export interface OwnedRow {
  id: string;
  user_id: string;
  campaign_id?: unknown;
}

export interface Authorization<R extends OwnedRow> {
  /** Rows the caller owns (and, for campaign notes, may feed into the corpus). */
  allowed: R[];
  forbidden: string[];
  notFound: string[];
}

/** Distinct campaign ids on the rows the caller owns: each needs one DM check. */
export function campaignIdsToCheck(rows: readonly OwnedRow[], userId: string): string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.user_id === userId && typeof row.campaign_id === "string") ids.add(row.campaign_id);
  }
  return [...ids];
}

/**
 * Splits requested ids into allowed / forbidden / not found. A row is allowed
 * only when `row.user_id === userId`. `dmCampaigns` is the campaign rule, and
 * only entities that have one pass it (notes: a campaign note needs the caller
 * to be that campaign's DM, resolved once per campaign by the caller). `null`
 * means the entity has no campaign rule, so a `campaign_id` on its rows is
 * never read: whether an NPC can be embedded must not hinge on which columns
 * its select happens to load. Failures are collected, never thrown, so one
 * foreign id cannot sink a bulk create's whole batch.
 */
export function authorizeRows<R extends OwnedRow>(
  ids: readonly string[],
  rows: readonly R[],
  userId: string,
  dmCampaigns: ReadonlySet<string> | null,
): Authorization<R> {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const allowed: R[] = [];
  const forbidden: string[] = [];
  const notFound: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) {
      notFound.push(id);
    } else if (row.user_id !== userId) {
      forbidden.push(id);
    } else if (dmCampaigns !== null && typeof row.campaign_id === "string" && !dmCampaigns.has(row.campaign_id)) {
      forbidden.push(id);
    } else {
      allowed.push(row);
    }
  }
  return { allowed, forbidden, notFound };
}
