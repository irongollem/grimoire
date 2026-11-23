import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";
const reads = vi.hoisted(() => ({ entries: [] as unknown[], links: [] as unknown[] }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: { get value() { return reads.entries; } } }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => ({ data: { get value() { return reads.links; } } }) }));

import BackstoriesSection from "./BackstoriesSection.vue";

const member = (id: string, name: string, player: string | null): PartyMember => ({ id, name, player_name: player }) as unknown as PartyMember;
const passage = (entry_id: string, told_at: string | null, id: string): CanonLorePassage => ({ id, entry_id, told_at }) as unknown as CanonLorePassage;

describe("BackstoriesSection", () => {
  beforeEach(() => setActivePinia(createPinia()));
  const props = {
    party: [member("m1", "Tansy", "Lotte"), member("m2", "Pim", null)],
    entries: [canonEntry({ id: "b1", part: "backstory", party_member_id: "m1" }), canonEntry({ id: "b2", part: "backstory", party_member_id: "m2" })],
    passages: [passage("b1", "2026-10-01T00:00:00Z", "a"), passage("b1", null, "b"), passage("b1", null, "c"), passage("b2", null, "d")],
  };

  // Bug caught: counts keyed by entry order or pooled across characters, so one character's untold passages lit another's row.
  it("counts each character's own passages and the ones not yet told", () => {
    const w = mount(BackstoriesSection, { props, global: { stubs: { CanonRubric: true } } });
    const rows = w.findAll("li");
    expect(rows[0]?.find("[data-testid=backstory-count]").text()).toBe("3 passages");
    expect(rows[0]?.find("[data-testid=backstory-untold]").text()).toBe("2 not yet told");
    expect(rows[0]?.find("[data-testid=backstory-player]").text()).toBe("played by Lotte");
    expect(rows[1]?.find("[data-testid=backstory-count]").text()).toBe("1 passage");
  });

  it("lists a character who has no backstory entry yet, with nothing told", () => {
    const w = mount(BackstoriesSection, { props: { ...props, entries: [], passages: [] }, global: { stubs: { CanonRubric: true } } });
    expect(w.findAll("li")).toHaveLength(2);
    expect(w.find("[data-testid=backstory-untold]").exists()).toBe(false);
  });

  // Bug caught: the row counting an answered question, or another character's thread, as an open thread.
  it("says how many threads a past leaves open, and nothing when it leaves none", () => {
    reads.entries = [...props.entries, canonEntry({ id: "q1", part: "question" }), canonEntry({ id: "q2", part: "question", closed_as: "answered", closed_at: "2026-11-01T00:00:00Z", closed_note: "x" }), canonEntry({ id: "s1", part: "secret" })];
    reads.links = ["q1", "q2", "s1"].map((to_id) => ({ from_kind: "canon", from_id: "b1", to_kind: "canon", to_id, type: "related_to" }));
    const rows = mount(BackstoriesSection, { props, global: { stubs: { CanonRubric: true } } }).findAll("li");
    expect(rows[0]?.find("[data-testid=backstory-threads-open]").text()).toBe("2 open threads");
    expect(rows[1]?.find("[data-testid=backstory-threads-open]").exists()).toBe(false);
    reads.entries = [];
    reads.links = [];
  });

  it("selects a character by their id", async () => {
    const w = mount(BackstoriesSection, { props, global: { stubs: { CanonRubric: true } } });
    await w.findAll("li button")[1]?.trigger("click");
    expect(w.emitted("select")).toEqual([["m2"]]);
  });
});

describe("BackstoriesSection search and arc (#1255 item 11)", () => {
  beforeEach(() => setActivePinia(createPinia()));
  const names = ["Tansy", "Pim", "Wren", "Sift", "Oro", "Bex"];
  const party = names.map((n, i) => member(`m${i}`, n, null));

  // Bug caught: the search matching the player's name or nothing, so a character could not be found by their own name.
  it("finds a character by name", async () => {
    const w = mount(BackstoriesSection, { props: { party, entries: [], passages: [] }, global: { stubs: { CanonRubric: true } } });
    await w.find("input[type=search]").setValue("wre");
    expect(w.findAll("[data-testid=backstory-ledger] li")).toHaveLength(1);
  });

  it("says nothing of this part is in the arc when no character's backstory is", () => {
    const w = mount(BackstoriesSection, { props: { party: [], entries: [], passages: [], arcLabel: "The guild" }, global: { stubs: { CanonRubric: true } } });
    expect(w.text()).toContain("Nothing of this part is in The guild.");
  });
});
