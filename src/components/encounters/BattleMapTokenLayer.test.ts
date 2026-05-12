// Performance regression guards for BattleMapTokenLayer.
//
// The /simplify pass made dragging one token cheap by adding per-token
// render-key memoization (only redraw a token's canvas when its visual
// inputs change) and O(1) monster/faction lookups. These tests pin those
// invariants so a future refactor — e.g. adding a new prop to the render
// key, or reverting to Array.find — doesn't silently reintroduce the
// "drag one token, redraw all N" thrash.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("@/lib/tokenRenderer", () => ({
  drawToken: vi.fn(() => Promise.resolve()),
}));

import { drawToken } from "@/lib/tokenRenderer";
import BattleMapTokenLayer from "./BattleMapTokenLayer.vue";
import type { RunCombatant, FactionDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";

const drawTokenMock = vi.mocked(drawToken);

function combatant(id: string, monsterId: string, factionId = "enemy"): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: factionId,
    initiative: null,
    hp: 10,
    max_hp: 10,
    ac: "12",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    monster_id: monsterId,
    dex_mod: 0,
    portrait_url: null,
    portrait_focal_point: null,
    position: { x: 0, y: 0 },
  };
}

function monster(id: string, name: string, size: Monster["size"] = "medium"): Monster {
  return {
    id,
    user_id: "u",
    name,
    monster_type: "humanoid",
    size,
    alignment: "neutral",
    habitat: null,
    source: null,
    tags: [],
    stat_block: {},
    description: null,
    image_url: null,
    portrait_focal_point: null,
    created_at: "",
    updated_at: "",
  } as unknown as Monster;
}

const factions: FactionDef[] = [
  { id: "enemy", name: "Enemy", color: "#dc2626", hostile_to: [] },
  { id: "ally", name: "Ally", color: "#16a34a", hostile_to: [] },
];

function baseProps() {
  return {
    hostW: 1000,
    hostH: 600,
    cellPx: 50,
    originX: 0,
    originY: 0,
    combatants: [
      combatant("m-1-0", "goblin"),
      combatant("m-1-1", "goblin"),
      combatant("m-2-0", "ogre"),
    ],
    factions,
    monsters: [monster("goblin", "Goblin"), monster("ogre", "Ogre", "large")],
    npcs: [],
    activeInstanceId: null,
    draggableInstanceIds: null,
    hideHidden: false,
    silhouetteUnseen: false,
  };
}

beforeEach(() => {
  drawTokenMock.mockClear();
});

describe("BattleMapTokenLayer — render-key memoization", () => {
  it("draws each token exactly once on initial mount", async () => {
    mount(BattleMapTokenLayer, { props: baseProps() });
    await nextTick();
    await nextTick();
    expect(drawTokenMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT redraw any token's canvas when only a position changes", async () => {
    const wrapper = mount(BattleMapTokenLayer, { props: baseProps() });
    await nextTick();
    await nextTick();
    drawTokenMock.mockClear();

    const next = baseProps().combatants.map((c, i) =>
      i === 0 ? { ...c, position: { x: 5, y: 7 } } : c,
    );
    await wrapper.setProps({ combatants: next });
    await nextTick();
    await nextTick();

    expect(drawTokenMock).not.toHaveBeenCalled();
  });

  it("redraws only the affected token when its faction changes", async () => {
    const wrapper = mount(BattleMapTokenLayer, { props: baseProps() });
    await nextTick();
    await nextTick();
    drawTokenMock.mockClear();

    const next = baseProps().combatants.map((c, i) =>
      i === 0 ? { ...c, faction_id: "ally" } : c,
    );
    await wrapper.setProps({ combatants: next });
    await nextTick();
    await nextTick();

    expect(drawTokenMock).toHaveBeenCalledTimes(1);
  });

  it("redraws only the affected token when its activeTurn changes", async () => {
    const wrapper = mount(BattleMapTokenLayer, { props: baseProps() });
    await nextTick();
    await nextTick();
    drawTokenMock.mockClear();

    await wrapper.setProps({ activeInstanceId: "m-1-1" });
    await nextTick();
    await nextTick();

    expect(drawTokenMock).toHaveBeenCalledTimes(1);
  });
});
