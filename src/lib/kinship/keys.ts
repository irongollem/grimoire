import type { KinLink, KinLinkInsert, KinRelation, PersonKey, PersonType } from "@/types/kinship.types";

export function personKey(type: PersonType, id: string): PersonKey {
  return type === "npc" ? `npc:${id}` : `pc:${id}`;
}

export function parsePersonKey(key: PersonKey): { type: PersonType; id: string } {
  const colon = key.indexOf(":");
  return { type: key.slice(0, colon) as PersonType, id: key.slice(colon + 1) };
}

type LinkEnds = Pick<KinLink, "from_npc_id" | "from_party_member_id" | "to_npc_id" | "to_party_member_id">;

/** Both ends of a stored link as person keys. */
export function linkEnds(link: LinkEnds): { from: PersonKey; to: PersonKey } {
  return {
    from: link.from_npc_id ? personKey("npc", link.from_npc_id) : personKey("pc", link.from_party_member_id as string),
    to: link.to_npc_id ? personKey("npc", link.to_npc_id) : personKey("pc", link.to_party_member_id as string),
  };
}

/** The four end columns for a pair of person keys, ready to write. */
export function endColumns(from: PersonKey, to: PersonKey): Pick<KinLinkInsert, keyof LinkEnds> {
  const f = parsePersonKey(from);
  const t = parsePersonKey(to);
  return {
    from_npc_id: f.type === "npc" ? f.id : null,
    from_party_member_id: f.type === "pc" ? f.id : null,
    to_npc_id: t.type === "npc" ? t.id : null,
    to_party_member_id: t.type === "pc" ? t.id : null,
  };
}

/**
 * The row to write for "`subject` is the `relation` of `other`". A child is
 * stored as the parent link the other way round, so "Wren is the child of
 * Brenna" and "Brenna is the parent of Wren" write the same row.
 */
export function kinInsertFor(
  subject: PersonKey,
  relation: KinRelation,
  other: PersonKey,
  details: Pick<KinLinkInsert, "parent_role" | "adoptive" | "note" | "ai_provenance"> = {},
): KinLinkInsert {
  const isParentLink = relation === "parent" || relation === "child";
  const [from, to] = relation === "child" ? [other, subject] : [subject, other];
  return {
    ...endColumns(from, to),
    kind: isParentLink ? "parent" : relation,
    parent_role: isParentLink ? (details.parent_role ?? null) : null,
    adoptive: isParentLink ? (details.adoptive ?? false) : false,
    note: details.note ?? "",
    ...(details.ai_provenance ? { ai_provenance: details.ai_provenance } : {}),
  };
}
