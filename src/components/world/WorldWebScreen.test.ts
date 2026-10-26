import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import WorldWebScreen from "./WorldWebScreen.vue";
import { tie } from "@/lib/worldWeb/tieFixture";
import { useWorldUiStore } from "@/stores/ui/world";

// A screen left mounted would keep its Escape binding for the next test.
enableAutoUnmount(afterEach);

const push = vi.hoisted(() => vi.fn());
const phone = vi.hoisted(() => ({ value: false }));

vi.mock("vue-router", () => ({ useRouter: () => ({ push }), RouterLink: { template: "<a><slot /></a>" } }));
vi.mock("@/composables/useBreakpoint", () => ({
  useBelow: () => ref(phone.value),
  useIsTouch: () => ref(false),
}));
vi.mock("@/composables/world/useWorldWebEditing", () => ({
  useWorldWebEditing: () => ({
    busy: ref(false),
    connect: vi.fn(),
    retypeTie: vi.fn(),
    removeTie: vi.fn(),
    saveWords: vi.fn(),
  }),
}));
// The graph is the library's; these tests are about what the screen decides to show.
vi.mock("@/components/world/WorldWebGraph.vue", () => ({
  default: { name: "WorldWebGraph", props: ["graph", "group"], template: '<div data-test="graph" />' },
}));
vi.mock("@/components/common/entity/WorldEntityPicker.vue", () => ({ default: { template: "<div />" } }));

const ties = [
  tie({ row_id: "1" }),
  tie({ row_id: "2", type: "serves", from_id: "ama", from_name: "Sister Ama" }),
  tie({ row_id: "3", type: "friend", from_id: "ama", from_name: "Sister Ama", to_kind: "npc", to_id: "harl", to_name: "Harl" }),
];

function mountScreen(props: Record<string, unknown> = {}) {
  return mount(WorldWebScreen, {
    props: { ties, people: [], ...props },
    global: { stubs: { Teleport: true }, directives: { "no-pwm": {} } },
  });
}

describe("WorldWebScreen", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    phone.value = false;
    push.mockReset();
  });

  it("opens a DM on the whole web", () => {
    const w = mountScreen();
    expect(w.find("[data-test=graph]").exists()).toBe(true);
  });

  it("opens focused when asked, and a tap on a node moves the focus and extends the trail", async () => {
    const w = mountScreen({ focusKey: "deity:lady" });
    await flushPromises();
    expect(w.find("[data-test=graph]").exists()).toBe(false);
    expect(w.find("svg[aria-label^='Everything tied to The Drowned Lady']").exists()).toBe(true);

    await w.findAll("g[role=button]").find((g) => g.attributes("aria-label")?.startsWith("Sister Ama"))!.trigger("click");
    expect(w.find("svg[aria-label^='Everything tied to Sister Ama']").exists()).toBe(true);
    expect(w.find("nav[aria-label='Focus trail']").text()).toContain("The Drowned Lady");

    await w.findAll("nav button").find((b) => b.text() === "The Drowned Lady")!.trigger("click");
    expect(w.find("svg[aria-label^='Everything tied to The Drowned Lady']").exists()).toBe(true);
  });

  it("opens a phone on a focus, never on every dot at once", async () => {
    phone.value = true;
    const w = mountScreen();
    await flushPromises();
    expect(w.find("[data-test=graph]").exists()).toBe(false);
    // Sister Ama has the most ties.
    expect(w.find("svg[aria-label^='Everything tied to Sister Ama']").exists()).toBe(true);
    expect(w.text()).toContain("Connect…");
  });

  it("opens a player on their own character's node, read-only", async () => {
    const withPc = [...ties, tie({ row_id: "9", source: "patron_deity", type: "patron_deity", from_kind: "party_member", from_id: "ilse", from_name: "Ilse Thane" })];
    const w = mountScreen({ ties: withPc, readonly: true, homeKey: "party_member:ilse" });
    await flushPromises();
    expect(w.find("svg[aria-label^='Everything tied to Ilse Thane']").exists()).toBe(true);
    expect(w.text()).not.toContain("Connect…");
    expect(w.text()).not.toContain("Remove this tie");
  });

  it("Whole web leaves the focus for the graph and keeps it that way", async () => {
    phone.value = true;
    const w = mountScreen();
    await flushPromises();
    await w.findAll("button").find((b) => b.text() === "Whole web")!.trigger("click");
    expect(w.find("[data-test=graph]").exists()).toBe(true);
    await flushPromises();
    expect(w.find("[data-test=graph]").exists()).toBe(true);
  });

  it("says so when the world has no ties", () => {
    const w = mountScreen({ ties: [] });
    expect(w.text()).toContain("No connections recorded yet.");
    const player = mountScreen({ ties: [], readonly: true });
    expect(player.text()).toContain("Nothing in the world has been tied to anything you know of yet.");
  });

  it("tells a filter that hides everything from an empty world", () => {
    const ui = useWorldUiStore();
    ui.worldWebSearch = "zzz";
    const w = mountScreen();
    expect(w.text()).toContain("Nothing matches.");
  });
});
