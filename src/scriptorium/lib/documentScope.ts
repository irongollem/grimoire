/**
 * Where a Scriptorium document sits relative to the DM's active campaign —
 * the classification behind the document list's Scope filter (#915).
 *
 * Mirrors `itemScopeOf` (`src/lib/items/itemScope.ts`), minus "library":
 * every document is the DM's own, there is no shared/reference tier here.
 *
 * - `campaign` — scoped to the active campaign (`campaign_id` = active).
 * - `general` — account-wide, no campaign (`campaign_id` is null).
 * - `other_campaign` — scoped to a campaign that is not the active one.
 */
export type DocumentScope = "campaign" | "general" | "other_campaign";

export function documentScopeOf(
  doc: { campaign_id: string | null },
  activeCampaignId: string | null,
): DocumentScope {
  if (doc.campaign_id === null) return "general";
  if (doc.campaign_id === activeCampaignId) return "campaign";
  return "other_campaign";
}

/**
 * "Usable here" — account-wide or scoped to `campaignId`. This is what a
 * picker (the quest handout attacher, the Scope filter's default) offers;
 * a resolver of an already-stored id must never filter by this (#597).
 */
export function isDocumentUsableIn(
  doc: { campaign_id: string | null },
  campaignId: string | null,
): boolean {
  return doc.campaign_id === null || doc.campaign_id === campaignId;
}
