import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { asThePlayerSees } from "./foeView";

const factions = [
  { id: "players", hostile_to: ["enemy"] },
  { id: "enemy", hostile_to: ["players"] },
  { id: "ally", hostile_to: [] },
  { id: "one_way", hostile_to: ["players"] },
];

function c(id: string, faction: string, hp: number, maxHp: number, extra: Partial<RunCombatant> = {}): RunCombatant {
  return { instance_id: id, name: id, faction_id: faction, hp, max_hp: maxHp, type: "monster", ...extra } as RunCombatant;
}

const me = c("me", "players", 12, 30, { type: "player" });

describe("asThePlayerSees", () => {
  it("keeps the played character's numbers and gives everyone else a word", () => {
    // Bug caught: a foe's hit points leaking to the player, or the player's own turned into a word.
    const out = asThePlayerSees([me, c("orc", "enemy", 15, 30)], "me", factions);
    expect(out[0].health).toEqual({ kind: "numbers", hp: 12, maxHp: 30 });
    expect(out[1].health).toEqual({ kind: "word", word: "Wounded" });
    expect(JSON.stringify(out[1])).not.toContain("15");
  });

  it("leaves a hidden creature out and keeps the order of the rest", () => {
    // Bug caught: a hidden foe appearing in the player's list.
    const out = asThePlayerSees(
      [c("a", "enemy", 5, 10), me, c("lurker", "enemy", 5, 10, { reveal_state: "hidden" }), c("b", "enemy", 5, 10)],
      "me",
      factions,
    );
    expect(out.map((s) => s.instanceId)).toEqual(["a", "me", "b"]);
  });

  it("names an unseen creature ??? and withholds its health word", () => {
    // Bug caught: an unseen foe revealing its name or how hurt it is.
    const out = asThePlayerSees([me, c("wraith", "enemy", 1, 40, { reveal_state: "unseen" })], "me", factions);
    expect(out[1].name).toBe("???");
    expect(out[1].health).toEqual({ kind: "word", word: "Unknown" });
  });

  it("shows a revealed creature by its name", () => {
    // Bug caught: the name hidden for every monster rather than only unseen ones.
    const out = asThePlayerSees([me, c("Orc", "enemy", 10, 10, { reveal_state: "revealed" })], "me", factions);
    expect(out[1].name).toBe("Orc");
  });

  it("marks sides: you, a foe hostile in either direction, and everyone else", () => {
    // Bug caught: hostility read in one direction only, or an ally marked as a foe.
    const out = asThePlayerSees(
      [me, c("orc", "enemy", 5, 10), c("friend", "ally", 5, 10), c("cultist", "one_way", 5, 10)],
      "me",
      factions,
    );
    expect(out.map((s) => s.side)).toEqual(["you", "foe", "other", "foe"]);
    expect(out[0].isYou).toBe(true);
    expect(out[1].isYou).toBe(false);
  });

  it("does not call a creature of the player's own faction a foe", () => {
    // Bug caught: same-faction creatures counted as hostile.
    const out = asThePlayerSees([me, c("buddy", "players", 5, 10)], "me", factions);
    expect(out[1].side).toBe("other");
  });

  // Bug caught: an ally the AI plays shown as a word (the party knows its own), or a foe shown with numbers.
  it("shows an ally's numbers and marks it, but a foe stays a word", () => {
    const ally = c("ally1", "players", 9, 20, { type: "player", party_member_id: "m2" });
    const out = asThePlayerSees([me, ally, c("orc", "enemy", 15, 30, { type: "player", party_member_id: "m3" })], "me", factions);
    expect(out[1].health).toEqual({ kind: "numbers", hp: 9, maxHp: 20 });
    expect(out[1].ally).toBe(true);
    expect(out[2].health.kind).toBe("word");
    expect(out[2].ally).toBeUndefined();
    expect(out[0].ally).toBeUndefined();
  });

  // Bug caught: a player-type with no party member (a stand-in) treated as an ally.
  it("does not call a player-type without a party member an ally", () => {
    const out = asThePlayerSees([me, c("x", "players", 9, 20, { type: "player" })], "me", factions);
    expect(out[1].ally).toBeUndefined();
    expect(out[1].health.kind).toBe("word");
  });
});
