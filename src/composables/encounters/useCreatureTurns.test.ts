import { describe, expect, it } from "vitest";
import { effectScope, nextTick, reactive } from "vue";
import { useCreatureTurns, type TurnHolder } from "./useCreatureTurns";

const ME = "member-1";
const rosie: TurnHolder = { instance_id: "p-rosie", party_member_id: ME, hp: 20 };
const hound = (n: number, hp = 10): TurnHolder => ({ instance_id: `hound-${n}`, hp });

/** A fight as the composable sees it: an order, whose turn it is, and what was run. */
function fight(order: TurnHolder[], over: { memberId?: string | null; started?: boolean; runs?: (id: string) => boolean; downTakesTurn?: (now: TurnHolder) => boolean } = {}) {
  const state = reactive({ index: 0, round: 1, started: over.started ?? true, memberId: over.memberId === undefined ? ME : over.memberId });
  const ran: string[] = [];
  const waits: number[] = [];
  const scope = effectScope();
  scope.run(() =>
    useCreatureTurns({
      memberId: () => state.memberId,
      downTakesTurn: over.downTakesTurn,
      started: () => state.started,
      active: () => order[state.index] ?? null,
      turnKey: () => `${state.round}:${state.index}`,
      run: async (id) => {
        ran.push(id);
        return over.runs ? over.runs(id) : true;
      },
      next: () => {
        state.index += 1;
        if (state.index >= order.length) {
          state.index = 0;
          state.round += 1;
        }
      },
      wait: async (ms) => {
        waits.push(ms);
      },
    }),
  );
  const settle = async () => {
    for (let i = 0; i < 20; i++) await nextTick();
  };
  return { state, ran, waits, settle, stop: () => scope.stop() };
}

describe("useCreatureTurns", () => {
  // Bug caught: a solo player left pressing "Run this turn for me" and "Next turn" for every creature.
  it("plays each creature's turn and stops at the player's", async () => {
    const f = fight([hound(1), hound(2), rosie, hound(3)]);
    await f.settle();
    expect(f.ran).toEqual(["hound-1", "hound-2"]);
    expect(f.state.index).toBe(2);
    f.stop();
  });

  // Bug caught: the player's own turn played for them, or passed before they could act.
  it("never runs or passes the player's own turn", async () => {
    const f = fight([rosie, hound(1)]);
    await f.settle();
    expect(f.ran).toEqual([]);
    expect(f.state.index).toBe(0);
    f.stop();
  });

  it("goes on with the creatures once the player ends their turn", async () => {
    const f = fight([rosie, hound(1), hound(2)]);
    await f.settle();
    f.state.index = 1;
    await f.settle();
    expect(f.ran).toEqual(["hound-1", "hound-2"]);
    expect(f.state).toMatchObject({ index: 0, round: 2 });
    f.stop();
  });

  // Bug caught: a creature at 0 hit points asked to act (the server refuses it) and the fight stuck on its turn.
  it("passes a creature that is down without running it", async () => {
    const f = fight([hound(1, 0), rosie]);
    await f.settle();
    expect(f.ran).toEqual([]);
    expect(f.state.index).toBe(1);
    f.stop();
  });

  // Bug caught: a turn that could not be run passed over silently, so a creature loses its turn and nobody is told.
  it("stays on a creature whose turn could not be run", async () => {
    const f = fight([hound(1), rosie], { runs: () => false });
    await f.settle();
    expect(f.ran).toEqual(["hound-1"]);
    expect(f.state.index).toBe(0);
    f.stop();
  });

  // Bug caught: the DM's own fight screen playing every monster by itself.
  it("does nothing in an ordinary fight, or before the fight has started", async () => {
    const ordinary = fight([hound(1), rosie], { memberId: null });
    const lobby = fight([hound(1), rosie], { started: false });
    await ordinary.settle();
    await lobby.settle();
    expect(ordinary.ran.length + lobby.ran.length).toBe(0);
    ordinary.stop();
    lobby.stop();
  });

  it("leaves what a creature did on screen for a moment before the turn passes", async () => {
    const f = fight([hound(1), rosie]);
    await f.settle();
    expect(f.waits).toEqual([2500]);
    f.stop();
  });

  // #1203, carried into #1021 row 5a: the Dungeon Master's runner on autopilot. Bug caught: the autopilot playing
  // a player character's turn for them, or running on with the switch off.
  it("on autopilot runs every creature and stops at any player's turn, and does nothing while switched off", async () => {
    const order: TurnHolder[] = [hound(1), { instance_id: "p-wren", party_member_id: "m-wren", hp: 20, type: "player" }, hound(2)];
    const state = reactive({ index: 0, on: false });
    const ran: string[] = [];
    const scope = effectScope();
    scope.run(() =>
      useCreatureTurns({
        enabled: () => state.on,
        stopsAt: (now) => now.type === "player",
        started: () => true,
        active: () => order[state.index] ?? null,
        turnKey: () => state.index,
        run: async (id) => {
          ran.push(id);
          return true;
        },
        next: () => {
          state.index += 1;
        },
        wait: async () => {},
      }),
    );
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(ran).toEqual([]);
    state.on = true;
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(ran).toEqual(["hound-1"]);
    expect(order[state.index].instance_id).toBe("p-wren");
    scope.stop();
  });

  /** An autopilot over three hounds whose run and pause only finish when the test says so. */
  function held() {
    const order: TurnHolder[] = [hound(1), hound(2), hound(3)];
    const state = reactive({ index: 0, on: true });
    const nexts: number[] = [];
    let finishRun: () => void = () => {};
    let finishWait: () => void = () => {};
    const scope = effectScope();
    scope.run(() =>
      useCreatureTurns({
        enabled: () => state.on,
        stopsAt: () => false,
        started: () => true,
        active: () => order[state.index] ?? null,
        turnKey: () => state.index,
        run: () => new Promise<boolean>((resolve) => { finishRun = () => resolve(true); }),
        next: () => {
          nexts.push(state.index);
          state.index += 1;
        },
        wait: () => new Promise<void>((resolve) => { finishWait = resolve; }),
      }),
    );
    const settle = async () => { for (let i = 0; i < 10; i++) await nextTick(); };
    return { state, nexts, scope, settle, finishRun: () => finishRun(), finishWait: () => finishWait() };
  }

  // Bug caught: the DM leaves the runner while a creature's turn is being played and the loop goes on passing turns on a route that changed.
  it("stops passing turns once the runner is left while a turn is being played", async () => {
    const f = held();
    await f.settle();
    f.scope.stop();
    f.finishRun();
    await f.settle();
    f.finishWait();
    await f.settle();
    expect(f.nexts).toEqual([]);
  });

  // Bug caught: the DM leaves during the pause that follows a turn and the loop still passes it on afterwards.
  it("stops passing turns once the runner is left during the pause after a turn", async () => {
    const f = held();
    await f.settle();
    f.finishRun();
    await f.settle();
    f.scope.stop();
    f.finishWait();
    await f.settle();
    expect(f.nexts).toEqual([]);
  });

  // Bug caught: switching Autopilot off during a creature's turn still advanced the turn once.
  it("does not pass the turn when autopilot is switched off while it is being played", async () => {
    const f = held();
    await f.settle();
    f.state.on = false;
    f.finishRun();
    await f.settle();
    f.finishWait();
    await f.settle();
    expect(f.nexts).toEqual([]);
    f.scope.stop();
  });

  // Bug caught: switching Autopilot off during the pause after a turn still advanced the turn once.
  it("does not pass the turn when autopilot is switched off during the pause", async () => {
    const f = held();
    await f.settle();
    f.finishRun();
    await f.settle();
    f.state.on = false;
    f.finishWait();
    await f.settle();
    expect(f.nexts).toEqual([]);
    f.scope.stop();
  });

  // Bug caught: a downed ally passed without its death save, so it never dies or stabilises.
  it("runs a downed creature when downTakesTurn says so, and still passes a downed foe", async () => {
    const ally: TurnHolder = { instance_id: "p-ally", party_member_id: "member-2", hp: 0, type: "player" };
    const f = fight([ally, hound(1, 0), rosie], { downTakesTurn: (now) => now.type === "player" });
    await f.settle();
    expect(f.ran).toEqual(["p-ally"]);
    expect(f.state.index).toBe(2);
    f.stop();
  });

  // Bug caught: the autopilot (no downTakesTurn) running a downed player's turn.
  it("without downTakesTurn a downed player is passed", async () => {
    const down: TurnHolder = { instance_id: "p-down", party_member_id: "member-2", hp: 0, type: "player" };
    const f = fight([down, rosie]);
    await f.settle();
    expect(f.ran).toEqual([]);
    f.stop();
  });

  // Bug caught: the autopilot running through a player's turn when downTakesTurn is given alongside stopsAt.
  it("an autopilot with stopsAt still stops at a player's turn", async () => {
    const order = [hound(1), rosie];
    const state = reactive({ index: 0 });
    const ran: string[] = [];
    const scope = effectScope();
    scope.run(() =>
      useCreatureTurns({
        enabled: () => true,
        stopsAt: (now) => now.type === "player" || now.party_member_id === ME,
        started: () => true,
        active: () => order[state.index] ?? null,
        turnKey: () => String(state.index),
        run: async (id) => { ran.push(id); return true; },
        next: () => { state.index += 1; },
        wait: async () => {},
      }),
    );
    for (let i = 0; i < 20; i++) await nextTick();
    expect(ran).toEqual(["hound-1"]);
    expect(state.index).toBe(1);
    scope.stop();
  });
});
