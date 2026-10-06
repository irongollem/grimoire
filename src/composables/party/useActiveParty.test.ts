// @vitest-environment jsdom
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyMember } from "@/types/party.types";
import type { CharacterMemorial } from "@/types/memorial.types";
import { activeMembers, useActiveParty } from "./useActiveParty";

const member = (id: string) => ({ id }) as PartyMember;
const memorial = (partyMemberId: string, restoredAt: string | null) =>
  ({ party_member_id: partyMemberId, restored_at: restoredAt }) as CharacterMemorial;

const mocks = vi.hoisted(() => ({
  party: undefined as unknown,
  partyError: null as unknown,
  memorials: undefined as unknown,
  memorialsError: null as unknown,
}));

vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref(mocks.party),
    error: ref(mocks.partyError),
    isError: ref(!!mocks.partyError),
    isPending: ref(mocks.party === undefined && !mocks.partyError),
    isLoading: ref(mocks.party === undefined && !mocks.partyError),
    refetch: vi.fn(),
  }),
}));
vi.mock("@/composables/memorials/useMemorials", () => ({
  useCampaignMemorials: () => ({
    data: ref(mocks.memorials),
    error: ref(mocks.memorialsError),
    isError: ref(!!mocks.memorialsError),
    isPending: ref(mocks.memorials === undefined && !mocks.memorialsError),
    isLoading: ref(mocks.memorials === undefined && !mocks.memorialsError),
    refetch: vi.fn(),
  }),
}));

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

describe("useActiveParty", () => {
  beforeEach(() => {
    mocks.party = undefined;
    mocks.partyError = null;
    mocks.memorials = undefined;
    mocks.memorialsError = null;
  });

  it("has no data until both the party and the memorials have loaded", () => {
    mocks.party = [member("a")];
    const r = useActiveParty();
    expect(r.data.value).toBeUndefined();
    expect(r.isPending.value).toBe(true);
  });

  it("filters once both are in", () => {
    mocks.party = [member("a"), member("b")];
    mocks.memorials = [memorial("a", null)];
    const r = useActiveParty();
    expect(r.data.value?.map((m) => m.id)).toEqual(["b"]);
    expect(r.isPending.value).toBe(false);
  });

  it("surfaces a memorial error instead of falling back to the full party", () => {
    const boom = new Error("memorials down");
    mocks.party = [member("a")];
    mocks.memorialsError = boom;
    const r = useActiveParty();
    expect(r.data.value).toBeUndefined();
    expect(r.isError.value).toBe(true);
    expect(r.error.value).toBe(boom);
  });
});
