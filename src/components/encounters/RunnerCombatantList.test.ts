// @vitest-environment jsdom
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RunnerCombatantList from "./RunnerCombatantList.vue";
import type { RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import type { CharacterMemorial } from "@/types/memorial.types";

const mocks = vi.hoisted(() => ({
  mobile: false,
  store: undefined as unknown as { sortedCombatants: unknown[]; started: boolean; activeCombatant: unknown },
  party: [] as unknown[],
  memorials: undefined as unknown[] | undefined,
}));

vi.mock("@/stores/encounterRun", async () => {
  const { reactive } = await import("vue");
  mocks.store = reactive({
    sortedCombatants: [] as unknown[],
    started: false,
    activeCombatant: null as unknown,
  });
  return { useEncounterRunStore: () => mocks.store };
});
vi.mock("@/composables/useBreakpoint", () => ({
  useIsMobile: () => ({
    get value() {
      return mocks.mobile;
    },
  }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { value: mocks.party } }) }));
vi.mock("@/composables/memorials/useMemorials", () => ({
  useCampaignMemorials: () => ({ data: { value: mocks.memorials } }),
}));

// Mounted lists keep watching the shared store; leave none behind for the next test.
enableAutoUnmount(afterEach);

const stubs = {
  RunnerCombatantRow: true,
  RunnerCombatantCard: {
    name: "RunnerCombatantCard",
    props: ["combatant"],
    emits: ["open"],
    template: "<button class='row' @click=\"$emit('open', combatant.instance_id)\">{{ combatant.name }}</button>",
  },
  RunnerCombatantSheet: {
    name: "RunnerCombatantSheet",
    props: ["combatant", "open"],
    emits: ["open-detail", "update:open"],
    template: "<div class='sheet' :data-open='open' :data-id='combatant.instance_id' />",
  },
  SetDownDialog: { name: "SetDownDialog", props: ["open", "mode", "member"], template: "<div data-testid='dialog' :data-open='open' />" },
  AppButton: { props: ["label"], template: "<button>{{ label }}</button>" },
};

const downed = {
  instance_id: "i1",
  type: "player",
  name: "Chicory",
  party_member_id: "pm1",
  death_saves: { successes: 0, failures: 3 },
} as unknown as RunCombatant;

describe("RunnerCombatantList fallen offer", () => {
  beforeEach(() => {
    mocks.store.sortedCombatants = [downed];
    mocks.party = [{ id: "pm1", name: "Chicory" } as PartyMember];
    mocks.memorials = [];
  });

  it("offers to mark a party member with three failed saves and opens the dialog for them", async () => {
    const w = mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } });
    expect(w.find("[data-testid=fallen-offer]").exists()).toBe(true);
    expect(w.find("[data-testid=dialog]").attributes("data-open")).toBe("false");
    await w.find("[data-testid=offer-mark]").trigger("click");
    const dialog = w.findComponent({ name: "SetDownDialog" });
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("mode")).toBe("fallen");
    expect(dialog.props("member")).toMatchObject({ id: "pm1" });
  });

  it("makes no offer once a memorial is in effect, or while memorials are loading", () => {
    mocks.memorials = [{ party_member_id: "pm1", restored_at: null } as CharacterMemorial];
    expect(mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } }).find("[data-testid=fallen-offer]").exists()).toBe(false);
    mocks.memorials = undefined;
    expect(mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } }).find("[data-testid=fallen-offer]").exists()).toBe(false);
  });

  const mountList = () => mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } });
  const offerShown = () => mountList().find("[data-testid=fallen-offer]").exists();

  it("waits for the third failed save", () => {
    mocks.store.sortedCombatants = [{ ...downed, death_saves: { successes: 1, failures: 2 } }];
    expect(offerShown()).toBe(false);
  });

  it("drops the offer when the DM says not yet", async () => {
    const w = mountList();
    await w.find("[data-testid=offer-dismiss]").trigger("click");
    expect(w.find("[data-testid=fallen-offer]").exists()).toBe(false);
  });

  it("is not stopped by a restored memorial or by another character's memorial", () => {
    mocks.memorials = [{ party_member_id: "pm1", restored_at: "2026-10-01T00:00:00Z" } as CharacterMemorial];
    expect(offerShown()).toBe(true);
    mocks.memorials = [{ party_member_id: "pm2", restored_at: null } as CharacterMemorial];
    expect(offerShown()).toBe(true);
  });

  it("offers nothing for a monster, or a player who is not in the party", () => {
    mocks.store.sortedCombatants = [{ ...downed, type: "monster" } as RunCombatant];
    expect(offerShown()).toBe(false);
    mocks.store.sortedCombatants = [{ ...downed, party_member_id: "stranger" }];
    expect(offerShown()).toBe(false);
  });
});


describe("RunnerCombatantList on a phone", () => {
  const goblin = { ...downed, instance_id: "m1", type: "monster", name: "Goblin", death_saves: { successes: 0, failures: 0 } } as unknown as RunCombatant;
  const mountPhone = () => mount(RunnerCombatantList, { props: { selectedId: null }, global: { stubs } });

  beforeEach(() => {
    mocks.mobile = true;
    mocks.party = [];
    mocks.memorials = [];
    mocks.store.started = false;
    mocks.store.activeCombatant = null;
    mocks.store.sortedCombatants = [downed, goblin];
  });
  afterEach(() => {
    mocks.mobile = false;
  });

  it("opens the sheet for the row that was tapped, not the first one", async () => {
    const w = mountPhone();
    expect(w.find(".sheet").exists()).toBe(false);
    await w.findAll(".row")[1].trigger("click");
    expect(w.find(".sheet").attributes("data-id")).toBe("m1");
    expect(w.find(".sheet").attributes("data-open")).toBe("true");
  });

  it("closes the sheet when the sheet asks to close", async () => {
    const w = mountPhone();
    await w.findAll(".row")[0].trigger("click");
    w.findComponent({ name: "RunnerCombatantSheet" }).vm.$emit("update:open", false);
    await w.vm.$nextTick();
    expect(w.find(".sheet").attributes("data-open")).toBe("false");
  });

  it("selects the combatant for the stat block when the sheet hands over", async () => {
    const w = mountPhone();
    await w.findAll(".row")[1].trigger("click");
    w.findComponent({ name: "RunnerCombatantSheet" }).vm.$emit("open-detail", "m1");
    expect(w.emitted("select")).toEqual([["m1"]]);
  });

  it("drops the sheet when its combatant leaves the fight instead of showing a stale one", async () => {
    const w = mountPhone();
    await w.findAll(".row")[1].trigger("click");
    mocks.store.sortedCombatants = [downed];
    await w.vm.$nextTick();
    expect(w.find(".sheet").exists()).toBe(false);
  });

  it("scrolls the row whose turn it is into view", async () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const w = mount(RunnerCombatantList, {
      props: { selectedId: null },
      global: { stubs },
      attachTo: document.body,
    });
    mocks.store.started = true;
    mocks.store.activeCombatant = goblin;
    await w.vm.$nextTick();
    await w.vm.$nextTick();
    const scrolled = (scroll.mock.contexts as HTMLElement[]).map((el) => el.dataset.rowId);
    expect(scrolled).toEqual(["m1"]);
  });
});
