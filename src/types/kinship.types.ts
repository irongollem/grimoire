import type { AiProvenance } from "@/ai/provenance";

/**
 * Family trees (#1083). Kin is its own record, `kin_links` (migration
 * 20261022113302), separate from world links (`world_links`, #1084):
 * a link says how two people feel about each other, kin says
 * who is whose parent, spouse or sibling, and joins any two people in a
 * campaign, NPC or PC.
 */

/** One person in a family, NPC or PC, as one string: `npc:<uuid>` or `pc:<uuid>`. */
export type PersonKey = `npc:${string}` | `pc:${string}`;
export type PersonType = "npc" | "pc";

/**
 * What a link stores. `parent` reads one way: `from` is the parent of `to`.
 * The rest are symmetric. A child is never stored; it is a parent link read
 * from the other end.
 */
export const KIN_KINDS = ["parent", "spouse", "former_spouse", "sibling", "relative"] as const;
export type KinKind = (typeof KIN_KINDS)[number];

/**
 * What someone is to someone else, read from one end of a link. This is the
 * word the UI shows ("Brenna is the Parent of Wren").
 */
export const KIN_RELATIONS = ["parent", "child", "spouse", "former_spouse", "sibling", "relative"] as const;
export type KinRelation = (typeof KIN_RELATIONS)[number];

/** Which parent a child is reckoned through, for a House that descends through one line. Empty: either. */
export type ParentRole = "father" | "mother";

export interface KinLink {
  id: string;
  user_id: string;
  campaign_id: string;
  from_npc_id: string | null;
  from_party_member_id: string | null;
  to_npc_id: string | null;
  to_party_member_id: string | null;
  kind: KinKind;
  parent_role: ParentRole | null;
  adoptive: boolean;
  note: string;
  /** An old "Family" link nobody has sorted out yet (always kind `relative`). */
  needs_sorting: boolean;
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

/** A new link: the ends, the kind and its details. The campaign is stamped by the mutation. */
export type KinLinkInsert = Pick<
  KinLink,
  "from_npc_id" | "from_party_member_id" | "to_npc_id" | "to_party_member_id" | "kind"
> &
  Partial<Pick<KinLink, "parent_role" | "adoptive" | "note" | "needs_sorting" | "ai_provenance">>;

export type KinLinkUpdate = Partial<
  Pick<
    KinLink,
    | "from_npc_id"
    | "from_party_member_id"
    | "to_npc_id"
    | "to_party_member_id"
    | "kind"
    | "parent_role"
    | "adoptive"
    | "note"
    | "needs_sorting"
  >
>;

/** A link as a player sees it (get_player_visible_kin): ends as person keys, no note. */
export interface PlayerKinLink {
  id: string;
  from: PersonKey;
  to: PersonKey;
  kind: KinKind;
  parent_role: ParentRole | null;
  adoptive: boolean;
}

export interface PlayerVisibleKin {
  links: PlayerKinLink[];
  /** Each House the player knows, and which of the people they know belong to it. */
  houses: { faction_id: string; members: PersonKey[] }[];
}

/**
 * How a House reckons its own (factions.descent):
 * - either: a child of any member is of the house (the default)
 * - father / mother: only through that parent; a child reckoned through the other line is folded away
 * - oath: membership is the member list, not blood
 */
export const HOUSE_DESCENTS = ["either", "father", "mother", "oath"] as const;
export type HouseDescent = (typeof HOUSE_DESCENTS)[number];
