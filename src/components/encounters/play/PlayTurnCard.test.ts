// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import type { Monster } from "@/types/monster.types";
import PlayTurnCard from "./PlayTurnCard.vue";

function c(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "enemy", initiative: 10, hp: 12, max_hp: 20, ac: "14",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 3, y: 3 }, monster_id: "ogre", ...over,
  };
}

const ogre = {
  id: "ogre", name: "Ogre", size: "large", monster_type: "giant",
  stat_block: { speed: "30 ft.", actions: [{ name: "Greatclub" }], bonus_actions: [] },
} as unknown as Monster;

function setup(extra: Partial<RunCombatant> = {}, partyMembers: PartyMember[] = []) {
  const store = useEncounterRunStore();
  store.factions = [
    { id: "players", name: "Players", color: "#123", hostile_to: ["enemy"] },
    { id: "enemy", name: "Enemy", color: "#321", hostile_to: ["players"] },
  ];
  store.availableMonsters = [ogre];
  store.combatants = [
    c("Ogre", { initiative: 20, ...extra }),
    c("Goblin 3", { initiative: 12, faction_id: "players", position: { x: 5, y: 3 }, monster_id: undefined }),
    c("Mira", { initiative: 5, faction_id: "players", position: { x: 9, y: 9 }, monster_id: undefined }),
  ];
  store.started = true;
  store.round = 1;
  store.activeIndex = 0;
  const w = mount(PlayTurnCard, { props: { partyMembers }, global: { stubs: { PlayPcAttacks: { props: ["member", "senderName"], template: "<div data-testid='pc-attacks'>{{ member.id }} {{ senderName }}</div>" }, RunnerActionList: { props: ["sections"], template: "<div data-testid='actions'>{{ sections.map(s => s.label).join() }}</div>" } } } });
  return { store, w };
}

// #1125 decision 10 / frame 10: the right column on someone's turn, read top to bottom.
describe("PlayTurnCard", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("names whose turn it is with their AC, hit points and conditions", () => {
    const { w } = setup({ conditions: [{ name: "Raging" }] });
    expect(w.text()).toContain("Whose turn");
    expect(w.get("[data-testid=turn-card-line]").text()).toBe("Large giant · AC 14 · 12 / 20 HP · Raging");
  });

  it("says how far the turn has moved against the speed, and shows the bar's caption", () => {
    const { w } = setup({ movement_used: 20 });
    expect(w.get("[data-testid=turn-card-moving]").text()).toBe("Moving 20 of 30 ft");
    expect(w.text()).toContain("Gilt: moved · then speed · dashed: a Dash");
  });

  it("with no speed on the board it still counts the feet, and draws no bar", () => {
    const { w } = setup({ movement_used: 10, monster_id: undefined });
    expect(w.get("[data-testid=turn-card-moving]").text()).toBe("Moved 10 ft · Speed unknown");
    expect(w.text()).not.toContain("Gilt: moved");
    expect(w.find("[role=img]").exists()).toBe(false);
  });

  it("Back to start is for a token that has moved, and asks the map to take the moves back", async () => {
    const { store, w } = setup();
    const back = () => w.findAll("button").find((b) => b.text() === "Back to start")!;
    expect(back().attributes("disabled")).toBeDefined();
    store.recordMove("Ogre", { x: 1, y: 1 }, 10);
    await w.vm.$nextTick();
    expect(back().attributes("disabled")).toBeUndefined();
    await back().trigger("click");
    expect(w.emitted("back-to-start")).toHaveLength(1);
  });

  it("says who is next to the turn-taker: the foe beside them, not the one across the room", async () => {
    const { w } = setup();
    // Goblin 3 stands at (5,3): the Large ogre at (3,3) covers x 3 to 5, so they touch.
    expect(w.get("[data-testid=turn-card-next-to]").text()).toBe("next to Goblin 3");
  });

  it("says nothing about neighbours when no foe is close", () => {
    const { store, w } = setup();
    store.combatants[1].position = { x: 12, y: 12 };
    return w.vm.$nextTick().then(() => expect(w.find("[data-testid=turn-card-next-to]").exists()).toBe(false));
  });

  it("taps mark the action, bonus action and reaction spent, and tap again takes them back", async () => {
    const { store, w } = setup();
    const chip = (label: string) => w.findAll("button").find((b) => b.text() === label)!;
    await chip("Action").trigger("click");
    await chip("Bonus action").trigger("click");
    await chip("Reaction").trigger("click");
    expect(store.combatants[0]).toMatchObject({ action_used: true, bonus_used: true, reactionUsed: true });
    expect(chip("Action").attributes("aria-pressed")).toBe("true");
    await chip("Action").trigger("click");
    await chip("Bonus action").trigger("click");
    expect(store.combatants[0]).toMatchObject({ action_used: false, bonus_used: false });
  });

  it("lists a character's attacks on the card, under their own name, not a pointer to the sheet", async () => {
    const pm = { id: "pm", class: "Barbarian", level: 5, speed: 30 } as PartyMember;
    const { w } = setup({ type: "player", party_member_id: "pm", monster_id: undefined }, [pm]);
    expect(w.get("[data-testid=pc-attacks]").text()).toBe("pm Ogre");
    expect(w.text()).not.toContain("on the full sheet");
  });

  it("lists a monster's actions to roll, and sends a character to the full sheet for theirs", () => {
    expect(setup().w.get("[data-testid=actions]").text()).toBe("Actions");
    const { store, w } = setup();
    store.combatants[0] = c("Ogre", { initiative: 20, type: "player", party_member_id: "pm", monster_id: undefined });
    return w.vm.$nextTick().then(() => {
      expect(w.find("[data-testid=actions]").exists()).toBe(false);
      expect(w.text()).toContain("Their attacks and spells are on the full sheet.");
    });
  });

  it("Enlarge or Reduce sets the size for the fight, and 'own size' puts it back", async () => {
    const { store, w } = setup();
    const select = w.get("select[aria-label='Size for this fight']");
    await select.setValue("huge");
    expect(store.combatants[0].size_override).toBe("huge");
    await select.setValue("");
    expect(store.combatants[0].size_override).toBeNull();
  });

  it("tells the DM where damage lands and who the card moves to on Next turn, and Next turn hands over", async () => {
    const { store, w } = setup();
    expect(w.get("[data-testid=turn-card-handoff]").text()).toBe(
      "Damage and healing land on whoever is selected on the map or in the list, not only on Ogre. Next turn moves the card to Goblin 3.",
    );
    await w.findAll("button").find((b) => b.text() === "Next turn")!.trigger("click");
    expect(store.activeCombatant?.instance_id).toBe("Goblin 3");
  });

  it("opens the full sheet on request", async () => {
    const { w } = setup();
    await w.findAll("button").find((b) => b.text() === "Open the full sheet")!.trigger("click");
    expect(w.emitted("open-sheet")).toHaveLength(1);
  });
});
