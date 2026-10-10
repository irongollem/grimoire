import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import SpellSheet from "./SpellSheet.vue";
import type { Spell } from "@/types/spell.types";

vi.mock("@/composables/party/useCharacterSpells", () => ({ useSpellKnowers: () => ({ data: ref([]) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcSpellCasters: () => ({ data: ref([]) }) }));

function spell(overrides: Partial<Spell> = {}): Spell {
  return {
    id: "s1",
    name: "Fireball",
    level: 3,
    school: "evocation",
    casting_time: "1 action",
    range: "150 feet",
    duration: "Instantaneous",
    components: ["V", "S"],
    description: "A bright streak flashes from your pointing finger.",
    higher_levels: null,
    classes: [],
    tags: [],
    ...overrides,
  } as unknown as Spell;
}

const stubs = { FocalImage: true, AiImageBadge: true, RouterLink: true };
const slots = { "dm-note": '<p data-testid="dm-note">note</p>' };

describe("SpellSheet", () => {
  it("renders the dm-note slot, but not in compact mode", () => {
    expect(mount(SpellSheet, { props: { spell: spell() }, slots, global: { stubs } }).find('[data-testid="dm-note"]').exists()).toBe(true);
    expect(mount(SpellSheet, { props: { spell: spell(), compact: true }, slots, global: { stubs } }).find('[data-testid="dm-note"]').exists()).toBe(false);
  });

  it("sets the description in a panel with the drop-cap class", () => {
    const w = mount(SpellSheet, { props: { spell: spell() }, global: { stubs } });
    const panel = w.find("section.trait-list");
    expect(panel.text()).toContain("Description");
    expect(panel.find(".lore").exists()).toBe(true);
  });

  it("shows the higher levels panel only when set", () => {
    const without = mount(SpellSheet, { props: { spell: spell() }, global: { stubs } });
    expect(without.findAll("section.trait-list")).toHaveLength(1);
    const withHl = mount(SpellSheet, { props: { spell: spell({ higher_levels: "+1d6 per slot." }) }, global: { stubs } });
    expect(withHl.findAll("section.trait-list")).toHaveLength(2);
    expect(withHl.text()).toContain("At Higher Levels");
  });
});
