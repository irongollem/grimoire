import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { CanonLorePassage } from "@/types/canon.types";
import type { PartyMember } from "@/types/party.types";
import BackstoriesSection from "./BackstoriesSection.vue";

const member = (id: string, name: string, player: string | null): PartyMember => ({ id, name, player_name: player }) as unknown as PartyMember;
const passage = (entry_id: string, told_at: string | null, id: string): CanonLorePassage => ({ id, entry_id, told_at }) as unknown as CanonLorePassage;

describe("BackstoriesSection", () => {
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

  it("selects a character by their id", async () => {
    const w = mount(BackstoriesSection, { props, global: { stubs: { CanonRubric: true } } });
    await w.findAll("li button")[1]?.trigger("click");
    expect(w.emitted("select")).toEqual([["m2"]]);
  });
});
