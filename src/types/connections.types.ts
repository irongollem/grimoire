import type { ConnectionKind, LinkKind, RecordHome } from "@edge-shared/worldLinkCatalogue.ts";

/** A `world_links` row (#1084): one typed link between two things in a campaign. */
export interface WorldLink {
  id: string;
  user_id: string;
  campaign_id: string;
  from_kind: LinkKind;
  from_npc_id: string | null;
  from_party_member_id: string | null;
  from_faction_id: string | null;
  from_location_id: string | null;
  from_deity_id: string | null;
  from_item_id: string | null;
  to_kind: LinkKind;
  to_npc_id: string | null;
  to_party_member_id: string | null;
  to_faction_id: string | null;
  to_location_id: string | null;
  to_deity_id: string | null;
  to_item_id: string | null;
  type: string;
  /** The DM's own note; never shown to a player. */
  note: string;
  /** What someone who knows of the link reads. */
  told: string;
  /** party_members ids the link is revealed to. */
  player_visible_to: string[];
  ai_provenance: Record<string, unknown> | null;
  /** Generated: whichever `from_*_id` is set. */
  from_id: string;
  /** Generated: whichever `to_*_id` is set. */
  to_id: string;
  created_at: string;
  updated_at: string;
}

/** Where a connection row came from: a link, or the record home that holds it. */
export type ConnectionSource = "link" | RecordHome;

/**
 * One row of `get_connections`: a tie of the thing on screen, read from its own
 * side. `outward` is true when the thing is the tie's `from` end, so the word is
 * the catalogue's `forward`; otherwise it is `reverse`.
 */
export interface Connection {
  source: ConnectionSource;
  /** The link id, or the id of the record row (the NPC whose home it is, the membership row, …). */
  row_id: string;
  type: string;
  outward: boolean;
  other_kind: ConnectionKind;
  other_id: string;
  other_name: string;
  other_image: string | null;
  /** Links only. */
  note: string | null;
  told: string | null;
  player_visible_to: string[] | null;
  ai_provenance: Record<string, unknown> | null;
  /** Memberships only. */
  role: string | null;
  /** A membership's status, or a quest's. */
  status: string | null;
}

/** One end of a tie, as the client names it. */
export interface WorldRef {
  kind: LinkKind;
  id: string;
}
