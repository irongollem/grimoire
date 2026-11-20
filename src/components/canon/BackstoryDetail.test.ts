import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ startNpc: vi.fn(), update: vi.fn() }));
const state = vi.hoisted(() => ({ entry: null as unknown, passages: [] as unknown[], sessions: [] as unknown[] }));
vi.mock("@/composables/canon/useBackstory", () => ({ useBackstoryEntry: () => ({ entry: computed(() => state.entry), opening: ref(false) }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutate: mocks.update }) }));
vi.mock("@/composables/canon/usePassageList", () => ({
  usePassageList: () => ({ passages: computed(() => state.passages), adding: ref(false), addPassage: vi.fn(), move: vi.fn(), removePassage: vi.fn() }),
}));
vi.mock("@/composables/canon/useNewBackstoryNpc", () => ({ useNewBackstoryNpc: () => ({ start: mocks.startNpc, creating: ref(false) }) }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => ({ data: computed(() => state.sessions) }) }));

import BackstoryDetail from "./BackstoryDetail.vue";

const member = { id: "m1", name: "Tansy", player_name: "Lotte", owner_user_id: "lotte", player_description: null } as unknown as PartyMember;
const passage = (over: Partial<CanonLorePassage>): CanonLorePassage => ({
  id: "g", user_id: "dm", campaign_id: "c1", entry_id: "b1", title: "t", body: null, sort_order: 0, player_visible_to: [], told_at: null, told_session_id: null,
  location_id: null, npc_id: null, quest_beat_id: null, author_id: "dm", ai_provenance: null, created_at: "2026-10-10T09:00:00Z", updated_at: "", ...over,
});

const RowStub = {
  name: "LorePassageRow",
  props: ["passage", "byline", "playersOwn", "tellTarget", "first"],
  template: "<li data-testid='row' :data-byline='byline' :data-players='playersOwn' :data-target='tellTarget && tellTarget.name' :data-first='first' />",
};
const mountDetail = () =>
  mount(BackstoryDetail, {
    props: { member },
    global: { stubs: { LorePassageRow: RowStub, BackstoryBeforePlay: true, ConnectionsSection: true, AudienceRevealControl: true, ListSkeleton: true } },
  });

describe("BackstoryDetail", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    state.entry = canonEntry({ id: "b1", part: "backstory", party_member_id: "m1" });
    state.passages = [];
    state.sessions = [{ number: 15, started_at: "2026-10-08T18:00:00Z" }];
  });

  // Bug caught: the DM could not tell their own passage from the player's, or which session the player wrote one after.
  it("marks the player's passages with who and when, and the DM's as 'Your passage'", () => {
    state.passages = [passage({ id: "a", author_id: "lotte" }), passage({ id: "b", author_id: "dm" })];
    const rows = mountDetail().findAll("[data-testid=row]");
    expect(rows.map((r) => r.attributes("data-byline"))).toEqual(["Written by Lotte · after session 15", "Your passage"]);
    expect(rows.map((r) => r.attributes("data-players"))).toEqual(["true", "false"]);
  });

  // Bug caught: Tell on a backstory passage reaching the whole party before the character it is about.
  it("offers every passage to be told to this character, and never treats the first as told with the entry", () => {
    state.passages = [passage({ id: "a", author_id: "dm" })];
    const row = mountDetail().find("[data-testid=row]");
    expect(row.attributes("data-target")).toBe("Tansy");
    expect(row.attributes("data-first")).toBe("false");
  });

  it("counts the passages and how many are not yet told", () => {
    state.passages = [passage({ id: "a", told_at: "2026-10-10T09:00:00Z" }), passage({ id: "b" }), passage({ id: "c" })];
    expect(mountDetail().find("[data-testid=backstory-tally]").text()).toBe("3 passages, 2 not yet told");
  });

  it("creates the person from this backstory through the new-NPC flow, naming the character", async () => {
    await mountDetail().find("[data-testid=new-npc]").trigger("click");
    expect(mocks.startNpc).toHaveBeenCalledWith("b1", "Tansy");
  });

  // Bug caught: the people and passages drawn (and New NPC offered) for an entry that did not exist yet.
  it("offers nothing to write into until the backstory entry exists", () => {
    state.entry = null;
    const w = mountDetail();
    expect(w.find("[data-testid=new-npc]").exists()).toBe(false);
    expect(w.find("[data-testid=backstory-passages]").exists()).toBe(false);
  });
});
