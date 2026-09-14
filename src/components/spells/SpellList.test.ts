import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import SpellList from "./SpellList.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import type { Spell } from "@/types/spell.types";

/**
 * happy-dom's IntersectionObserver never fires without a real layout, which is
 * exactly what these tests want: `visibleItems` stays pinned at the first
 * `useInfiniteScroll` page (48) so "select all shown" can be asserted against
 * the full filtered set, not just what's painted.
 */
class IntersectionObserverStub {
  observe() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

// A plain array, not a ref: vi.hoisted's callback runs before any import in
// this file (including "vue") is initialized, so calling ref() inside it
// throws a TDZ error. The mocked useAllSpells below wraps this in a real ref
// at call time instead, which is late enough for "vue" to be bound.
const mocks = vi.hoisted(() => ({ spells: [] as Spell[] }));
vi.mock("@/composables/spells/useSpells", () => ({
  useAllSpells: () => ({ data: ref(mocks.spells), isLoading: ref(false) }),
}));
// Sidesteps useScrollRestore's onBeforeRouteLeave, which needs an installed
// router — irrelevant to the bulk-selection wiring under test here.
vi.mock("@/composables/useScrollRestore", () => ({
  useScrollRestore: () => ({ savedCount: undefined, linkCount: vi.fn() }),
}));
vi.mock("@/composables/party/useCharacterSpells", () => ({
  useAddCharacterSpell: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useChangePreparedSpell: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useRemoveCharacterSpell: () => ({ mutate: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/party/useSpellReplacement", () => ({
  useSpellReplacement: () => ({ candidate: ref(null), clear: vi.fn() }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({
  useRuleset: () => ({ ruleset: ref("2014") }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), fromError: (e: unknown) => String(e) }),
}));

function makeSpell(overrides: Partial<Spell> = {}): Spell {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "user-1",
    campaign_id: null,
    name: "Test Spell",
    level: 1,
    school: "evocation",
    casting_time: "1 action",
    casting_time_custom: null,
    range: "60 feet",
    range_custom: null,
    components: ["V", "S"],
    material: null,
    duration: "Instantaneous",
    duration_custom: null,
    concentration: false,
    ritual: false,
    attack_type: null,
    save_attribute: null,
    save_effect: null,
    damage_rolls: null,
    healing_dice: null,
    target_description: null,
    aoe_shape: null,
    aoe_size: null,
    condition_inflicted: null,
    description: "",
    higher_levels: null,
    higher_level_damage: null,
    higher_level_healing: null,
    classes: [],
    tags: [],
    source: null,
    source_title: null,
    source_url: null,
    open5e_import: false,
    source_record_key: null,
    image_url: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const globalStubs = { stubs: { RouterLink: RouterLinkStub } };

function mountList(props: Partial<{ selecting: boolean; selectedIds: ReadonlySet<string> }> = {}) {
  return mount(SpellList, {
    props: {
      search: "",
      levelFilter: "",
      schoolFilter: "",
      classFilter: "",
      sourceFilter: "all",
      ...props,
    },
    global: globalStubs,
  });
}

describe("SpellList — bulk selection (#875)", () => {
  beforeEach(() => {
    mocks.spells = [];
  });

  it("excludes a shared/library row (source_record_key set) from selectableIds", () => {
    mocks.spells = [
      makeSpell({ id: "11111111-1111-4111-8111-111111111111", name: "Homebrew Bolt" }),
      makeSpell({ id: "22222222-2222-4222-8222-222222222222", name: "Fireball", source_record_key: "srd-2014-fireball" }),
    ];
    const wrapper = mountList();
    expect(wrapper.vm.selectableIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("selectableIds covers every filtered row, not only the visible/painted window", () => {
    mocks.spells = Array.from({ length: 60 }, (_, i) =>
      makeSpell({
        id: `11111111-${String(i).padStart(4, "0")}-4111-8111-111111111111`,
        name: `Spell ${i}`,
      }),
    );
    const wrapper = mountList();
    expect(wrapper.vm.selectableIds).toHaveLength(60);
    expect(wrapper.findAllComponents(BulkSelectableCard)).toHaveLength(48);
  });

  it("wraps a DM-owned row's card with selecting on, but a shared row's with selecting off", () => {
    mocks.spells = [
      makeSpell({ id: "11111111-1111-4111-8111-111111111111", name: "Homebrew Bolt" }),
      makeSpell({ id: "22222222-2222-4222-8222-222222222222", name: "Fireball", source_record_key: "srd-2014-fireball" }),
    ];
    const wrapper = mountList({ selecting: true });
    const cards = wrapper.findAllComponents(BulkSelectableCard);
    expect(cards).toHaveLength(2);
    expect(cards[0].props("selecting")).toBe(true);
    expect(cards[1].props("selecting")).toBe(false);
  });

  it("does not enter selecting mode for any row when the list-wide flag is off", () => {
    mocks.spells = [makeSpell({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = mountList({ selecting: false });
    expect(wrapper.findComponent(BulkSelectableCard).props("selecting")).toBe(false);
  });

  it("reflects selectedIds onto the matching card's selected prop", () => {
    mocks.spells = [
      makeSpell({ id: "11111111-1111-4111-8111-111111111111" }),
      makeSpell({ id: "22222222-2222-4222-8222-222222222222" }),
    ];
    const wrapper = mountList({
      selecting: true,
      selectedIds: new Set(["22222222-2222-4222-8222-222222222222"]),
    });
    const cards = wrapper.findAllComponents(BulkSelectableCard);
    expect(cards[0].props("selected")).toBe(false);
    expect(cards[1].props("selected")).toBe(true);
  });

  it("toggling a card emits toggle-select with that row's id", async () => {
    mocks.spells = [makeSpell({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = mountList({ selecting: true });
    await wrapper.findComponent(BulkSelectableCard).vm.$emit("toggle");
    expect(wrapper.emitted("toggle-select")).toEqual([["11111111-1111-4111-8111-111111111111"]]);
  });

  it("puts the checkbox chip in the top-right corner, clear of the Edit button at top-left", () => {
    mocks.spells = [makeSpell({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = mountList({ selecting: true });
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("top-right");
  });
});
