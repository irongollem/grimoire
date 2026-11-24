import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";
const reads = vi.hoisted(() => ({ entries: [] as unknown[], links: [] as unknown[] }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: { get value() { return reads.entries; } } }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => ({ data: { get value() { return reads.links; } } }) }));

import BackstoriesChapter from "./BackstoriesChapter.vue";

const member = (id: string, name: string, player: string | null): PartyMember => ({ id, name, player_name: player }) as unknown as PartyMember;
const passage = (entry_id: string, told_at: string | null, id: string): CanonLorePassage => ({ id, entry_id, told_at }) as unknown as CanonLorePassage;
const DetailStub = { name: "BackstoryDetail", props: ["member"], template: "<div data-testid='detail' :data-member='member.id' />" };
const stubs = { BackstoryDetail: DetailStub };

describe("BackstoriesChapter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    reads.entries = [];
    reads.links = [];
  });
  const props = {
    party: [member("m1", "Tansy", "Lotte"), member("m2", "Pim", null)],
    entries: [canonEntry({ id: "b1", part: "backstory", party_member_id: "m1" }), canonEntry({ id: "b2", part: "backstory", party_member_id: "m2" })],
    passages: [passage("b1", "2026-10-01T00:00:00Z", "a"), passage("b1", null, "b"), passage("b1", null, "c"), passage("b2", "2026-10-01T00:00:00Z", "d")],
  };
  const marks = (w: ReturnType<typeof mount>) => w.findAll("[data-testid=backstory-mark]").map((m) => m.text());

  // Bug caught: counts keyed by entry order or pooled across characters, so one character's untold passages lit another's row.
  it("marks each character by their own passages: not yet told, or all told", () => {
    const w = mount(BackstoriesChapter, { props, global: { stubs } });
    expect(marks(w)).toEqual(["2 not yet told", "All told"]);
    expect(w.findAll("li")[0]?.find("[data-testid=backstory-player]").text()).toBe("played by Lotte");
  });

  // Bug caught: a character with nothing written claiming "All told".
  it("says a character with no entry has no passages, rather than all told", () => {
    const w = mount(BackstoriesChapter, { props: { ...props, entries: [], passages: [] }, global: { stubs } });
    expect(w.findAll("li")).toHaveLength(2);
    expect(marks(w)).toEqual(["No passages", "No passages"]);
  });

  // Bug caught: the row counting an answered question, or another character's thread, as an open thread.
  it("says how many threads a past leaves open, ahead of untold passages, and not for another character", () => {
    reads.entries = [...props.entries, canonEntry({ id: "q1", part: "question" }), canonEntry({ id: "q2", part: "question", closed_as: "answered", closed_at: "2026-11-01T00:00:00Z", closed_note: "x" }), canonEntry({ id: "s1", part: "secret" })];
    reads.links = ["q1", "q2", "s1"].map((to_id) => ({ from_kind: "canon", from_id: "b1", to_kind: "canon", to_id, type: "related_to" }));
    expect(marks(mount(BackstoriesChapter, { props, global: { stubs } }))).toEqual(["2 threads open", "All told"]);
  });

  it("selects a character by their id", async () => {
    const w = mount(BackstoriesChapter, { props, global: { stubs } });
    await w.findAll("li button")[1]?.trigger("click");
    expect(w.emitted("select")).toEqual([["m2"]]);
  });

  // Bug caught: the entry opened for the wrong character, or drawn with nothing selected.
  it("opens the selected character's entry beside the list and none otherwise", () => {
    expect(mount(BackstoriesChapter, { props, global: { stubs } }).find("[data-testid=detail]").exists()).toBe(false);
    const open = mount(BackstoriesChapter, { props: { ...props, selectedId: "m2" }, global: { stubs } });
    expect(open.get("[data-testid=detail]").attributes("data-member")).toBe("m2");
  });
});
