import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import PartyMemberIdentityTab from "./PartyMemberIdentityTab.vue";
import type { IdentityFormSlice } from "./partyMemberForm.types";

vi.mock("@/composables/notes/useEntityMentionItems", () => ({
  useEntityMentionItems: () => ({ mentionItems: { value: [] } }),
}));

const form: IdentityFormSlice = {
  name: "Mira",
  player_name: null,
  subrace: "",
  species_id: null,
  disguise_species_id: null,
  disguise_race: null,
  disguise_subrace: null,
  background_id: null,
  height: null,
  notes: "",
};

function mountTab(multiclassLabel: string, level: number) {
  return mount(PartyMemberIdentityTab, {
    props: {
      form,
      portraitUrl: "",
      players: [],
      selectedCampaignMemberId: "",
      speciesOptions: [],
      subraceOptions: [],
      disguiseSubraceOptions: [],
      multiclassLabel,
      level,
      memberId: "m1",
      profBonus: 2,
      allSpeciesMap: {},
    },
    global: {
      stubs: {
        EntityImageBlock: true,
        EntityCombobox: true,
        RichTextEditor: true,
        RouterLink: { template: "<a><slot /></a>" },
      },
    },
  });
}

describe("PartyMemberIdentityTab class display", () => {
  it("shows the class rows read-only, with no class or subclass control", () => {
    const wrapper = mountTab("Fighter 3 / Wizard 2", 5);
    expect(wrapper.text()).toContain("Fighter 3 / Wizard 2");
    expect(wrapper.text()).toContain("levelling up or down");
    // The only selects left are Player and (when offered) variants, never Class or Subclass.
    const labels = wrapper.findAll(".field-label").map((l) => l.text());
    expect(labels).not.toContain("Subclass");
    expect(wrapper.find('input[placeholder="Battle Master"]').exists()).toBe(false);
    expect(wrapper.find('input[type="number"]').exists()).toBe(false);
    expect(wrapper.findAll("option").map((o) => o.text())).not.toContain("— None —");
  });

  it("says plainly that a classless character has no class yet and points at Level Up", () => {
    const wrapper = mountTab("", 1);
    expect(wrapper.text()).toContain("No class yet");
    expect(wrapper.text()).toContain("Level Up");
  });
});
