import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import SearchResultList from "./SearchResultList.vue";
import type { SearchGroup } from "@/composables/useGlobalSearch";

vi.mock("@/components/common/media/FocalImage.vue", () => ({
  default: { props: ["src", "alt", "focalPoint", "renderWidth", "format"], template: '<img data-testid="thumb" :src="src" :alt="alt" />' },
}));

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
    expect(rows[2].find(".font-cinzel").exists()).toBe(false);
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
    await full.find("button").trigger("click");
    expect(full.emitted("dismissUpsell")).toHaveLength(1);

    const bare = render({ groups: [], isSemanticPending: true, failedMessage: "x", showProUpsell: true });
    expect(bare.text()).not.toContain("Searching by meaning…");
    expect(bare.text()).toContain("Pro searches by meaning");
  });

  it("announces a followed row", async () => {
    const wrapper = render();
    await wrapper.find("a").trigger("click");
    expect(wrapper.emitted("navigate")).toHaveLength(1);
  });
});
