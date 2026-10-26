import type { AiProvenance } from "@/ai/provenance";
import type { NpcRelationship } from "@/types/npc.types";
import type { HouseDescent } from "@/types/kinship.types";

export const FACTION_TYPES = [
  "Guild",
  "Government",
  "Religion",
  "Criminal",
  "Military",
  "Merchant",
  "Secret Society",
  "Cult",
  "Order",
  "Tribe",
  // A noble or ruling family (#1083): a crest, a seat, a lineage and a line of succession.
  "House",
  "Other",
] as const;

export type FactionType = (typeof FACTION_TYPES)[number];

export const FACTION_ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
] as const;

export const NPC_FACTION_ROLES = [
  "Leader",
  "Head of house",
  "Officer",
  "Enforcer",
  "Member",
  "Initiate",
  "Envoy",
  "Patron",
  "Associate",
  "Supplier",
  "Sympathiser",
  "Supplicant",
  "Agent",
  "Informant",
  // Hidden ties (the AI relationship suggester reaches for these): known to one side only, or to neither.
  "Secret member",
  "Infiltrator",
  "Unwitting pawn",
  // Not a member at all: someone the faction counts as an open enemy.
  "Adversary",
  "Unknown",
] as const;

export type NpcFactionRole = (typeof NPC_FACTION_ROLES)[number];

/** The roles that name a faction's head; one holder at a time. */
export const HEAD_ROLES: readonly string[] = ["Leader", "Head of house"];

export const NPC_FACTION_STATUSES = [
  "Active",
  "Retired",
  "Defected",
  "Expelled",
  "Deceased",
] as const;
export type NpcFactionStatus = (typeof NPC_FACTION_STATUSES)[number];

export const NPC_FACTION_STATUS_COLORS: Record<NpcFactionStatus, string> = {
  Active: "#22c55e",
  Retired: "#94a3b8",
  Defected: "#f97316",
  Expelled: "#ef4444",
  Deceased: "#6b7280",
};

export interface Faction {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  faction_type: string | null;
  description: string | null;
  emblem_url: string | null;
  alignment: string | null;
  player_visible_to: string[];
  tags: string[];
  ai_provenance?: AiProvenance | null;
  /**
   * Setting key that seeded this row via Populate Setting; null when the user
   * made it. Content we ship does not count against free-tier quotas — see
   * `check_quota` and `lib/settingContent`.
   */
  setting_source?: string | null;
  /**
   * The party's standing with this faction (#1011), on the same ladder as an
   * NPC's `relationship`: `unknown` until the DM or a `shift_faction_standing`
   * rule sets it. Players see it, as they see an NPC's relationship.
   */
  party_standing: NpcRelationship;
  /** A House's descent rule (#1083); null on every other type. */
  descent: HouseDescent | null;
  /** A House's succession custom in the DM's words: shown on the house page and read by the AI, never enforced. */
  succession_note: string;
  /** A House's seat: the place it rules from. Null on every other type; a player reads it only when they can already see the place. */
  seat_location_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Matches the `<Entity>Insert` convention every other content type follows
 * (`MonsterInsert`, `NpcInsert`, `ItemInsert`, …): the row minus the columns the
 * database fills in.
 *
 * Note that `useCreateFaction` (useFactions.ts) deliberately takes a *narrower*
 * payload that also omits `campaign_id`, because that mutation injects the
 * active campaign itself. That is a different type for a different job, not a
 * duplicate of this one — a caller that already knows which campaign a faction
 * belongs to (the document importer, which stamps every imported row with the
 * campaign it was imported into) needs the field present.
 */
export type FactionInsert = Omit<
  Faction,
  "id" | "user_id" | "created_at" | "updated_at" | "party_standing" | "descent" | "succession_note" | "seat_location_id"
> & {
  party_standing?: NpcRelationship;
  descent?: HouseDescent | null;
  succession_note?: string;
  seat_location_id?: string | null;
};

export interface FactionNpc {
  id: string;
  faction_id: string;
  npc_id: string;
  role: string | null;
  status: string;
  user_id: string;
  /** Place in a House's line of succession (#1083): 1 is the heir; null is not in the line. */
  succession_rank: number | null;
  /** party_members ids this membership is revealed to; a character in the faction reads it regardless. */
  player_visible_to: string[];
}

export interface FactionPartyMember {
  id: string;
  faction_id: string;
  party_member_id: string;
  role: string | null;
  status: string;
  user_id: string;
  /** Place in a House's line of succession (#1083): 1 is the heir; null is not in the line. */
  succession_rank: number | null;
  /** party_members ids this membership is revealed to; the character in it reads it regardless. */
  player_visible_to: string[];
  created_at: string;
  updated_at: string;
}

export interface EntityNote {
  id: string;
  user_id: string;
  campaign_id: string | null;
  entity_type: string;
  entity_id: string;
  content: string | null;
  is_private: boolean;
  shared_with_dm: boolean;
  /** A DM note: written privately as a DM of its campaign (#590). Stamped by
   *  the server for campaign notes and never changed, so a seat that rotates
   *  between DM and player keeps its two kinds of note apart. */
  written_as_dm: boolean;
  created_at: string;
  updated_at: string;
}
