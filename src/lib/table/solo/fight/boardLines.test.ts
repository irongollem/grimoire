import { describe, expect, it } from "vitest";
import type { ResolvedAction, TurnTaken } from "@/rules/fight/fightState";
import { linesOfAttacks, linesOfCreatureTurn } from "./boardLines";

const names: Record<string, string> = { orc: "Orc", me: "Mira", wolf: "Wolf" };
const nameOf = (id: string) => names[id];

function turn(extra: Partial<TurnTaken> = {}): TurnTaken {
  return { instanceId: "orc", optionId: "o", kind: "attack", summary: "s", reason: "r", picked: "rules", ...extra } as TurnTaken;
}
function attack(extra: Record<string, unknown> = {}): ResolvedAction {
  return {
    kind: "attack", attackerId: "orc", targetId: "me", action: "Greataxe", natural: 14, total: 19, targetAc: 16,
    coverAc: 0, cover: "none", mode: "normal", hit: true, critical: false, fumble: false,
    damage: [{ type: "slashing", rolled: 9, applied: 9, defense: "none" }], damageTotal: 9, dying: "none", save: null,
    ...extra,
  } as unknown as ResolvedAction;
}
function run(over: Partial<Parameters<typeof linesOfCreatureTurn>[0]> = {}) {
  return linesOfCreatureTurn({
    turn: turn(), outcomes: [], nameOf, feetMoved: 0, playedInstanceId: "me", playedHp: { hp: 11, maxHp: 30 }, ...over,
  });
}

describe("linesOfCreatureTurn", () => {
  it("writes a move only when the creature moved", () => {
    // Bug caught: a "moves 0 feet" line, or no line for a real move.
    expect(run({ feetMoved: 30 })[0]).toEqual({ kind: "margin", text: "Orc moves 30 feet" });
    expect(run({ feetMoved: 0, outcomes: [attack()] }).some((l) => l.kind === "margin" && l.text.includes("moves"))).toBe(false);
  });

  it("writes a roll card whose die is the total and whose detail splits the natural die from the bonus", () => {
    // Bug caught: die showing the natural roll, or the bonus computed from the wrong numbers.
    const roll = run({ outcomes: [attack()] })[0];
    expect(roll).toEqual({
      kind: "roll", die: 19, label: "Greataxe against Mira: a hit, 9 slashing", detail: "d20 (14) + 5", critical: false,
    });
  });

  it("omits a zero bonus and writes a negative one with a minus", () => {
    // Bug caught: "+ 0" shown, or "+ -2".
    expect(run({ outcomes: [attack({ natural: 12, total: 12 })] })[0]).toMatchObject({ detail: "d20 (12)" });
    expect(run({ outcomes: [attack({ natural: 12, total: 10 })] })[0]).toMatchObject({ detail: "d20 (12) - 2" });
  });

  it("calls a miss a miss with no damage and no harm line", () => {
    // Bug caught: a miss reporting damage, or the harm line appearing without a hit.
    const lines = run({ outcomes: [attack({ hit: false, damage: [], damageTotal: 0 })] });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ label: "Greataxe against Mira: a miss" });
  });

  it("says critical hit for a critical and flags the card", () => {
    // Bug caught: a critical written as an ordinary hit.
    expect(run({ outcomes: [attack({ critical: true })] })[0]).toMatchObject({
      label: "Greataxe against Mira: a critical hit, 9 slashing", critical: true,
    });
  });

  it("joins several damage parts with the applied amounts, not the rolled ones", () => {
    // Bug caught: rolled damage shown where resistance halved it.
    const damage = [
      { type: "piercing", rolled: 12, applied: 6, defense: "resistance" },
      { type: "fire", rolled: 2, applied: 2, defense: "none" },
    ];
    expect(run({ outcomes: [attack({ damage, damageTotal: 8 })] })[0]).toMatchObject({
      label: "Greataxe against Mira: a hit, 6 piercing and 2 fire",
    });
  });

  it("adds the harm line only when the played character was hit", () => {
    // Bug caught: the harm line for a hit on someone else, or for a miss.
    const onMe = run({ outcomes: [attack()] });
    expect(onMe[1]).toEqual({ kind: "margin", tone: "harm", text: "Mira is at 11 of 30 hit points" });
    const onWolf = run({ outcomes: [attack({ targetId: "wolf" })] });
    expect(onWolf).toHaveLength(1);
  });

  it("never carries a foe's hit points or the target's armour class", () => {
    // Bug caught: leaking AC (16) into a label or detail.
    const text = JSON.stringify(run({ outcomes: [attack({ targetId: "wolf" })] }));
    expect(text).not.toContain("16");
    expect(text).not.toContain("targetAc");
  });

  it("says a creature that left the map flees", () => {
    // Bug caught: a creature vanishing from the story without a word.
    expect(run({ turn: turn({ leftTheMap: true }), feetMoved: 20 }).map((l) => l.kind === "margin" && l.text)).toEqual([
      "Orc moves 20 feet", "Orc flees the fight",
    ]);
  });

  it("carries the server's Hide or Search outcome as a line, and no hold-your-ground line beside it", () => {
    // Bug caught: a foe that hid or found the player passing as "holds its ground", the story never saying it vanished.
    expect(run({ turn: turn({ kind: "hide", outcome: "The kobold hides." }) })).toEqual([{ kind: "margin", text: "The kobold hides." }]);
  });

  it("gives one fixed line for a turn with no move and no outcome", () => {
    // Bug caught: an empty turn producing no lines.
    expect(run()).toEqual([{ kind: "margin", text: "Orc holds its ground" }]);
  });
});

describe("opportunity attacks in the story", () => {
  // Bug caught: a blow struck by someone else during a creature's turn told as that creature's own attack ("Bite
  // against Wolf" during the wolf's turn), so the player cannot tell who struck.
  it("names whose opportunity attack it was when the striker is not the creature whose turn it is", () => {
    const lines = run({ turn: turn({ instanceId: "wolf", kind: "move" }), outcomes: [attack({ attackerId: "orc", targetId: "wolf", action: "Greataxe" })] });
    expect(lines.some((l) => l.kind === "roll" && l.label.startsWith("Orc's opportunity attack (Greataxe) against Wolf"))).toBe(true);
  });

  // Bug caught: a creature's own attack on its own turn mislabelled as an opportunity attack.
  it("leaves a creature's own attack on its own turn as it was", () => {
    const lines = run({ outcomes: [attack()] });
    expect(lines.some((l) => l.kind === "roll" && l.label.startsWith("Greataxe against Mira"))).toBe(true);
  });

  // Bug caught: a strike on the player as they walk away written with no word of whose it was, or without what
  // it left them on.
  it("tells a strike on the played character as they walk away, and where it leaves them", () => {
    const lines = linesOfAttacks([attack()], { nameOf, playedInstanceId: "me", playedHp: { hp: 11, maxHp: 30 }, turnOf: null });
    expect(lines[0]).toMatchObject({ kind: "roll", label: "Orc's opportunity attack (Greataxe) against Mira: a hit, 9 slashing" });
    expect(lines[1]).toMatchObject({ kind: "margin", tone: "harm", text: "Mira is at 11 of 30 hit points" });
  });
});

describe("advantage and disadvantage in the story", () => {
  // Bug caught (seen in play): a dodging character was attacked at disadvantage and the line showed one die, so
  // the Dodge looked as if it had done nothing.
  it("says when a creature's attack was rolled with disadvantage or advantage, and nothing on a plain roll", () => {
    const dis = run({ outcomes: [attack({ mode: "disadvantage" })] });
    expect(dis.find((l) => l.kind === "roll")).toMatchObject({ detail: "d20 (14) + 5, with disadvantage" });
    const plain = run({ outcomes: [attack()] });
    expect(plain.find((l) => l.kind === "roll")).toMatchObject({ detail: "d20 (14) + 5" });
  });

  describe("a downed ally's death save", () => {
    const save = (status: "dying" | "stable" | "dead" | "up", d20 = 12) =>
      run({ turn: turn({ kind: "death_save", deathSave: { d20, label: "a failure", status } }), nameOf: (id) => (id === "orc" ? "Tam" : id) });
    // Bug caught: the save rolled by the server never reaching the story.
    it("reads as a roll, and a dying save adds nothing more", () => {
      expect(save("dying")).toEqual([{ kind: "roll", die: 12, label: "Tam's death save: a failure", detail: "d20 (12)", critical: false }]);
    });
    // Bug caught: a death passing in silence.
    it("says when they die", () => {
      expect(save("dead")[1]).toEqual({ kind: "margin", text: "Tam dies", tone: "end" });
    });
    it("says when they are stable", () => {
      expect(save("stable")[1]).toEqual({ kind: "margin", text: "Tam is stable, and out of the fight", tone: "end" });
    });
    // Bug caught: a natural 20 not saying they are back up (and not marked critical).
    it("says when they are back up", () => {
      const out = save("up", 20);
      expect(out[0]).toMatchObject({ critical: true });
      expect(out[1]).toEqual({ kind: "margin", text: "Tam is back on their feet at 1 hit point" });
    });
    // Bug caught: a save followed by a "moves" or "holds its ground" line, as if it were an ordinary turn.
    it("is only the save, whatever else the turn carries", () => {
      expect(save("dying").some((l) => l.kind === "margin")).toBe(false);
      const moved = run({ feetMoved: 30, turn: turn({ kind: "death_save", deathSave: { d20: 5, label: "a failure", status: "dying" } }) });
      expect(moved).toHaveLength(1);
    });
  });
});
