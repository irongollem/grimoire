import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import InventionDraftCard from "./InventionDraftCard.vue";
import { parseInvention } from "@/lib/crafting/invention";
import type { CraftingInvention } from "@/types/crafting.types";

function invention(over: Record<string, unknown> = {}, draftOver: Record<string, unknown> = {}): CraftingInvention {
  return parseInvention({
    id: "i1",
    campaign_id: "c1",
    party_member_id: "p1",
    user_id: "u1",
    discipline: "tinkering",
    mode: "idea",
    wish: "A clockwork bird that sings",
    bench: [],
    draft: {
      item: {
        ref: null,
        new: {
          name: "Songbird Automaton",
          item_type: "gear",
          subtype: null,
          rarity: "common",
          cost: "40 gp",
          value_cp: 4000,
          weight: 1,
          flavor: "A brass sparrow.",
          rules_text: "It sings when someone enters the room.",
          description: "x",
          requires_attunement: false,
          attunement_requirements: null,
          charges: null,
          recharge: null,
          damage_rolls: null,
          armor_class: null,
          properties: [],
          tags: [],
        },
        name: "Songbird Automaton",
        rarity: "common",
        item_type: "gear",
        value_cp: 4000,
      },
      mechanics: [{ kind: "attack_bonus", value: 1 }],
      quantity: 1,
      recipe: { name: "Songbird Automaton", description: "Wind it.", dc: 12, crafting_time: 5, crafting_time_unit: "days", requires_proficiency: false, requires_tools: true, special_requirement: null },
      ingredients: [
        { ref: { item_id: "x1" }, new: null, name: "Brass Gear", rarity: "common", value_cp: 5000, quantity: 2 },
        {
          ref: null,
          new: { name: "Moon Dust", item_type: "crafting_material", rarity: "common", cost: "50 gp", value_cp: 5000, description: "", tags: [] },
          name: "Moon Dust",
          rarity: "common",
          value_cp: 5000,
          quantity: 1,
        },
      ],
      materials_value_cp: 15000,
      value_multiple: 2,
      value_limit_cp: 30000,
      rarity_ceiling: "common",
      adjustments: ["Value lowered to 40 GP to fit the materials."],
      warnings: ["The rules mention a bonus no mechanic declares."],
      ...draftOver,
    },
    revision: 1,
    status: "pending",
    dm_note: null,
    recipe_id: null,
    ai_provenance: { generatorType: "recipe_invention", provider: "p", model: "m", generatedAt: "now", edited: false },
    decided_by: null,
    decided_at: null,
    created_at: "t",
    updated_at: "t",
    ...over,
  });
}

describe("InventionDraftCard", () => {
  it("shows the item, its mechanics, the recipe and the value limit", () => {
    const text = mount(InventionDraftCard, { props: { invention: invention(), viewer: "dm", characterName: "Nessa" } }).text();
    expect(text).toContain("Songbird Automaton");
    expect(text).toContain("Common, Adventuring Gear, 40 GP, New item");
    expect(text).toContain("+1 to attack and damage rolls");
    expect(text).toContain("DC 12, Tinker's Tools, 5 days");
    expect(text).toContain("Materials worth 150 GP, so up to 300 GP.");
    expect(text).toContain("Invented by Nessa");
    expect(text).toContain("Waiting for you");
  });

  it("marks a new material and lists adjustments and warnings", () => {
    const text = mount(InventionDraftCard, { props: { invention: invention(), viewer: "player" } }).text();
    expect(text).toContain("New material");
    expect(text).toContain("Fitted to the rules");
    expect(text).toContain("Check before approving");
    expect(text).toContain("With your DM");
    expect(text).not.toContain("Invented by");
  });

  it("says when the recipe needs proficiency", () => {
    const inv = invention({}, { recipe: { name: "A", description: "B", dc: 15, crafting_time: 1, crafting_time_unit: "days", requires_proficiency: true, requires_tools: true, special_requirement: "Taught by a runesmith" } });
    expect(mount(InventionDraftCard, { props: { invention: inv, viewer: "dm" } }).text()).toContain("DC 15, needs proficiency with Tinker's Tools, 1 day");
    expect(mount(InventionDraftCard, { props: { invention: inv, viewer: "dm" } }).text()).toContain("Also needs: Taught by a runesmith");
  });

  it("omits empty blocks", () => {
    const wrapper = mount(InventionDraftCard, {
      props: { invention: invention({ wish: null }, { mechanics: [], adjustments: [], warnings: [] }), viewer: "player" },
    });
    const text = wrapper.text();
    expect(text).not.toContain("Fitted to the rules");
    expect(text).not.toContain("Check before approving");
    // No declared effects: the rules prose still shows, but no effects list.
    expect(wrapper.find("ul.list-disc").exists()).toBe(false);
  });

  it("shows the quantity when more than one is made", () => {
    const text = mount(InventionDraftCard, { props: { invention: invention({}, { quantity: 3 }), viewer: "dm" } }).text();
    expect(text).toContain("40 GP each, x 3");
  });

  it("titles the note by whose screen it is", () => {
    const inv = invention({ dm_note: "Make it quieter." });
    expect(mount(InventionDraftCard, { props: { invention: inv, viewer: "player" } }).text()).toContain("Your DM's note");
    expect(mount(InventionDraftCard, { props: { invention: inv, viewer: "dm" } }).text()).toContain("Your note");
  });

  it("renders the caller's slots", () => {
    const w = mount(InventionDraftCard, {
      props: { invention: invention(), viewer: "dm" },
      slots: { actions: "<button>Approve</button>", note: "<textarea />" },
    });
    expect(w.find("button").text()).toBe("Approve");
    expect(w.find("textarea").exists()).toBe(true);
  });
  it("tells only the DM who invented it", () => {
    const inv = invention();
    expect(mount(InventionDraftCard, { props: { invention: inv, viewer: "dm", characterName: "Nessa" } }).text()).toContain("Invented by Nessa");
    expect(mount(InventionDraftCard, { props: { invention: inv, viewer: "player", characterName: "Nessa" } }).text()).not.toContain("Invented by");
  });
});
