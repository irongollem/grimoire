/**
 * The PostgREST `.or()` expression for "what a DM sees of a table with
 * `user_id` + `campaign_id`" in the active campaign (#590, co-DM).
 *
 * A campaign can seat several DMs, and every DM edits every row of the
 * campaign whoever authored it, so a campaign row matches on `campaign_id`
 * alone. A library row (`campaign_id is null`) is personal: the caller's own,
 * plus the campaign owner's, which a co-DM may read but not edit
 * (`isReadOnlyLibraryRow`).
 *
 * Without a campaign only the caller's own library rows qualify.
 */
export function campaignScopeFilter(campaignId: string | null, userId: string, ownerId: string | null): string {
  if (campaignId === null) return `and(campaign_id.is.null,user_id.eq.${userId})`;
  const authors = ownerId !== null && ownerId !== userId ? [userId, ownerId] : [userId];
  return `campaign_id.eq.${campaignId},and(campaign_id.is.null,user_id.in.(${authors.join(",")}))`;
}

/** A personal library row another DM of the campaign authored: readable, but an
 *  UPDATE or DELETE on it matches nothing under RLS, so offering to edit it
 *  would look like a save that did nothing. Shared library rows (`user_id`
 *  null) are not this; they have their own read-only handling. */
export function isReadOnlyLibraryRow(
  row: { user_id: string | null; campaign_id: string | null },
  currentUserId: string | null,
): boolean {
  // Shared library rows are normalised to `user_id: ""` as well as null, and
  // neither is a DM's row: both are read-only for their own reasons.
  return row.campaign_id === null && !!row.user_id && row.user_id !== currentUserId;
}
