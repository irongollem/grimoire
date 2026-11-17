import { describe, expect, it } from "vitest";
import { effectScope, nextTick, reactive } from "vue";
import { useSoloCreatureTurns, type TurnHolder } from "./useSoloCreatureTurns";

const ME = "member-1";
const rosie: TurnHolder = { instance_id: "p-rosie", party_member_id: ME, hp: 20 };
const hound = (n: number, hp = 10): TurnHolder => ({ instance_id: `hound-${n}`, hp });

/** A fight as the composable sees it: an order, whose turn it is, and what was run. */
function fight(order: TurnHolder[], over: { memberId?: string | null; started?: boolean; runs?: (id: string) => boolean } = {}) {
  const state = reactive({ index: 0, round: 1, started: over.started ?? true, memberId: over.memberId === undefined ? ME : over.memberId });
  const ran: string[] = [];
  const waits: number[] = [];
  const scope = effectScope();
  scope.run(() =>
    useSoloCreatureTurns({
      memberId: () => state.memberId,
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

describe("useSoloCreatureTurns", () => {
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
});
