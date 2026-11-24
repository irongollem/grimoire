import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEncounterRunStore } from "@/stores/encounterRun";

const mocks = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.error, info: vi.fn() } }));

import { useTableFightState } from "./useTableFightState";

const FIGHT = { encounterId: "e-1", name: "Goblins" };
const TURN = { yours: true, action: false, bonus: true, reaction: true, words: true };

function start(closed = false) {
  const noteBoard = vi.fn();
  const aftermath = vi.fn().mockResolvedValue(true);
  const state = { closed };
  const api = useTableFightState({ closed: () => state.closed, characterName: () => "Brin", noteBoard, aftermath });
  api.fight.value = FIGHT;
  api.fightTurn.value = TURN;
  return { api, noteBoard, aftermath, state };
}

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe("being in a fight", () => {
  it("is in one while a fight is on and the sitting can be fought in", () => {
    expect(start().api.inFight.value).toBe(true);
  });

  it("is not in one once the sitting was left or is not open, whatever the stored fight says", () => {
    expect(start(true).api.inFight.value).toBe(false);
  });

  it("is not in one with no fight", () => {
    const { api } = start();
    api.fight.value = null;
    expect(api.inFight.value).toBe(false);
  });
});

describe("the composer in a fight (frame 15)", () => {
  it("carries the turn's words and whether it can still pay for a deed", () => {
    expect(start().api.composerFight.value).toEqual({ yours: true, words: true, canAct: true });
  });

  it("cannot act once neither the action nor the bonus action is left", () => {
    const { api } = start();
    api.fightTurn.value = { ...TURN, bonus: false };
    expect(api.composerFight.value?.canAct).toBe(false);
  });

  it("is absent outside a fight, even with a stale turn", () => {
    const { api } = start(true);
    expect(api.composerFight.value).toBeNull();
  });
});

describe("a fight that ends", () => {
  it.each(["foes_out", "you_fell"] as const)("%s: the board ended it, so the Dungeon Master is asked what comes of it", (how) => {
    const { api, noteBoard, aftermath } = start();
    api.onFightOver(how);
    expect(api.fight.value).toBeNull();
    expect(api.fightTurn.value).toBeNull();
    expect(noteBoard).toHaveBeenCalledTimes(1);
    expect(noteBoard).toHaveBeenCalledWith([{ kind: "margin", text: "The fight is over", tone: "end" }], true);
    expect(aftermath).toHaveBeenCalledTimes(1);
  });

  it("a ruling that ended it has already told how, so nothing more is asked", () => {
    const { api, noteBoard, aftermath } = start();
    api.onFightOver("they_flee");
    expect(noteBoard).toHaveBeenCalledWith([{ kind: "margin", text: "The fight is over: they flee", tone: "end" }], true);
    expect(aftermath).not.toHaveBeenCalled();
  });

  it("names the played character when they got away", () => {
    const { api, noteBoard } = start();
    api.onFightOver("you_get_away");
    expect(noteBoard).toHaveBeenCalledWith([expect.objectContaining({ text: "The fight is over: Brin got away" })], true);
  });

  it("a fight lost from under the page is dropped and said", () => {
    const { api, aftermath } = start();
    api.onFightLost();
    expect(api.fight.value).toBeNull();
    expect(api.fightTurn.value).toBeNull();
    expect(mocks.error).toHaveBeenCalledWith("The fight could not be continued here.");
    expect(aftermath).not.toHaveBeenCalled();
  });
});

// A correction can let go of a fight that was never fought (#1021 row 23). Bug caught: the board's store keeping the
// old fight, so running the encounter again showed it; or the turn's budget staying behind and being sent as if a
// fight were still on.
describe("the server letting go of the fight", () => {
  it("drops the fight and its turn, and clears this tab's runner store when it still holds that fight", () => {
    const { api } = start();
    const run = useEncounterRunStore();
    run.encounterId = FIGHT.encounterId;
    api.onFightSet(null);
    expect(api.fight.value).toBeNull();
    expect(api.fightTurn.value).toBeNull();
    expect(run.encounterId).toBeNull();
  });

  // Bug caught: wiping another fight's board because the sitting's fight was let go of.
  it("leaves the runner store alone when it holds a different fight", () => {
    const { api } = start();
    const run = useEncounterRunStore();
    run.encounterId = "e-other";
    api.onFightSet(null);
    expect(run.encounterId).toBe("e-other");
  });

  // Bug caught: a null from the server while no fight was held (a refused start) reading the id of nothing.
  it("takes a null with no fight held without touching the runner store", () => {
    const { api } = start();
    api.fight.value = null;
    const run = useEncounterRunStore();
    run.encounterId = "e-other";
    expect(() => api.onFightSet(null)).not.toThrow();
    expect(run.encounterId).toBe("e-other");
  });

  it("takes a fight the server starts as it is", () => {
    const { api } = start();
    api.onFightSet({ encounterId: "e-2", name: "Rats" });
    expect(api.fight.value).toEqual({ encounterId: "e-2", name: "Rats" });
    expect(api.fightTurn.value).toEqual(TURN);
  });
});
