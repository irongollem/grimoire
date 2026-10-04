import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import SpellList from "./SpellList.vue";
import AppButton from "@/components/common/AppButton.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import type { SpellBrowseRow } from "@/types/spell.types";

/** happy-dom ships no IntersectionObserver; the sentinel is not under test. */
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);

// vi.hoisted runs before "vue" is bound, so the rows live in a plain array and
// the mocked composable wraps them in refs at call time. The filters it was
// called with are recorded: the server does the filtering now.
const mocks = vi.hoisted(() => ({
  rows: [] as SpellBrowseRow[],
  filters: [] as Array<Record<string, string>>,
}));
vi.mock("@/composables/spells/useSpellBrowse", () => ({
  useSpellBrowse: (filters: () => Record<string, string>) => {
    mocks.filters.push(filters());
    return {
      rows: ref(mocks.rows),
      total: ref(mocks.rows.length),
      selectableIds: ref(mocks.rows.filter((r) => !r.is_shared).map((r) => r.id)),
      ready: ref(true),
      hasNextPage: ref(false),
      isFetchingNextPage: ref(false),
      fetchNextPage: vi.fn(),
      isLoading: ref(false),
      error: ref(null),
    };
  },
}));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ prefetchQuery: vi.fn() }) }));
vi.mock("@/composables/spells/useSpells", () => ({
  fetchResolvedSpell: vi.fn(),
  resolvedSpellKey: (id: string) => ["resolved-spell", id],
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

function makeSpell(overrides: Partial<SpellBrowseRow> = {}): SpellBrowseRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Test Spell",
    level: 1,
    school: "evocation",
    ritual: false,
    casting_time: "1 action",
    range: "60 feet",
    components: ["V", "S"],
    concentration: false,
    classes: [],
    tags: [],
    source: null,
    source_title: null,
    source_url: null,
    is_shared: false,
    ...overrides,
  };
}

const globalStubs = { stubs: { RouterLink: RouterLinkStub } };

function mountList(
  props: Partial<{ selecting: boolean; selectedIds: ReadonlySet<string>; sourceFilter: string }> = {},
) {
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
    mocks.rows = [];
    mocks.filters = [];
  });

  it("excludes a shared/library row (source_record_key set) from selectableIds", () => {
    mocks.rows = [
      makeSpell({ id: "11111111-1111-4111-8111-111111111111", name: "Homebrew Bolt" }),
      makeSpell({ id: "22222222-2222-4222-8222-222222222222", name: "Fireball", is_shared: true }),
    ];
    const wrapper = mountList();
    expect(wrapper.vm.selectableIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });

  it("selectableIds is the server's whole answer, not the loaded rows", () => {
    mocks.rows = [makeSpell(), makeSpell({ id: "22222222-2222-4222-8222-222222222222" })];
    const wrapper = mountList();
    expect(wrapper.vm.selectableIds).toHaveLength(2);
    expect(wrapper.vm.selectableReady).toBe(true);
    expect(wrapper.findAllComponents(BulkSelectableCard)).toHaveLength(2);
  });

  it("wraps a DM-owned row's card with selecting on, but a shared row's with selecting off", () => {
    mocks.rows = [
      makeSpell({ id: "11111111-1111-4111-8111-111111111111", name: "Homebrew Bolt" }),
      makeSpell({ id: "22222222-2222-4222-8222-222222222222", name: "Fireball", is_shared: true }),
    ];
    const wrapper = mountList({ selecting: true });
    const cards = wrapper.findAllComponents(BulkSelectableCard);
    expect(cards).toHaveLength(2);
    expect(cards[0].props("selecting")).toBe(true);
    expect(cards[1].props("selecting")).toBe(false);
  });

  it("does not enter selecting mode for any row when the list-wide flag is off", () => {
    mocks.rows = [makeSpell({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = mountList({ selecting: false });
    expect(wrapper.findComponent(BulkSelectableCard).props("selecting")).toBe(false);
  });

  it("reflects selectedIds onto the matching card's selected prop", () => {
    mocks.rows = [
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
    mocks.rows = [makeSpell({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = mountList({ selecting: true });
    await wrapper.findComponent(BulkSelectableCard).vm.$emit("toggle");
    expect(wrapper.emitted("toggle-select")).toEqual([["11111111-1111-4111-8111-111111111111"]]);
  });

  it("puts the checkbox chip in the top-right corner, clear of the Edit button at top-left", () => {
    mocks.rows = [makeSpell({ id: "11111111-1111-4111-8111-111111111111" })];
    const wrapper = mountList({ selecting: true });
    expect(wrapper.findComponent(BulkSelectableCard).props("corner")).toBe("top-right");
  });
});

describe("SpellList filters", () => {
  it("hands every filter to the server query, search debounced to its first value", () => {
    mocks.filters = [];
    mocks.rows = [];
    mountList({ sourceFilter: "custom" });
    expect(mocks.filters[0]).toEqual({
      search: "", level: "", school: "", class: "", source: "custom",
    });
  });

  it("the Edit button is hidden for a shared row", () => {
    mocks.rows = [
      makeSpell({ id: "11111111-1111-4111-8111-111111111111", name: "Homebrew Bolt" }),
      makeSpell({ id: "22222222-2222-4222-8222-222222222222", name: "Fireball", is_shared: true }),
    ];
    const wrapper = mountList();
    const edits = wrapper.findAllComponents(AppButton).filter((b) => b.props("tooltip") === "Edit spell");
    expect(edits).toHaveLength(1);
  });
});
