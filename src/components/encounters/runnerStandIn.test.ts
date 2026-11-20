import { describe, expect, it } from "vitest";
import { effectScope, nextTick, reactive } from "vue";
import { useCreatureTurns, type TurnHolder } from "@/composables/encounters/useCreatureTurns";
import { autopilotDownTakesTurn, autopilotStopsAt, standInIdsOf } from "./runnerResolve";

const tam: TurnHolder = { instance_id: "p-tam", party_member_id: "pm-tam", type: "player", hp: 12 };
const pip: TurnHolder = { instance_id: "p-pip", party_member_id: "pm-pip", type: "player", hp: 12 };
const hound: TurnHolder = { instance_id: "hound", type: "monster", hp: 10 };

/** Runs the DM's autopilot over an order, as the runner wires it, and returns who was run and where the loop stopped. */
async function autopilot(order: TurnHolder[], standIns: ReadonlySet<string>) {
  const state = reactive({ index: 0, round: 1 });
  const ran: string[] = [];
  const scope = effectScope();
  scope.run(() =>
    useCreatureTurns({
      enabled: () => true,
      stopsAt: autopilotStopsAt(standIns),
      downTakesTurn: autopilotDownTakesTurn(standIns),
      started: () => true,
      active: () => order[state.index],
      turnKey: () => `${state.round}:${state.index}`,
      run: async (id) => {
        ran.push(id);
        return true;
      },
      next: () => {
        state.index = (state.index + 1) % order.length;
        if (state.index === 0) state.round += 1;
      },
      wait: async () => {},
    }),
  );
  for (let i = 0; i < 40; i++) await nextTick();
  scope.stop();
  return { ran, stoppedAt: order[state.index].instance_id };
}

describe("standInIdsOf", () => {
  // Bug: a character with only the player's consent (or only the DM's switch) played by the AI.
  it("takes only a member with both words", () => {
    const ids = standInIdsOf([
      { id: "both", ai_speaks: true, ai_stands_in: true },
      { id: "consent", ai_speaks: true, ai_stands_in: false },
      { id: "switch", ai_speaks: false, ai_stands_in: true },
      { id: "neither" },
    ]);
    expect([...ids]).toEqual(["both"]);
  });
});

describe("the runner's autopilot and stand-ins", () => {
  // Bug: autopilot stopping at every player, so a character the AI plays still waits for the DM; or running on past a human player.
  it("runs a stand-in's turn and stops at a human player's", async () => {
    const { ran, stoppedAt } = await autopilot([hound, tam, pip], new Set(["pm-tam"]));
    expect(ran).toEqual(["hound", "p-tam"]);
    expect(stoppedAt).toBe("p-pip");
  });

  // Bug: a downed stand-in passed over without its death save, or a downed human's turn run for them.
  it("runs a downed stand-in's turn for its death save, and passes a downed human", () => {
    const downed = (h: TurnHolder): TurnHolder => ({ ...h, hp: 0 });
    expect(autopilotDownTakesTurn(new Set(["pm-tam"]))(downed(tam))).toBe(true);
    expect(autopilotDownTakesTurn(new Set(["pm-tam"]))(downed(pip))).toBe(false);
    expect(autopilotDownTakesTurn(new Set(["pm-tam"]))(hound)).toBe(false);
  });

  it("still stops at a bystander", () => {
    expect(autopilotStopsAt(new Set())({ type: "monster", bystander: true })).toBe(true);
    expect(autopilotStopsAt(new Set())(hound)).toBe(false);
  });
});
