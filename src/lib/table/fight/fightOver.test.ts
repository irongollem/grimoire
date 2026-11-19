import { describe, expect, it } from "vitest";
import type { RunCombatant } from "@/types/encounter.types";
import { hasSomeoneToFight, fightStanding } from "./fightOver";

const factions = [
  { id: "players", hostile_to: ["enemy"] },
  { id: "enemy", hostile_to: [] },
  { id: "ally", hostile_to: [] },
];
function c(id: string, faction: string, hp: number): RunCombatant {
  return { instance_id: id, name: id, faction_id: faction, hp, max_hp: 20, type: "monster" } as RunCombatant;
}

describe("fightStanding", () => {
  it("is ongoing while a hostile creature has hit points left", () => {
    // Bug caught: ending the fight with a foe still standing.
    expect(fightStanding([c("me", "players", 5), c("orc", "enemy", 1)], factions, "me")).toBe("ongoing");
  });

  it("is foes_out when every foe is at 0, even with the downed foe still on the roster", () => {
    // Bug caught: counting roster presence instead of hit points.
    expect(fightStanding([c("me", "players", 5), c("orc", "enemy", 0)], factions, "me")).toBe("foes_out");
  });

  it("is foes_out when the foe that fled is gone from the list", () => {
    // Bug caught: requiring at least one foe to be present.
    expect(fightStanding([c("me", "players", 5)], factions, "me")).toBe("foes_out");
  });

  it("is not ended by a living ally or a neutral creature", () => {
    // Bug caught: counting non-hostile creatures as foes (the fight would never end).
    expect(fightStanding([c("me", "players", 5), c("friend", "ally", 9)], factions, "me")).toBe("foes_out");
  });

  it("reads hostility declared only on the foe's side", () => {
    // Bug caught: checking only the played faction's hostile_to.
    const oneWay = [{ id: "players", hostile_to: [] }, { id: "enemy", hostile_to: ["players"] }];
    expect(fightStanding([c("me", "players", 5), c("orc", "enemy", 3)], oneWay, "me")).toBe("ongoing");
  });

  it("is you_are_down at 0 hit points, and not at 1", () => {
    // Bug caught: <= 0 written as < 0, or the player's hit points never checked.
    expect(fightStanding([c("me", "players", 0), c("orc", "enemy", 3)], factions, "me")).toBe("you_are_down");
    expect(fightStanding([c("me", "players", 1), c("orc", "enemy", 3)], factions, "me")).toBe("ongoing");
  });

  it("is ongoing when the played character is not in the list yet", () => {
    // Bug caught: an unread (empty) roster ending the fight on arrival.
    expect(fightStanding([], factions, "me")).toBe("ongoing");
    expect(fightStanding([c("orc", "enemy", 3)], factions, "me")).toBe("ongoing");
  });
});

describe("hasSomeoneToFight", () => {
  const cat = { instance_id: "cat", faction_id: "enemy" };
  // Bug caught (seen in play): with the played character down, each creature's turn was sent to the server, refused,
  // and written into the story as "has no turn to take", once per creature, every round.
  it("is false when every opponent is down, and true while one of them stands", () => {
    expect(hasSomeoneToFight(cat, [{ ...cat, hp: 22 }, { instance_id: "me", faction_id: "players", hp: 0 }, { instance_id: "cat2", faction_id: "enemy", hp: 9 }], factions)).toBe(false);
    expect(hasSomeoneToFight(cat, [{ ...cat, hp: 22 }, { instance_id: "me", faction_id: "players", hp: 0 }, { instance_id: "folio", faction_id: "players", hp: 4 }], factions)).toBe(true);
    // Someone on the Ally side is standing, and is no foe of the Players' foe unless the factions say so.
    expect(hasSomeoneToFight({ instance_id: "me", faction_id: "players" }, [{ instance_id: "friend", faction_id: "ally", hp: 9 }], factions)).toBe(false);
  });
});
