/**
 * The encounter as it is fought. A fight from the AI table is fought by the played character and the party members
 * the AI plays beside them (#1021, allies: those whose player let the AI act for them, `aiPlays`). Every other
 * party member the encounter lists stays out: a solo player is never handed another player's sheet to play. With no
 * solo member the encounter is returned untouched, so the DM's own fight keeps its party. The played member is
 * fielded first, even when the encounter did not list them.
 */
export function foughtEncounter<E extends { party_member_ids: string[] }>(
  encounter: E,
  onlyMemberId: string | null,
  aiPlays: (memberId: string) => boolean = () => false,
): E {
  if (onlyMemberId === null) return encounter;
  const allies = encounter.party_member_ids.filter((id) => id !== onlyMemberId && aiPlays(id));
  return { ...encounter, party_member_ids: [onlyMemberId, ...allies] };
}
