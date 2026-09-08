import type { PartyMember } from "@/types/party.types";

/**
 * A party member's position is derived, never stored twice (#786, epic #780).
 * `campaigns.current_location_id` is authoritative — it is where the party is.
 * `party_members.current_location_id` is an override: NULL means "with the
 * party", and a value means the member is explicitly somewhere else (scouting
 * ahead, left behind, sent off on their own errand).
 *
 * Moving the party is therefore one write to the campaign row. Everyone
 * without an override comes along for free because this function re-derives
 * their position every time it's asked, rather than anyone propagating a
 * write to every member's row.
 *
 * Do not coalesce the result further — `null` here is a real answer ("nobody
 * knows where the party is"), not an absent value to paper over.
 */
export function effectiveLocationId(
  member: Pick<PartyMember, "current_location_id">,
  campaignLocationId: string | null,
): string | null {
  return member.current_location_id ?? campaignLocationId;
}
