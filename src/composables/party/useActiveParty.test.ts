import { describe, expect, it } from "vitest";
import type { PartyMember } from "@/types/party.types";
import type { CharacterMemorial } from "@/types/memorial.types";
import { activeMembers } from "./useActiveParty";

const member = (id: string) => ({ id }) as PartyMember;
const memorial = (partyMemberId: string, restoredAt: string | null) =>
  ({ party_member_id: partyMemberId, restored_at: restoredAt }) as CharacterMemorial;

describe("activeMembers", () => {
  it("drops members with a memorial in effect and keeps restored ones", () => {
    const result = activeMembers(
      [member("a"), member("b"), member("c")],
      [memorial("a", null), memorial("b", "2026-10-02T00:00:00Z")],
    );
    expect(result.map((m) => m.id)).toEqual(["b", "c"]);
  });
  it("returns everyone when there are no memorials", () => {
    expect(activeMembers([member("a")], [])).toHaveLength(1);
  });
});
