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

const beastArt = vi.hoisted(() => ({ byId: new Map<string, { image_url: string | null }>() }));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({
  useMonstersByIds: () => ({ data: { value: beastArt.byId } }),
}));
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
  // The leak this pins: an "unseen" combatant paints a "???" silhouette on
  // its canvas, but the wrapper's native `title` used to carry the real name,
  // so a player hovering the mystery token read "Ash-wight" in a browser
  // tooltip. Found by the #884 review pass.
  it("withholds a silhouetted combatant's name from its tooltip", async () => {
    const props = baseProps();
    const hidden = { ...props.combatants[0], reveal_state: "unseen" as const };
    const wrapper = mount(BattleMapTokenLayer, {
      props: { ...props, combatants: [hidden], silhouetteUnseen: true },
    });
    await nextTick();
    expect(wrapper.find(".token").attributes("title")).toBeUndefined();
  });

  it("still names a revealed combatant in its tooltip", async () => {
    const props = baseProps();
    const wrapper = mount(BattleMapTokenLayer, {
      props: { ...props, combatants: [props.combatants[0]], silhouetteUnseen: true },
    });
    await nextTick();
    expect(wrapper.find(".token").attributes("title")).toBe(props.combatants[0].name);
  });

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

describe("BattleMapTokenLayer — mini portrait overrides (frame 13)", () => {
  it("prefers a portrait override over the combatant's own portrait_url", async () => {
    const withPortrait: RunCombatant = { ...combatant("m-1-0", "goblin"), portrait_url: "npc.png" };
    mount(BattleMapTokenLayer, {
      props: {
        ...baseProps(),
        combatants: [withPortrait],
        portraitOverrides: new Map([["m-1-0", "mini.png"]]),
      },
    });
    await nextTick();
    await nextTick();

    expect(drawTokenMock.mock.calls[0][1].imageUrl).toBe("mini.png");
  });

  it("redraws when a portrait override arrives for an otherwise-unchanged combatant", async () => {
    const wrapper = mount(BattleMapTokenLayer, { props: baseProps() });
    await nextTick();
    await nextTick();
    drawTokenMock.mockClear();

    await wrapper.setProps({ portraitOverrides: new Map([["m-1-0", "mini.png"]]) });
    await nextTick();
    await nextTick();

    expect(drawTokenMock).toHaveBeenCalledTimes(1);
  });
});

describe("BattleMapTokenLayer — footprint persistence", () => {
  it("uses combatant.footprint when no monster data is available (player path)", () => {
    // Simulates the player view: liveState combatants carry a baked footprint
    // but the `monsters` prop is empty because players can't read the monsters
    // table. The token must still render at the right footprint.
    const largeCombatant: RunCombatant = {
      ...combatant("m-dragon-0", "dragon"),
      footprint: 3, // Huge — baked at spawn time by the DM's runner.
    };
    const wrapper = mount(BattleMapTokenLayer, {
      props: {
        ...baseProps(),
        combatants: [largeCombatant],
        monsters: [], // player has no monster data
      },
    });
    const tok = wrapper.find(".token");
    expect(tok.exists()).toBe(true);
    // Footprint 3 × cellPx 50 = 150 px.
    expect((tok.element as HTMLElement).style.width).toBe("150px");
    expect((tok.element as HTMLElement).style.height).toBe("150px");
  });

  it("falls back to monster size when footprint is absent (legacy combatant)", () => {
    // A combatant that predates the footprint bake should still render
    // correctly on the DM side via the monsters lookup.
    const legacy: RunCombatant = combatant("m-ogre-0", "ogre");
    // explicitly drop footprint so the fallback path is exercised
    delete (legacy as { footprint?: number }).footprint;
    const wrapper = mount(BattleMapTokenLayer, {
      props: {
        ...baseProps(),
        combatants: [legacy],
        // Ogre is large → 2×2 → 100 px at cellPx 50.
      },
    });
    const tok = wrapper.find(".token");
    expect((tok.element as HTMLElement).style.width).toBe("100px");
  });
});

describe("BattleMapTokenLayer: what a player is shown", () => {
  it("omits a hidden combatant from the player view and keeps it for the DM", async () => {
    const props = baseProps();
    const lurker = { ...props.combatants[0], instance_id: "lurker", reveal_state: "hidden" as const };
    const combatants = [lurker, props.combatants[2]];
    const player = mount(BattleMapTokenLayer, { props: { ...props, combatants, hideHidden: true } });
    expect(player.findAll(".token")).toHaveLength(1);
    expect(player.find(".token").attributes("title")).toBe("m-2-0");
    const dm = mount(BattleMapTokenLayer, { props: { ...props, combatants, hideHidden: false } });
    expect(dm.findAll(".token")).toHaveLength(2);
  });

  it("shows the DM an unseen combatant by name (the silhouette is player-only)", () => {
    const props = baseProps();
    const unseen = { ...props.combatants[0], reveal_state: "unseen" as const };
    const wrapper = mount(BattleMapTokenLayer, {
      props: { ...props, combatants: [unseen], silhouetteUnseen: false },
    });
    expect(wrapper.find(".token").attributes("title")).toBe("m-1-0");
  });

  it("tells the canvas to paint the silhouette for a player, and only for the unseen one", async () => {
    const props = baseProps();
    const unseen = { ...props.combatants[0], reveal_state: "unseen" as const };
    const seen = { ...props.combatants[2], reveal_state: "revealed" as const };
    mount(BattleMapTokenLayer, { props: { ...props, combatants: [unseen, seen], silhouetteUnseen: true } });
    await nextTick();
    await nextTick();
    const stateByName = new Map(
      drawTokenMock.mock.calls.map(([, entity, opts]) => [entity.name, opts?.revealState]),
    );
    expect(stateByName.get("m-1-0")).toBe("unseen");
    expect(stateByName.get("m-2-0")).toBe("revealed");
  });

  it("draws a wild-shaped druid as the beast, not as the character's mini or portrait", async () => {
    const druid: RunCombatant = {
      ...combatant("druid", "goblin"),
      type: "player",
      portrait_url: "druid.png",
      wildshape: {
        monster_id: "wolf",
        beast_name: "Wolf",
        beast_image_url: "wolf.png",
        beast_hp: 11,
        beast_max_hp: 11,
        beast_ac: "13",
      },
    };
    mount(BattleMapTokenLayer, {
      props: { ...baseProps(), combatants: [druid], portraitOverrides: new Map([["druid", "mini.png"]]) },
    });
    await nextTick();
    await nextTick();
    expect(drawTokenMock.mock.calls[0][1].imageUrl).toBe("wolf.png");
  });

  it("draws the beast's live art when the form copied none (library beast, maintainer report)", async () => {
    beastArt.byId = new Map([["wolf", { image_url: "live-wolf.png" }]]);
    const druid: RunCombatant = {
      ...combatant("druid", "goblin"),
      type: "player",
      wildshape: { monster_id: "wolf", beast_name: "Wolf", beast_image_url: null, beast_hp: 11, beast_max_hp: 11, beast_ac: "13" },
    };
    mount(BattleMapTokenLayer, { props: { ...baseProps(), combatants: [druid] } });
    await nextTick();
    await nextTick();
    beastArt.byId = new Map();
    expect(drawTokenMock.mock.calls[0][1].imageUrl).toBe("live-wolf.png");
  });
});

describe("BattleMapTokenLayer: dead monsters and dragging", () => {
  it("fades a monster at 0 HP but not one at 1 HP", () => {
    const props = baseProps();
    const down = { ...props.combatants[0], instance_id: "down", hp: 0 };
    const up = { ...props.combatants[1], instance_id: "up", hp: 1 };
    const wrapper = mount(BattleMapTokenLayer, { props: { ...props, combatants: [down, up] } });
    const [first, second] = wrapper.findAll(".token");
    expect(first.classes()).toContain("token-dead");
    expect(second.classes()).not.toContain("token-dead");
  });

  it("renders no tokens before the map has a scale", () => {
    const wrapper = mount(BattleMapTokenLayer, { props: { ...baseProps(), cellPx: 0 } });
    expect(wrapper.findAll(".token")).toHaveLength(0);
  });

  function pointer(type: string, init: { clientX: number; clientY: number }) {
    const ev = new MouseEvent(type, { ...init, bubbles: true, cancelable: true });
    Object.defineProperty(ev, "pointerId", { value: 1 });
    return ev;
  }

  async function dragFirstToken(props: Omit<ReturnType<typeof baseProps>, "draggableInstanceIds"> & { draggableInstanceIds: Set<string> | null }) {
    const onPositionChange = vi.fn();
    const wrapper = mount(BattleMapTokenLayer, {
      props: { ...props, combatants: [props.combatants[0]], onPositionChange },
      attachTo: document.body,
    });
    const el = wrapper.find(".token").element as HTMLElement;
    el.setPointerCapture = vi.fn();
    el.dispatchEvent(pointer("pointerdown", { clientX: 10, clientY: 10 }));
    window.dispatchEvent(pointer("pointermove", { clientX: 140, clientY: 70 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 140, clientY: 70 }));
    await nextTick();
    wrapper.unmount();
    return onPositionChange;
  }

  it("drops a dragged token on the nearest cell and reports it", async () => {
    // Moved 130px right, 60px down from cell (0,0) at 50px a cell:
    // 130/50 = 2.6 rounds to column 3, 60/50 = 1.2 rounds to row 1.
    const spy = await dragFirstToken({ ...baseProps(), draggableInstanceIds: null });
    expect(spy).toHaveBeenCalledWith("m-1-0", { x: 3, y: 1 });
  });

  it("lets a player drag only their own token", async () => {
    const mine = await dragFirstToken({ ...baseProps(), draggableInstanceIds: new Set(["m-1-0"]) });
    expect(mine).toHaveBeenCalledTimes(1);
    const theirs = await dragFirstToken({ ...baseProps(), draggableInstanceIds: new Set(["someone-else"]) });
    expect(theirs).not.toHaveBeenCalled();
  });
});
