import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import SearchResultList from "./SearchResultList.vue";
import type { SearchGroup } from "@/composables/useGlobalSearch";

vi.mock("@/components/common/media/FocalImage.vue", () => ({
  default: { props: ["src", "alt", "focalPoint", "renderWidth", "format"], template: '<img data-testid="thumb" :src="src" :alt="alt" />' },
}));

const mocks = vi.hoisted(() => ({ people: [] as unknown[], count: null as number | null }));
vi.mock("@/composables/connections/useConnectionDrillIn", async (importOriginal) => {
  const { computed, ref } = await import("vue");
  return {
    ...(await importOriginal<typeof import("@/composables/connections/useConnectionDrillIn")>()),
    useConnectionDrillIn: (_subject: unknown, open: { value: boolean } | (() => boolean), filter: { value: string }) => {
      void open;
      return {
        people: computed(() => mocks.people),
        filtered: computed(() => (mocks.people as { other_name: string }[]).filter((p) => p.other_name.toLowerCase().includes(filter.value.toLowerCase()))),
        count: computed(() => mocks.count),
        isLoading: ref(false),
        isError: ref(false),
      };
    },
  };
});

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/:p(.*)*", component: { template: "<div />" } }] });

const groups: SearchGroup[] = [
  {
    type: "npc",
    label: "NPCs",
    items: [
      { id: "n1", name: "Floss", route: "/npcs/n1", matchedBy: "name" },
      { id: "n2", name: "Marrow", route: "/npcs/n2", matchedBy: "meaning", descriptor: "retired performer" },
    ],
  },
  { type: "location", label: "Locations", items: [{ id: "l1", name: "The Inn", route: "/l/l1", matchedBy: "meaning", descriptor: null }] },
];

function render(props: Partial<InstanceType<typeof SearchResultList>["$props"]> = {}) {
  return mount(SearchResultList, {
    props: { groups, thumbnails: { n1: { src: "floss.webp", focalPoint: null } }, ...props },
    global: { plugins: [router] },
  });
}

describe("SearchResultList", () => {
  it("gives a name hit one line and a meaning hit a second, with a screen-reader lead-in", () => {
    const rows = render().findAll("a");
    expect(rows[0].find(".italic").exists()).toBe(false);
    expect(rows[1].find(".italic").text()).toBe("Found by meaning: retired performer");
    expect(rows[1].find(".italic .sr-only").text()).toBe("Found by meaning:");
  });

  it("falls back to the words 'found by meaning' when there is no descriptor", () => {
    const reason = render().findAll("a")[2].find(".italic");
    expect(reason.text()).toBe("Found by meaning: found by meaning");
  });

  it("shows a thumbnail or an initial on NPC rows only", () => {
    const rows = render().findAll("a");
    expect(rows[0].find("[data-testid=thumb]").attributes("src")).toBe("floss.webp");
    expect(rows[1].text()).toContain("M");
    expect(rows[1].find("[data-testid=thumb]").exists()).toBe(false);
  });

  it("gives a monster row a plate too, and a tie's far end the plate of its own kind, not of the Ties group", () => {
    const wrapper = render({
      thumbnails: { m1: { src: "ogre.webp", focalPoint: null }, n2: { src: "brenna.webp", focalPoint: null } },
      groups: [
        { type: "monster", label: "Monsters", items: [{ id: "m1", name: "Ogre", route: "/monsters/m1", matchedBy: "name" }] },
        { type: "ties", label: "Ties", items: [{ id: "n2", name: "Brenna", kind: "npc", route: "/npcs/n2", matchedBy: "name", tie: "kin of Harl" }] },
        { type: "item", label: "Items", items: [{ id: "i1", name: "Rope", route: "/items/i1", matchedBy: "name" }] },
      ],
    });
    const rows = wrapper.findAll("a");
    expect(rows[0].find("[data-testid=thumb]").attributes("src")).toBe("ogre.webp");
    expect(rows[1].find("[data-testid=thumb]").attributes("src")).toBe("brenna.webp");
    expect(rows[2].text()).toBe("Rope");
  });

  it("numbers rows across groups for the keyboard highlight and reports hovers", async () => {
    const wrapper = render({ focusedIndex: 2 });
    const rows = wrapper.findAll("a");
    expect(rows[2].classes()).toContain("bg-secondary/60");
    expect(rows[0].classes()).not.toContain("bg-secondary/60");
    await rows[2].trigger("mouseenter");
    expect(wrapper.emitted("hover")).toEqual([[2]]);
  });

  it("makes touch rows at least 2.75rem tall", () => {
    expect(render({ density: "touch" }).find("a").classes()).toContain("min-h-11");
  });

  it("renders the pending row, the failure message and the upsell, and with no groups only the upsell", async () => {
    const full = render({ isSemanticPending: true, failedMessage: "Couldn't search Quests.", showProUpsell: true });
    expect(full.text()).toContain("Searching by meaning…");
    expect(full.text()).toContain("Couldn't search Quests.");
    expect(full.text()).toContain("Pro searches by meaning");
    await full.find("button[aria-label=\"Don't show this again\"]").trigger("click");
    expect(full.emitted("dismissUpsell")).toHaveLength(1);

    const bare = render({ groups: [], isSemanticPending: true, failedMessage: "x", showProUpsell: true });
    expect(bare.text()).not.toContain("Searching by meaning…");
    expect(bare.text()).toContain("Pro searches by meaning");
  });

  it("shows a detail line, and a tie's own words instead", () => {
    const wrapper = render({
      groups: [
        { type: "npc", label: "NPCs", items: [{ id: "n1", name: "Harl", route: "/npcs/n1", matchedBy: "name", detail: "Ferryman · Low Crossing" }] },
        { type: "ties", label: "Ties", items: [{ id: "n2", name: "Brenna", kind: "npc", route: "/npcs/n2", matchedBy: "name", tie: "worships The Drowned Lady", detail: "ignored" }] },
      ],
    });
    const rows = wrapper.findAll("a");
    expect(rows[0].text()).toContain("Ferryman · Low Crossing");
    expect(rows[1].text()).toContain("worships The Drowned Lady");
    expect(rows[1].text()).not.toContain("ignored");
    expect(wrapper.text()).toContain("Ties");
  });

  it("opens a place to its people in place, filters them, and navigates from there", async () => {
    mocks.people = [
      { row_id: "r1", other_kind: "npc", other_id: "p1", other_name: "Harl", role: null },
      { row_id: "r2", other_kind: "party_member", other_id: "p2", other_name: "Brenna", role: null },
    ];
    mocks.count = 2;
    const wrapper = render();
    const toggle = wrapper.findAll("button").find((b) => b.text().includes("2 people here"));
    expect(toggle).toBeDefined();
    expect(wrapper.text()).not.toContain("Harl");
    await toggle?.trigger("click");
    expect(wrapper.text()).toContain("Harl");
    expect(wrapper.text()).toContain("Brenna");

    await wrapper.find("input").setValue("bren");
    expect(wrapper.text()).not.toContain("Harl");

    const person = wrapper.findAll("a").find((a) => a.text().includes("Brenna"));
    expect(person?.attributes("href")).toBe("/party/p2");
    await person?.trigger("click");
    expect(wrapper.emitted("navigate")).toHaveLength(1);
  });

  it("says 'Members' on a faction until it has been read", () => {
    mocks.count = null;
    const wrapper = render({ groups: [{ type: "faction", label: "Factions", items: [{ id: "f1", name: "Toll-men", route: "/factions/f1", matchedBy: "name" }] }] });
    expect(wrapper.text()).toContain("Members");
  });

  it("in picker mode emits pick for a row and for a drilled-in person, and follows no link", async () => {
    mocks.people = [{ row_id: "r1", other_kind: "npc", other_id: "p1", other_name: "Harl", role: "Ferryman" }];
    mocks.count = 1;
    const wrapper = render({ selectable: true });
    expect(wrapper.findAll("a")).toHaveLength(0);
    const first = wrapper.findAll("button").find((b) => b.text().includes("Floss"));
    await first?.trigger("click");
    await wrapper.findAll("button").find((b) => b.text().includes("1 person here"))?.trigger("click");
    await wrapper.findAll("button").find((b) => b.text().includes("Harl"))?.trigger("click");
    expect(wrapper.emitted("pick")).toEqual([
      [{ kind: "npc", id: "n1", name: "Floss" }],
      [{ kind: "npc", id: "p1", name: "Harl" }],
    ]);
    expect(wrapper.emitted("navigate")).toBeUndefined();
  });

  it("announces a followed row", async () => {
    const wrapper = render();
    await wrapper.find("a").trigger("click");
    expect(wrapper.emitted("navigate")).toHaveLength(1);
  });
});
