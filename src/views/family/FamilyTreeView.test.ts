import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import FamilyTreeView from "./FamilyTreeView.vue";
import { edge, key, makeSource, person, sourceOf } from "@/components/kinship/testGraph";
import { useFamilyUiStore } from "@/stores/ui/family";

const mocks = vi.hoisted(() => ({
  route: { params: { key: "npc:brenna" } as Record<string, string>, meta: {} as Record<string, unknown> },
  replace: vi.fn(),
  push: vi.fn(),
  dm: vi.fn(),
  player: vi.fn(),
}));

vi.mock("vue-router", async (orig) => ({
  ...(await orig<typeof import("vue-router")>()),
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}));
vi.mock("@/composables/useBreakpoint", () => ({ useIsMobile: () => ref(false), useIsTouch: () => ref(false) }));
vi.mock("@/composables/kinship/useKinGraph", () => ({
  useDmKinGraph: () => mocks.dm(),
  usePlayerKinGraph: () => mocks.player(),
}));

function mountView() {
  return mount(FamilyTreeView, { global: { stubs: { RouterLink: RouterLinkStub, AddRelativeDialog: true } } });
}
const names = (w: ReturnType<typeof mountView>) => w.findAll(".kin-name").map((n) => n.text());

describe("FamilyTreeView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.route.params = { key: "npc:brenna" };
    mocks.route.meta = {};
    mocks.replace.mockReset();
    mocks.push.mockReset();
    mocks.dm.mockReset().mockImplementation(() => makeSource());
    mocks.player.mockReset().mockImplementation(() => makeSource({ withBirth: false }));
  });

  it("names the centred person and offers Add relative to the DM", () => {
    const w = mountView();
    expect(w.text()).toContain("Family of");
    expect(w.find("h1").text()).toBe("Brenna");
    expect(w.text()).toContain("Centred on Brenna");
    expect(w.text()).toContain("Add relative");
    expect(mocks.dm).toHaveBeenCalled();
    expect(mocks.player).not.toHaveBeenCalled();
  });

  it("re-centres through the router when another person is selected", async () => {
    const w = mountView();
    const aldous = w.findAllComponents({ name: "KinCard" }).find((c) => c.text().includes("Aldous"));
    await aldous?.trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ name: "family-tree", params: { key: key("aldous") } });
  });

  it("opens the person on a second tap of the centred card", async () => {
    const w = mountView();
    const brenna = w.findAllComponents({ name: "KinCard" }).find((c) => c.text().includes("Brenna"));
    await brenna?.trigger("click");
    expect(mocks.push).toHaveBeenCalledWith("/npcs/brenna");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("unfolds a folded branch", async () => {
    const w = mountView();
    // Corin is a cousin, so his child folds into a count.
    expect(names(w)).not.toContain("Pip");
    const fold = w.findAll("button").find((b) => /child/.test(b.text()));
    expect(fold).toBeDefined();
    await fold?.trigger("click");
    await flushPromises();
    expect(names(w)).toContain("Pip");
  });

  it("filters the dead and PCs with the toggles", async () => {
    mocks.route.params = { key: "npc:tomas" };
    const w = mountView();
    expect(names(w)).toContain("Aldous");
    expect(names(w)).toContain("Brenna");
    const ui = useFamilyUiStore();
    ui.familyShowDead = false;
    ui.familyShowPcs = false;
    await flushPromises();
    expect(names(w)).not.toContain("Aldous");
    expect(names(w)).not.toContain("Brenna");
    expect(names(w)).toContain("Tomas");
    expect(ui.familyHasActiveFilters).toBe(true);
    ui.resetFamilyFilters();
    expect(ui.familyHasActiveFilters).toBe(false);
  });

  it("reads the player source on the player route and hides DM-only controls", () => {
    mocks.route.meta = { layout: "player" };
    const w = mountView();
    expect(mocks.player).toHaveBeenCalled();
    expect(mocks.dm).not.toHaveBeenCalled();
    expect(w.text()).not.toContain("Add relative");
  });

  it("shows a skeleton while loading", () => {
    mocks.dm.mockImplementation(() => ({ ...makeSource(), isLoading: ref(true) }));
    const w = mountView();
    expect(w.find("[data-testid='family-skeleton']").exists()).toBe(true);
  });

  it("says so when the person is not in the book", () => {
    mocks.route.params = { key: "npc:nobody" };
    const w = mountView();
    expect(w.text()).toContain("This person is not in your book.");
  });

  it("keeps the centred person on screen whatever the toggles hide", async () => {
    mocks.route.params = { key: "npc:aldous" };
    const ui = useFamilyUiStore();
    ui.familyShowDead = false;
    const w = mountView();
    await flushPromises();
    expect(names(w)).toContain("Aldous");
    expect(names(w)).not.toContain("Hesta");
  });

  it("hides a spouse who came into the family when that toggle is off, and only then", async () => {
    mocks.dm.mockImplementation(() =>
      sourceOf(
        [person("mum", "Mum", 1400), person("bren", "Bren", 1428), person("wife", "Wife", 1430)],
        [edge("1", "mum", "bren", "parent"), edge("2", "bren", "wife", "spouse")],
      ),
    );
    mocks.route.params = { key: "npc:bren" };
    const w = mountView();
    expect(names(w)).toContain("Wife");
    const ui = useFamilyUiStore();
    ui.familyShowMarriedIn = false;
    await flushPromises();
    expect(names(w)).not.toContain("Wife");
    expect(names(w)).toContain("Mum");
  });

  it("re-centres a player on the player's tree, not the DM's", async () => {
    mocks.route.meta = { layout: "player" };
    const w = mountView();
    const aldous = w.findAllComponents({ name: "KinCard" }).find((c) => c.text().includes("Aldous"));
    await aldous?.trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ name: "play-family-tree", params: { key: key("aldous") } });
  });

  it("does not take someone with parents for a spouse who married in just because their partner has parents too", async () => {
    mocks.dm.mockImplementation(() =>
      sourceOf(
        [person("mum", "Mum", 1400), person("bren", "Bren", 1428), person("wife", "Wife", 1430), person("inlaw", "Inlaw", 1405)],
        [edge("1", "mum", "bren", "parent"), edge("2", "bren", "wife", "spouse"), edge("3", "inlaw", "wife", "parent")],
      ),
    );
    mocks.route.params = { key: "npc:bren" };
    const w = mountView();
    const ui = useFamilyUiStore();
    ui.familyShowMarriedIn = false;
    await flushPromises();
    expect(names(w)).toContain("Wife");
  });

  it("folds a branch again once the tree is centred on someone else", async () => {
    const route = reactive(mocks.route);
    const w = mountView();
    await w.findAll("button").find((b) => /child/.test(b.text()))!.trigger("click");
    await flushPromises();
    expect(names(w)).toContain("Pip");
    route.params = { key: "npc:tomas" };
    await flushPromises();
    route.params = { key: "npc:brenna" };
    await flushPromises();
    expect(names(w)).not.toContain("Pip");
  });
});
