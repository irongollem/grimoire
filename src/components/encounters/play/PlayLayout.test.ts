// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useAppUiStore } from "@/stores/ui/app";
import type { RunCombatant } from "@/types/encounter.types";
import PlayLayout from "./PlayLayout.vue";

function c(id: string, initiative: number): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative, hp: 5, max_hp: 5, ac: "10",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 1, y: 1 },
  };
}

const PlayMapStub = defineComponent({
  name: "PlayMap",
  props: ["selectedId", "groupIds"],
  emits: ["select", "update:groupIds", "unplaced", "placed", "cancel-placing"],
  template: "<div data-testid='map' />",
});
const stubs = {
  PlayBar: true, PlayToolsSheet: true, RunnerDueConditions: true, ResizeHandle: true, PlayUnplacedTray: true,
  PlayInitiativeList: defineComponent({ emits: ["select"], template: "<button data-testid='pick-b' @click=\"$emit('select', 'b')\" />" }),
  PlayMap: PlayMapStub,
  PlayTurnCard: defineComponent({ name: "PlayTurnCard", emits: ["open-sheet", "back-to-start"], template: "<div data-testid='turn-card'><button data-testid='open' @click=\"$emit('open-sheet')\" /></div>" }),
  RunnerEntityDetail: defineComponent({ props: ["selectedId"], template: "<div data-testid='sheet'>{{ selectedId }}</div>" }),
};

function mountLayout() {
  const store = useEncounterRunStore();
  store.combatants = [c("a", 20), c("b", 10)];
  store.started = true;
  store.round = 1;
  const w = mount(PlayLayout, {
    props: {
      encounterId: "e1", isLive: false, goingLive: false, canGoLive: false, canGenerate: false, turnTimerSeconds: null, turnResetKey: 0,
      partyMembers: [], selectedId: null, selectedTrapId: null, toolsOpen: false,
      "onUpdate:selectedId": (v: string | null) => w.setProps({ selectedId: v }),
    },
    global: { stubs },
  });
  return { store, w };
}

describe("PlayLayout", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // #1125 decision 9: the Play screen is the whole window.
  it("takes the whole window while it is on screen and gives the app shell back when it goes", () => {
    const ui = useAppUiStore();
    const { w } = mountLayout();
    expect(ui.editorFocus).toBe(true);
    w.unmount();
    expect(ui.editorFocus).toBe(false);
  });

  it("shows the turn card on whose turn it is and selects that token on the map", () => {
    const { w } = mountLayout();
    expect(w.find("[data-testid=turn-card]").exists()).toBe(true);
    expect(w.find("[data-testid=sheet]").exists()).toBe(false);
    expect(w.findComponent(PlayMapStub).props("selectedId")).toBe("a");
  });

  it("picking someone else shows their sheet with a way back to the turn", async () => {
    const { w } = mountLayout();
    await w.get("[data-testid=pick-b]").trigger("click");
    expect(w.get("[data-testid=sheet]").text()).toBe("b");
    expect(w.find("[data-testid=turn-card]").exists()).toBe(false);
    await w.get("[data-testid=back-to-turn]").trigger("click");
    expect(w.find("[data-testid=turn-card]").exists()).toBe(true);
  });

  it("a token picked on the map is the one the column shows", async () => {
    const { w } = mountLayout();
    w.findComponent(PlayMapStub).vm.$emit("select", "b");
    await w.vm.$nextTick();
    expect(w.get("[data-testid=sheet]").text()).toBe("b");
  });

  it("the turn card's full sheet opens the turn-taker's sheet, and the link goes back to the card", async () => {
    const { w } = mountLayout();
    await w.get("[data-testid=open]").trigger("click");
    expect(w.get("[data-testid=sheet]").text()).toBe("a");
    await w.get("[data-testid=back-to-turn]").trigger("click");
    expect(w.find("[data-testid=turn-card]").exists()).toBe(true);
  });

  it("the turn moving on takes the selection back to whose turn it is, and drops a group", async () => {
    const { store, w } = mountLayout();
    await w.get("[data-testid=pick-b]").trigger("click");
    w.findComponent(PlayMapStub).vm.$emit("update:groupIds", ["a", "b"]);
    await w.vm.$nextTick();
    expect(w.findComponent(PlayMapStub).props("groupIds")).toEqual(["a", "b"]);
    store.nextTurn();
    await w.vm.$nextTick();
    expect(w.findComponent(PlayMapStub).props("groupIds")).toEqual([]);
    expect(w.findComponent(PlayMapStub).props("selectedId")).toBe("b");
    expect(w.find("[data-testid=turn-card]").exists()).toBe(true);
  });

  it("before combat starts there is no turn to take, so the sheet is all there is", () => {
    const store = useEncounterRunStore();
    store.combatants = [c("a", 20)];
    store.started = false;
    const w = mount(PlayLayout, {
      props: {
        encounterId: "e1", isLive: false, goingLive: false, canGoLive: false, canGenerate: false, turnTimerSeconds: null, turnResetKey: 0,
        partyMembers: [], selectedId: null, selectedTrapId: null, toolsOpen: false,
      },
      global: { stubs },
    });
    expect(w.find("[data-testid=turn-card]").exists()).toBe(false);
    expect(w.find("[data-testid=sheet]").exists()).toBe(true);
  });
});
