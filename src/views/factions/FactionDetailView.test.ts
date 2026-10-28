import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import FactionDetailView from "./FactionDetailView.vue";
import type { Faction } from "@/types/faction.types";

const mocks = vi.hoisted(() => ({
  route: { name: "faction-detail", params: { id: "f1" }, query: {} as Record<string, string> },
  replace: vi.fn(),
  faction: null as unknown,
}));

vi.mock("vue-router", () => ({
  useRoute: () => reactive(mocks.route),
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useFaction: () => ({ data: ref(mocks.faction), isLoading: ref(false) }),
}));

const stubs = {
  PageHeader: { template: "<div><slot /></div>" },
  FactionEditor: true,
  FactionSheet: { template: "<div data-testid='sheet' />" },
  HouseLineage: { template: "<div data-testid='lineage' />" },
  FactionMembersSection: true,
  FactionPartyMembersSection: true,
  ConnectionsSection: true,
  DmNoteBox: true,
  EntityBacklinks: true,
};
const mountIt = () => mount(FactionDetailView, { global: { stubs } });
const faction = (type: string): Faction => ({ id: "f1", name: "X", faction_type: type }) as Faction;

describe("FactionDetailView tabs", () => {
  beforeEach(() => {
    mocks.route.query = {};
    mocks.replace.mockReset();
  });

  it("a House gets Overview and Lineage, on Overview by default", () => {
    mocks.faction = faction("House");
    const w = mountIt();
    expect(w.findAll('[role="tab"]').map((t) => t.text())).toEqual(["Overview", "Lineage"]);
    expect(w.find("[data-testid=sheet]").exists()).toBe(true);
    expect(w.find("[data-testid=lineage]").exists()).toBe(false);
  });

  it("?tab=lineage opens the Lineage", () => {
    mocks.faction = faction("House");
    mocks.route.query = { tab: "lineage" };
    const w = mountIt();
    expect(w.find("[data-testid=lineage]").exists()).toBe(true);
    expect(w.find("[data-testid=sheet]").exists()).toBe(false);
  });

  it("choosing the tab writes it to the URL", async () => {
    mocks.faction = faction("House");
    const w = mountIt();
    await w.findAll('[role="tab"]')[1]?.trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { tab: "lineage" } });
  });

  it("another kind of faction has no tab bar, whatever the URL says", () => {
    mocks.faction = faction("Guild");
    mocks.route.query = { tab: "lineage" };
    const w = mountIt();
    expect(w.find('[role="tab"]').exists()).toBe(false);
    expect(w.find("[data-testid=sheet]").exists()).toBe(true);
  });

  it("choosing Lineage keeps the other query params, and going back to Overview drops tab and focus", async () => {
    mocks.faction = faction("House");
    mocks.route.query = { view: "x" };
    const w = mountIt();
    await w.findAll('[role="tab"]')[1]?.trigger("click");
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { view: "x", tab: "lineage" } });

    mocks.route.query = { view: "x", tab: "lineage", focus: "npc:abc" };
    const back = mountIt();
    await back.findAll('[role="tab"]')[0]?.trigger("click");
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { view: "x" } });
  });

  it("while editing there is no tab bar even for a House", () => {
    mocks.faction = faction("House");
    mocks.route.query = { edit: "true" };
    expect(mountIt().find('[role="tab"]').exists()).toBe(false);
  });

  it("a new faction shows the editor, no tabs, and does not wait on a faction to load", () => {
    mocks.route.name = "faction-new";
    mocks.route.params = {} as typeof mocks.route.params;
    mocks.faction = faction("House");
    const w = mountIt();
    expect(w.find('[role="tab"]').exists()).toBe(false);
    expect(w.findComponent({ name: "FactionEditor" }).exists()).toBe(true);
    mocks.route.name = "faction-detail";
    mocks.route.params = { id: "f1" };
  });
});
