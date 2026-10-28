import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import SpellSheet from "./SpellSheet.vue";
import type { Spell } from "@/types/spell.types";

vi.mock("@/composables/library/useSourceTitles", () => ({
  useSourceTitles: () => ({
    labelFor: (source: string | null | undefined, title?: string | null) => (source ? (title ?? source) : null),
  }),
}));

const lookups = vi.hoisted(() => ({ knowers: [] as unknown[], casters: [] as unknown[] }));
vi.mock("@/composables/party/useCharacterSpells", () => ({ useSpellKnowers: () => ({ data: ref(lookups.knowers) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcSpellCasters: () => ({ data: ref(lookups.casters) }) }));

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

const stubs = { FocalImage: true, RouterLink: true };
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

describe("SpellSheet who else is shown", () => {
  afterEach(() => {
    lookups.knowers = [];
    lookups.casters = [];
  });
  const full = (compact = false) => mount(SpellSheet, { props: { spell: spell(), compact }, global: { stubs: { FocalImage: true, RouterLink: RouterLinkStub } } });

  it("lists the characters who know the spell and the NPCs who cast it, and not in compact mode", () => {
    lookups.knowers = [{ party_member_id: "m1", name: "Ilse", is_prepared: true }, { party_member_id: "m2", name: "Bram", is_prepared: false }];
    lookups.casters = [{ npc_id: "n1", name: "Old Tom" }];
    const w = full();
    expect(w.text()).toContain("Known By");
    expect(w.text()).toContain("Ilse");
    expect(w.text()).toContain("Old Tom");
    expect(w.text().match(/· prepared/g)).toHaveLength(1);
    const compact = full(true);
    expect(compact.text()).not.toContain("Known By");
    expect(compact.text()).not.toContain("Ilse");
    expect(compact.text()).not.toContain("Cast By");
    expect(compact.text()).not.toContain("Old Tom");
  });

  it("draws no Known By or Cast By heading when nobody does", () => {
    expect(full().text()).not.toContain("Known By");
    expect(full().text()).not.toContain("Cast By");
  });

  it("shows the component letters in the full sheet but not the compact one", () => {
    expect(full().text()).toContain("V, S");
    expect(full(true).text()).not.toContain("V, S");
  });
});
