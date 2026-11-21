/** Hiding and finding in a fight (#1021 row 13). Every expected value is worked out from the rule in the comment above it. */
import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../types/encounter.types.ts";
import { creature, mapOf } from "./terrain/options/turnOptionsTestKit.ts";
import { aimableHostiles, hideResult, searchable, watchersOf, SEARCH_RANGE_FEET } from "./hiding.ts";
import { hiddenCondition } from "./stances.ts";

const hidden = (id: string, x: number, y = 0, stealth = 15): RunCombatant => creature(id, id, "p", x, y, { conditions: [hiddenCondition(stealth)] });
const plain = (id: string, x: number, y = 0): RunCombatant => creature(id, id, "p", x, y);

describe("aimableHostiles", () => {
  // PHB 2014 ch. 9 "Unseen Attackers and Targets": where a hidden creature is, is a guess. Bug: the rules play aims at the hidden player
  // as if it stood in plain view.
  it("leaves out a hostile that holds Hidden and keeps the rest", () => {
    expect(aimableHostiles([hidden("gloom", 3), plain("fresco", 2)]).map((c) => c.instance_id)).toEqual(["fresco"]);
  });
});

describe("searchable", () => {
  const mover = creature("ogre", "Ogre", "m", 0, 0);

  // A search reaches 60 ft (12 squares): a Medium creature at x = 12 is 11 squares of gap (edge to edge) = 55 ft, and one at x = 14 is 13 = 65 ft off.
  // Bug: a search that finds a creature across the whole map, or one that stops short of its range.
  it("reaches a hidden hostile within 60 feet and not one beyond", () => {
    expect(SEARCH_RANGE_FEET).toBe(60);
    expect(searchable(mover, [hidden("near", 12), hidden("far", 14)]).map((c) => c.instance_id)).toEqual(["near"]);
  });

  // Bug: a search "finds" a creature that is in plain view, and is offered with nothing hidden.
  it("counts only the hostiles that hold Hidden", () => {
    expect(searchable(mover, [plain("fresco", 1)])).toEqual([]);
  });

  it("counts a hidden hostile whose distance is not known", () => {
    expect(searchable(mover, [{ ...hidden("lost", 1), position: null }]).map((c) => c.instance_id)).toEqual(["lost"]);
  });
});

describe("watchersOf", () => {
  const hider = creature("ogre", "Ogre", "m", 0, 0);
  const wall = mapOf([[[2, -50], [2, 50]]]);

  // PHB 2014 ch. 7 "Passive Perception": only a creature that could see the hider can notice it. A foe behind a full wall has total
  // cover from it and does not watch; one in the open does. Bug: every foe on the map notices a hider it cannot see.
  it("counts a hostile with a line to the hider and not one behind total cover", () => {
    const behind = plain("behind", 4);
    const open = plain("open", -4);
    expect(watchersOf(hider, [behind, open], [], wall).map((c) => c.instance_id)).toEqual(["open"]);
  });

  // An unconscious or paralysed creature notices nothing; a hidden one is not looking at anyone either.
  it("leaves out a hostile that is Incapacitated or itself hidden", () => {
    const asleep = creature("asleep", "Asleep", "p", -4, 0, { conditions: [{ name: "Unconscious" }] as RunCombatant["conditions"] });
    expect(watchersOf(hider, [asleep, hidden("gloom", -5)], [], mapOf())).toEqual([]);
  });
});

describe("hideResult", () => {
  // SRD 5.2 "Hide": DC 15. Total 15 hides, 14 does not. Bug: an off-by-one at the DC (a total of 15 failing, or 14 passing).
  it("2024: hides at the DC and not one below, whoever is watching", () => {
    expect(hideResult("Kobold", 15, "2024", [{ name: "Fresco", passive: 25 }]).hidden).toBe(true);
    const failed = hideResult("Kobold", 14, "2024", []);
    expect(failed.hidden).toBe(false);
    expect(failed.outcome).toBe("Kobold tries to hide but fails (Stealth 14, DC 15).");
  });

  // PHB 2014 ch. 7: a watcher whose passive Perception is at least the total notices. Passive 15 against 15 notices; against 16 it does not.
  // Bug: the comparison is strict, so a tie hides the creature from a watcher who sees it as well as it hid.
  it("2014: a watcher at passive Perception 15 notices a total of 15 and not a total of 16", () => {
    const watchers = [{ name: "Fresco", passive: 15 }];
    const noticed = hideResult("Kobold", 15, "2014", watchers);
    expect(noticed).toEqual({ hidden: false, outcome: "Kobold tries to hide but Fresco notices it (Stealth 15)." });
    expect(hideResult("Kobold", 16, "2014", watchers)).toEqual({ hidden: true, outcome: "Kobold hides." });
  });

  // With no one watching in 2014 the hider is hidden whatever it rolled.
  it("2014: with no watcher the hider is hidden", () => {
    expect(hideResult("Kobold", 3, "2014", []).hidden).toBe(true);
  });
});
