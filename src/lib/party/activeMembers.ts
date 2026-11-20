// The party as it sits at the table, in a module the edge functions can import (relative `.ts` imports only, see
// `src/rules/edgeImportable.test.ts`): the browser's `useActiveParty` and the server's fight roster apply the same rule.
import type { CharacterMemorial } from "../../types/memorial.types.ts";
import type { PartyMember } from "../../types/party.types.ts";

/** Members without a memorial in effect (restored_at is null means on the wall). */
export function activeMembers(
  members: readonly PartyMember[],
  memorials: readonly Pick<CharacterMemorial, "party_member_id" | "restored_at">[],
): PartyMember[] {
  const down = new Set(memorials.filter((m) => m.restored_at === null).map((m) => m.party_member_id));
  return members.filter((m) => !down.has(m.id));
}
