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

function mountTab(multiclassLabel: string, level: number, over: Record<string, unknown> = {}) {
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
      ...over,
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

describe("PartyMemberIdentityTab edits", () => {
  const lastPatch = (w: ReturnType<typeof mountTab>) => w.emitted("update:form")!.at(-1)![0];
  const combos = (w: ReturnType<typeof mountTab>) => w.findAllComponents({ name: "EntityCombobox" });

  it("choosing a species clears the variant of the old one; clearing it stores null", () => {
    const w = mountTab("", 1, { form: { ...form, species_id: "sp-1", subrace: "Hill" } });
    combos(w)[0].vm.$emit("update:modelValue", "sp-2");
    expect(lastPatch(w)).toEqual({ species_id: "sp-2", subrace: "" });
    combos(w)[0].vm.$emit("update:modelValue", "");
    expect(lastPatch(w)).toEqual({ species_id: null, subrace: "" });
  });

  it("offers a variant only when the species has some", () => {
    const labels = (w: ReturnType<typeof mountTab>) => w.findAll(".field-label").map((l) => l.text());
    expect(labels(mountTab("", 1))).not.toContain("Variant");
    expect(labels(mountTab("", 1, { subraceOptions: ["Hill"] }))).toContain("Variant");
  });

  it("hands the portrait block null, not an empty string, when there is no portrait yet", () => {
    expect(mountTab("", 1).findComponent({ name: "EntityImageBlock" }).props("modelValue")).toBeNull();
    expect(mountTab("", 1, { portraitUrl: "https://cdn.test/p.webp" }).findComponent({ name: "EntityImageBlock" }).props("modelValue")).toBe("https://cdn.test/p.webp");
  });

  it("lists players by display name, or a short id when they have none, and says so when there are none", () => {
    const players = [
      { id: "a", user_id: "abcdefgh-1234", display_name: "Jo" },
      { id: "b", user_id: "12345678-aaaa", display_name: null },
    ];
    const w = mountTab("", 1, { players });
    const labels = w.findAll("option").map((o) => o.text());
    expect(labels).toContain("Jo");
    expect(labels).toContain("12345678");
    expect(w.text()).not.toContain("No players have joined yet");
    expect(mountTab("", 1).text()).toContain("No players have joined yet");
  });

  describe("shapeshifter disguise", () => {
    const shifter = { form: { ...form, species_id: "sp-1" }, isShapeshifter: true, allSpeciesMap: { "sp-9": "Elf" } };

    it("only a shapeshifter with a species gets the disguise controls", () => {
      expect(mountTab("", 1, shifter).text()).toContain("Disguise");
      expect(mountTab("", 1, { ...shifter, isShapeshifter: false }).text()).not.toContain("Disguise");
      expect(mountTab("", 1, { ...shifter, form: form }).text()).not.toContain("Disguise");
    });

    it("picking a disguise species stores its name as the race shown, and resets the disguise variant", () => {
      const w = mountTab("", 1, shifter);
      combos(w)[1].vm.$emit("update:modelValue", "sp-9");
      expect(lastPatch(w)).toEqual({ disguise_species_id: "sp-9", disguise_race: "Elf", disguise_subrace: null });
      combos(w)[1].vm.$emit("update:modelValue", "");
      expect(lastPatch(w)).toEqual({ disguise_species_id: null, disguise_race: null, disguise_subrace: null });
    });

    it("clears the whole disguise at once, and the button only shows while one is set", async () => {
      expect(mountTab("", 1, shifter).text()).not.toContain("Clear disguise");
      const w = mountTab("", 1, { ...shifter, form: { ...shifter.form, disguise_species_id: "sp-9", disguise_race: "Elf" } });
      await w.findAll("button").find((b) => b.text() === "Clear disguise")!.trigger("click");
      expect(lastPatch(w)).toEqual({ disguise_species_id: null, disguise_race: null, disguise_subrace: null });
    });

    it("offers a disguise variant only when the disguise species has some", () => {
      const labels = (w: ReturnType<typeof mountTab>) => w.findAll("span").map((l) => l.text());
      expect(labels(mountTab("", 1, shifter))).not.toContain("Disguise Variant");
      expect(labels(mountTab("", 1, { ...shifter, disguiseSubraceOptions: ["Wood"] }))).toContain("Disguise Variant");
    });

    it("stores a cleared disguise variant as null, not an empty string", async () => {
      const w = mountTab("", 1, { ...shifter, disguiseSubraceOptions: ["Wood"], form: { ...shifter.form, disguise_subrace: "Wood" } });
      const select = w.findAll("select").at(-1)!;
      await select.setValue("");
      expect(lastPatch(w)).toEqual({ disguise_subrace: null });
      await select.setValue("Wood");
      expect(lastPatch(w)).toEqual({ disguise_subrace: "Wood" });
    });
  });
});
