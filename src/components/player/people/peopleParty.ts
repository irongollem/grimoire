import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";

export type PartyEntry =
  | { kind: "member"; data: PartyMember }
  | { kind: "companion"; data: Companion };

/**
 * The party as the company strip lists it: the viewer's own character first,
 * the other members alphabetically, each followed by their own companions, and
 * the group's shared companions last.
 */
export function buildPartyEntries(
  members: readonly PartyMember[],
  companions: readonly Companion[],
  viewerMemberId: string | null,
): PartyEntry[] {
  const orderedMembers = [...members].sort((a, b) => {
    if (a.id === viewerMemberId) return -1;
    if (b.id === viewerMemberId) return 1;
    return a.name.localeCompare(b.name);
  });

  // Group once by owner, rather than filtering the companions per member.
  const byOwner = new Map<string, Companion[]>();
  const shared: Companion[] = [];
  for (const c of companions) {
    if (c.owner_party_member_id) {
      const bucket = byOwner.get(c.owner_party_member_id);
      if (bucket) bucket.push(c);
      else byOwner.set(c.owner_party_member_id, [c]);
    } else {
      shared.push(c);
    }
  }
  for (const bucket of byOwner.values()) bucket.sort((a, b) => a.name.localeCompare(b.name));
  shared.sort((a, b) => a.name.localeCompare(b.name));

  const result: PartyEntry[] = [];
  for (const member of orderedMembers) {
    result.push({ kind: "member", data: member });
    for (const comp of byOwner.get(member.id) ?? []) result.push({ kind: "companion", data: comp });
  }
  for (const comp of shared) result.push({ kind: "companion", data: comp });
  return result;
}

/** "4 October", with the year when it is not this one. */
export function formatMetDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const base = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(d);
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
