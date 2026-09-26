import { isUuid } from "@/lib/library/contentIdentity";

/**
 * Where an item row sits relative to the DM's active campaign — the
 * classification behind the Vault's Scope filter.
 *
 * - `campaign` — scoped to the active campaign (`campaign_id` = active).
 * - `general` — the DM's own item with no campaign, visible in every campaign.
 * - `library` — shared/reference content: a non-UUID provider id
 *   (`normalizeLibraryItem` stamps these `campaign_id: null, user_id: ""`,
 *   so they must be told apart from `general` by id shape, not scope).
 * - `other_campaign` — scoped to a campaign that is not the active one. The
 *   Vault only fetches these rows when its Scope filter asks for them.
 */
export type ItemScope = "campaign" | "general" | "library" | "other_campaign";

export function itemScopeOf(
  item: { id: string; campaign_id: string | null },
  activeCampaignId: string | null,
): ItemScope {
  if (!isUuid(item.id)) return "library";
  if (item.campaign_id === null) return "general";
  if (item.campaign_id === activeCampaignId) return "campaign";
  return "other_campaign";
}
