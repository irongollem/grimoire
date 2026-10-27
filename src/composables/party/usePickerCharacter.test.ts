import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  back: null as unknown,
  linked: "active" as string | null,
  dmPreview: false,
  dmPreviewId: null as string | null,
  lists: {
    party: undefined as unknown,
    mine: undefined as unknown,
    pool: undefined as unknown,
    mineLoading: false,
    poolLoading: false,
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ options: { history: { state: { back: mocks.back } } } }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ get linkedPartyMemberId() { return mocks.linked; } }),
}));
vi.mock("@/stores/ui/app", () => ({
  useAppUiStore: () => ({
    get dmPreviewMode() { return mocks.dmPreview; },
    get dmPreviewPartyMemberId() { return mocks.dmPreviewId; },
  }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref(mocks.lists.party) }),
  useMyCharacters: () => ({ data: ref(mocks.lists.mine), isLoading: ref(mocks.lists.mineLoading) }),
}));
vi.mock("@/composables/party/useCharacterPool", () => ({
  useCharacterPool: () => ({ data: ref(mocks.lists.pool), isLoading: ref(mocks.lists.poolLoading) }),
}));

import { pickerReturnRoute, resolvePickerTarget, usePickerCharacter, type PickerTargetInput } from "./usePickerCharacter";

const base: PickerTargetInput = {
  requested: null, dmPreview: false, dmPreviewId: null, activeId: "active", ownedIds: new Set(["active", "benched", "pool"]),
};

describe("resolvePickerTarget", () => {
  it("acts on the active character with no memberId", () => {
    expect(resolvePickerTarget(base)).toEqual({ id: "active", notFound: false });
  });

  it("has no character when none is active and none is asked for", () => {
    expect(resolvePickerTarget({ ...base, activeId: null })).toEqual({ id: null, notFound: false });
  });

  it("acts on a benched character at the table", () => {
    expect(resolvePickerTarget({ ...base, requested: "benched" })).toEqual({ id: "benched", notFound: false });
  });

  it("refuses an id the viewer does not own, and never falls back to the active character", () => {
    expect(resolvePickerTarget({ ...base, requested: "someone-elses" })).toEqual({ id: null, notFound: true });
  });

  it("puts DM preview first", () => {
    expect(resolvePickerTarget({ ...base, dmPreview: true, dmPreviewId: "preview", requested: "pool" })).toEqual({
      id: "preview", notFound: false,
    });
    expect(resolvePickerTarget({ ...base, dmPreview: true, dmPreviewId: null })).toEqual({ id: null, notFound: false });
  });
});

describe("pickerReturnRoute", () => {
  const input = { isOtherCharacter: false, campaignId: "c1", memberId: "m1", back: null };

  it("returns the active character to their sheet", () => {
    expect(pickerReturnRoute(input)).toBe("/play/character");
  });

  it("returns a benched character to Champions", () => {
    expect(pickerReturnRoute({ ...input, isOtherCharacter: true })).toEqual({ name: "play-champions" });
  });

  it("returns a pool character to its edit page when it came from there", () => {
    expect(pickerReturnRoute({ ...input, isOtherCharacter: true, campaignId: null, back: "/play/character/edit?memberId=m1" }))
      .toEqual({ name: "play-character-edit", query: { memberId: "m1" } });
  });

  it("returns a pool character to the pool otherwise", () => {
    expect(pickerReturnRoute({ ...input, isOtherCharacter: true, campaignId: null, back: "/play/home" }))
      .toEqual({ name: "play-home" });
    expect(pickerReturnRoute({ ...input, isOtherCharacter: true, campaignId: null }))
      .toEqual({ name: "play-home" });
  });
});

describe("usePickerCharacter", () => {
  const pm = (id: string, campaign_id: string | null = null) => ({ id, campaign_id, name: id }) as PartyMember;

  beforeEach(() => {
    mocks.query = {};
    mocks.back = null;
    mocks.linked = "active";
    mocks.dmPreview = false;
    mocks.dmPreviewId = null;
    mocks.lists = { party: [pm("active", "c1")], mine: [pm("active", "c1"), pm("benched", "c1")], pool: [pm("pool")], mineLoading: false, poolLoading: false };
  });

  it("acts on the active character, found at the table", () => {
    const picker = usePickerCharacter();
    expect(picker.resolvedMemberId.value).toBe("active");
    expect(picker.member.value?.id).toBe("active");
    expect(picker.isOtherCharacter.value).toBe(false);
  });

  it("finds a pool character in the pool, which the table's roster does not hold", () => {
    mocks.query = { memberId: "pool" };
    const picker = usePickerCharacter();
    expect(picker.member.value?.id).toBe("pool");
    expect(picker.isOtherCharacter.value).toBe(true);
  });

  it("finds a character the player owns that is neither in the table's roster nor the pool", () => {
    mocks.query = { memberId: "benched" };
    mocks.lists.party = [pm("active", "c1")];
    expect(usePickerCharacter().member.value?.id).toBe("benched");
  });

  it("an id nobody owns is not found and acts on nobody, never on the active character", () => {
    mocks.query = { memberId: "someone-elses" };
    const picker = usePickerCharacter();
    expect(picker.notFound.value).toBe(true);
    expect(picker.member.value).toBeNull();
  });

  it("does not call an id not found while the lists it is checked against are still loading", () => {
    mocks.query = { memberId: "pool" };
    mocks.lists.pool = undefined;
    mocks.lists.poolLoading = true;
    expect(usePickerCharacter().notFound.value).toBe(false);
  });

  it("a DM in preview acts on the previewed character and is never 'another' character", () => {
    mocks.dmPreview = true;
    mocks.dmPreviewId = "benched";
    mocks.lists.party = [pm("benched", "c1")];
    const picker = usePickerCharacter();
    expect(picker.member.value?.id).toBe("benched");
    expect(picker.isOtherCharacter.value).toBe(false);
  });

  it("sends the player back to where they came from: Champions for a benched character, the edit page for a pool one", () => {
    mocks.query = { memberId: "benched" };
    expect(usePickerCharacter().afterChangeRoute(pm("benched", "c1"))).toEqual({ name: "play-champions" });

    mocks.query = { memberId: "pool" };
    mocks.back = "/play/character/edit?memberId=pool";
    expect(usePickerCharacter().afterChangeRoute(pm("pool"))).toEqual({ name: "play-character-edit", query: { memberId: "pool" } });
  });
});
