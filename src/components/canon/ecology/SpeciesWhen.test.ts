import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/composables/canon/useCampaignSpecies", () => ({ useSpeciesEditing: () => ({ updateSpecies: mocks.update }) }));

import SpeciesWhen from "./SpeciesWhen.vue";

const base = { id: "s1", name: "Rime bear", scientificName: null, cladeId: null, kingdom: "animal" as const, livesAs: null, activity: null, description: null, sortOrder: 0 };
const mountIt = (seasons = {}, activity: "night" | null = null) => mount(SpeciesWhen, { props: { species: { ...base, seasons, activity } } });

describe("SpeciesWhen", () => {
  beforeEach(() => mocks.update.mockReset().mockResolvedValue(undefined));

  // Bug: Choose… saved an empty string as the activity (the database refuses it), or the label was saved instead of the value.
  it("saves the activity as its value and Choose as none", async () => {
    await mountIt().get("select").setValue("twilight");
    expect(mocks.update).toHaveBeenLastCalledWith("s1", { activity: "twilight" });
    await mountIt({}, "night").get("select").setValue("");
    expect(mocks.update).toHaveBeenLastCalledWith("s1", { activity: null });
  });

  // Bug: marking one season away wiped the notes of the others.
  it("marks a season away and keeps the other seasons", async () => {
    const w = mountIt({ winter: { away: false, note: "sleeps" } });
    await w.get("[data-testid=season-summer] input[type=checkbox]").setValue(true);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("s1", { seasons: { winter: { away: false, note: "sleeps" }, summer: { away: true, note: null } } });
  });

  // Bug: a season cleared of its mark and note stayed stored as an empty object.
  it("drops a season that is no longer away and has no note", async () => {
    const w = mountIt({ winter: { away: true, note: null }, spring: { away: false, note: "calves" } });
    await w.get("[data-testid=season-winter] input[type=checkbox]").setValue(false);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("s1", { seasons: { spring: { away: false, note: "calves" } } });
  });
});
