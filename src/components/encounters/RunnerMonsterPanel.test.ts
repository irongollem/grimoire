// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import type { Monster } from "@/types/monster.types";
import type { RunCombatant } from "@/types/encounter.types";
vi.mock("@/composables/party/useFormPortraits", () => ({ useFormPortraits: () => () => ({ src: null, alt: "", focalPoint: null }) }));

import RunnerMonsterPanel from "./RunnerMonsterPanel.vue";

const combatant = (over: Partial<RunCombatant> = {}): RunCombatant => ({
  instance_id: "ogre", type: "monster", name: "Ogre", faction_id: "enemy", initiative: 10, hp: 20, max_hp: 30, ac: "12",
  conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...over,
});
const ogre = (actions: unknown[]) => ({ id: "ogre", name: "Ogre", size: "large", monster_type: "giant", stat_block: { actions, speed: "30 ft.", defenses: { resistances: [], vulnerabilities: [], immunities: [], condition_immunities: [] } } }) as unknown as Monster;

function mountPanel(c: RunCombatant, m: Monster) {
  return mount(RunnerMonsterPanel, {
    props: { combatant: c, monster: m },
    global: { stubs: { RunnerRunForMe: { template: "<div data-testid='run-for-me' />" }, RunnerActionList: true, RunnerPortrait: true, AbilityScoreTable: true, SpellcastingList: true, RunnerLegendaryActions: true } },
  });
}

describe("RunnerMonsterPanel run-for-me", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("fails if a creature with Actions is not offered Run this turn for me", () => {
    expect(mountPanel(combatant(), ogre([{ name: "Greatclub" }])).find("[data-testid=run-for-me]").exists()).toBe(true);
  });

  it("fails if a creature with no Actions is offered a turn the server cannot build", () => {
    expect(mountPanel(combatant(), ogre([])).find("[data-testid=run-for-me]").exists()).toBe(false);
  });

  it("fails if a party-side combatant is offered Run this turn for me", () => {
    expect(mountPanel(combatant({ type: "player" }), ogre([{ name: "Greatclub" }])).find("[data-testid=run-for-me]").exists()).toBe(false);
  });
});
