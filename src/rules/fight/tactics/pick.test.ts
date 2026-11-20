import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { MonsterStatBlock } from "../../../types/monster.types.ts";
import { emptyDefenses, type StatBlockEntry } from "../../../types/statBlock.types.ts";
import type { TurnOption, TurnOptionExposure, TurnOptionKind } from "../terrain/options/types.ts";
import { gateOptions, isBroken, pickTurn, type PickContext } from "./pick.ts";
import { type MoraleRule, tacticalProfile } from "./profile.ts";
// oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field (#1203), not a promise
const morale = (breaksAt: number, then: MoraleRule["then"]): MoraleRule => ({ breaksAt, then });


const block = (over: Partial<MonsterStatBlock> = {}): MonsterStatBlock => ({
  armor_class: 12, hit_points: "2d8", speed: "30 ft.", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, challenge_rating: "1", defenses: emptyDefenses(), ...over,
});
/** Intelligence 10 is the trained tier: it is offered everything but hide, and avoids provoking. */
const prof = (over: Partial<MonsterStatBlock> = {}) => tacticalProfile(block(over), "humanoid");

function who(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id[0].toUpperCase() + id.slice(1), faction_id: id === "ogre" ? "m" : "p", initiative: null, hp: 20, max_hp: 20, ac: "12",
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 0, y: 0 }, size: "medium", ...over,
  };
}

interface AtkSpec { target: string; action?: string; expected?: number | null; hit?: number | null; distance?: number | null; provokes?: number; exposure?: TurnOptionExposure[]; steps?: boolean }
function atk(spec: AtkSpec): TurnOption {
  const action = spec.action ?? "Greatclub";
  return {
    id: `attack:actions:${action}:${spec.target}`, kind: "attack", targetId: spec.target, destination: null, path: null, feet: null,
    attack: {
      list: "actions", action, steps: spec.steps ? [{ action: "Greatclub", count: 2 }] : null, distanceFeet: spec.distance === undefined ? 5 : spec.distance,
      cover: "none", longRange: false, closeCombat: false, hitChance: spec.hit === undefined ? null : spec.hit, expectedDamage: spec.expected === undefined ? null : spec.expected,
    },
    distanceFeet: null,
    provokes: Array.from({ length: spec.provokes ?? 0 }, (_, i) => ({ enemyId: `e${i}`, step: 0 })),
    exposure: spec.exposure ?? [], summary: `attack ${spec.target}`,
  };
}
function other(kind: Exclude<TurnOptionKind, "attack">, target: string | null = null, distance: number | null = null): TurnOption {
  return { id: target === null ? kind : `${kind}:${target}`, kind, targetId: target, destination: null, path: null, feet: null, attack: null, distanceFeet: distance, provokes: [], exposure: [], summary: kind };
}

const ctxOf = (combatants: RunCombatant[], ac: Record<string, number | null> = {}): PickContext => ({
  combatants, moverId: "ogre", armorClassOf: (c) => (c.instance_id in ac ? ac[c.instance_id] : null),
});
const OGRE = who("ogre");
const FRESCO = who("fresco");
const CHICORY = who("chicory");
const BASIC = ctxOf([OGRE, FRESCO, CHICORY]);

describe("isBroken: rule morale-break", () => {
  const p = prof(); // humanoid, Int 10: breaks at 0.25 and flees
  it("breaks at exactly the threshold (5 of 20 is 0.25) and not one hit point above (6 of 20 is 0.30)", () => {
    expect(isBroken(p, who("ogre", { hp: 5 }))).toBe(true);
    expect(isBroken(p, who("ogre", { hp: 6 }))).toBe(false);
  });
  it("never breaks for a creature whose threshold is 0, however hurt (down to 0 hit points, where hp / max is 0 and 0 <= 0)", () => {
    expect(isBroken(prof({ int: 2 }), who("ogre", { hp: 1 }))).toBe(false);
    expect(isBroken(prof({ int: 2 }), who("ogre", { hp: 0 }))).toBe(false);
  });
});

describe("gateOptions", () => {
  const all = [atk({ target: "fresco" }), other("dash", "chicory"), other("dodge"), other("disengage"), other("hide"), other("flee")];

  it("drops the kinds the tier is not offered: Intelligence 3 gets neither dodge, disengage nor hide", () => {
    expect(gateOptions(all, prof({ int: 3 }), OGRE).map((o) => o.kind)).toEqual(["attack", "dash", "flee"]);
  });

  it("keeps hide for a tactical creature and drops it for a trained one", () => {
    expect(gateOptions(all, prof({ int: 12 }), OGRE).map((o) => o.kind)).toContain("hide");
    expect(gateOptions(all, prof({ int: 11 }), OGRE).map((o) => o.kind)).not.toContain("hide");
  });

  it("leaves a creature that has not broken with every option it is offered", () => {
    expect(gateOptions(all, prof(), who("ogre", { hp: 6 })).map((o) => o.kind)).toEqual(["attack", "dash", "dodge", "disengage", "flee"]);
  });

  it("keeps only flee, disengage and dodge once a fleeing creature breaks", () => {
    expect(gateOptions(all, prof(), who("ogre", { hp: 5 })).map((o) => o.kind)).toEqual(["dodge", "disengage", "flee"]);
  });

  it("keeps only what the broken creature is offered of those: instinct has no dodge or disengage to keep", () => {
    expect(gateOptions(all, prof({ int: 3, tactics: { morale: morale(0.25, "flee") } }), who("ogre", { hp: 5 })).map((o) => o.kind)).toEqual(["flee"]);
  });

  it("leaves the list as it was when a broken creature has none of the retreats", () => {
    const noRetreat = [atk({ target: "fresco" }), other("dash", "chicory")];
    expect(gateOptions(noRetreat, prof(), who("ogre", { hp: 5 })).map((o) => o.kind)).toEqual(["attack", "dash"]);
  });

  it("gives a surrendering creature that has broken one synthetic Surrender with no movement", () => {
    const yields = prof({ tactics: { morale: morale(0.25, "surrender") } });
    const gated = gateOptions(all, yields, who("ogre", { hp: 5 }));
    expect(gated).toHaveLength(1);
    expect(gated[0]).toMatchObject({ id: "surrender", kind: "surrender", destination: null, path: null, feet: null, provokes: [], summary: "Surrender: drops its guard and yields" });
    // One hit point above the threshold it still fights.
    expect(gateOptions(all, yields, who("ogre", { hp: 6 })).map((o) => o.kind)).not.toContain("surrender");
  });

  it("does not make a surrender out of nothing: a creature with no turn at all keeps none", () => {
    expect(gateOptions([], prof({ tactics: { morale: morale(0.25, "surrender") } }), who("ogre", { hp: 5 }))).toEqual([]);
  });

  it("changes nothing for a fight_on creature that has broken", () => {
    const stubborn = prof({ tactics: { morale: morale(0.25, "fight_on") } });
    expect(gateOptions(all, stubborn, who("ogre", { hp: 1 })).map((o) => o.kind)).toEqual(["attack", "dash", "dodge", "disengage", "flee"]);
  });
});

describe("pickTurn: the edges", () => {
  it("gives null for an empty list and nothing else", () => {
    expect(pickTurn([], prof(), BASIC)).toBeNull();
  });

  it("takes a single option and gives a reason that quotes it", () => {
    const pick = pickTurn([other("dodge")], prof(), BASIC);
    expect(pick).toEqual({ optionId: "dodge", reason: "Takes the only turn on offer: dodge." });
  });
});

describe("pickTurn: broken morale", () => {
  const hurt = ctxOf([who("ogre", { hp: 6, max_hp: 30 }), FRESCO]);
  const attacks = [atk({ target: "fresco", expected: 9, hit: 0.65 })];

  it("flees when it can, naming the numbers: at 6 of 30 hit points it breaks", () => {
    // 6 / 30 = 0.20 <= 0.25.
    const pick = pickTurn([...attacks, other("dodge"), other("disengage"), other("flee")], prof(), hurt);
    expect(pick).toEqual({ optionId: "flee", reason: "Falls back: at 6 of 30 hit points it breaks and flees." });
  });
  it("says where a flee that leaves the map leaves it: by the named gate, over the edge, and nothing of a flee that stays", () => {
    // Bug it fails on: a reason that never names the way out, or names one for a flee that only runs toward it.
    const flee = (over: Partial<TurnOption>): TurnOption => ({ ...other("flee"), ...over });
    const reason = (o: TurnOption) => pickTurn([...attacks, o], prof(), hurt)?.reason;
    expect(reason(flee({ leavesMap: true, exitKind: "entrance", exitLabel: "East gate" }))).toBe('Falls back: at 6 of 30 hit points it breaks and flees, leaving the map through "East gate".');
    expect(reason(flee({ leavesMap: true, exitKind: "edge", exitLabel: null }))).toBe("Falls back: at 6 of 30 hit points it breaks and flees, leaving the map over the edge of the map.");
    expect(reason(flee({ leavesMap: false, exitKind: null, exitLabel: null }))).toBe("Falls back: at 6 of 30 hit points it breaks and flees.");
  });
  it("disengages when there is no flee, and dodges when there is neither", () => {
    expect(pickTurn([...attacks, other("dodge"), other("disengage")], prof(), hurt)?.optionId).toBe("disengage");
    expect(pickTurn([...attacks, other("dodge")], prof(), hurt)?.optionId).toBe("dodge");
  });
  it("keeps attacking when there is no retreat to take", () => {
    expect(pickTurn([...attacks, other("dash", "chicory")], prof(), hurt)?.optionId).toBe("attack:actions:Greatclub:fresco");
  });
  it("keeps attacking when it has not broken: 8 of 30 is 0.267, above 0.25", () => {
    const ctx = ctxOf([who("ogre", { hp: 8, max_hp: 30 }), FRESCO]);
    expect(pickTurn([...attacks, other("flee")], prof(), ctx)?.optionId).toBe("attack:actions:Greatclub:fresco");
  });
  it("keeps attacking when the creature that broke fights on", () => {
    const stubborn = prof({ tactics: { morale: morale(0.25, "fight_on") } });
    expect(pickTurn([...attacks, other("flee")], stubborn, hurt)?.optionId).toBe("attack:actions:Greatclub:fresco");
  });
  it("yields when its broken morale is surrender", () => {
    const yields = prof({ tactics: { morale: morale(0.25, "surrender") } });
    const gated = gateOptions([...attacks, other("flee")], yields, who("ogre", { hp: 6, max_hp: 30 }));
    expect(pickTurn(gated, yields, hurt)).toEqual({ optionId: "surrender", reason: "Yields: at 6 of 30 hit points it breaks and surrenders." });
  });
});

describe("pickTurn: rule target", () => {
  const opts = (...targets: string[]) => targets.map((t) => atk({ target: t, expected: 5, distance: t === "fresco" ? 30 : 5 }));

  it("nearest picks the smaller distance (5 ft against 30 ft), not the first listed", () => {
    const pick = pickTurn(opts("fresco", "chicory"), prof({ tactics: { targets: "nearest" } }), BASIC);
    expect(pick?.optionId).toBe("attack:actions:Greatclub:chicory");
    expect(pick?.reason).toBe("Attacks Chicory, the nearest enemy, with Greatclub.");
  });

  it("nearest ranks an unmeasured distance last", () => {
    const o = [atk({ target: "fresco", distance: null }), atk({ target: "chicory", distance: 60 })];
    expect(pickTurn(o, prof({ tactics: { targets: "nearest" } }), BASIC)?.optionId).toBe("attack:actions:Greatclub:chicory");
  });

  it("most_wounded picks the lowest share of hit points: 5/20 = 0.25 against 12/20 = 0.60", () => {
    const ctx = ctxOf([OGRE, who("fresco", { hp: 12 }), who("chicory", { hp: 5 })]);
    expect(pickTurn(opts("fresco", "chicory"), prof({ tactics: { targets: "most_wounded" } }), ctx)?.optionId).toBe("attack:actions:Greatclub:chicory");
  });

  it("most_wounded compares shares, not hit points: 9/10 is healthier than 15/40 though it has fewer points", () => {
    const ctx = ctxOf([OGRE, who("fresco", { hp: 9, max_hp: 10 }), who("chicory", { hp: 15, max_hp: 40 })]);
    expect(pickTurn(opts("fresco", "chicory"), prof({ tactics: { targets: "most_wounded" } }), ctx)?.optionId).toBe("attack:actions:Greatclub:chicory");
  });

  it("spellcasters_first picks the one concentrating even when the other is more wounded", () => {
    const concentrating = { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] };
    const ctx = ctxOf([OGRE, who("fresco", { hp: 19, concentration: concentrating }), who("chicory", { hp: 2 })]);
    const pick = pickTurn(opts("fresco", "chicory"), prof({ tactics: { targets: "spellcasters_first" } }), ctx);
    expect(pick?.optionId).toBe("attack:actions:Greatclub:fresco");
    expect(pick?.reason).toContain("an enemy holding a spell");
  });

  it("spellcasters_first falls back to the most wounded when nobody concentrates, and treats a cleared concentration (null) as none", () => {
    const ctx = ctxOf([OGRE, who("fresco", { hp: 19, concentration: null }), who("chicory", { hp: 2 })]);
    expect(pickTurn(opts("fresco", "chicory"), prof({ tactics: { targets: "spellcasters_first" } }), ctx)?.optionId).toBe("attack:actions:Greatclub:chicory");
  });

  it("lowest_armor picks AC 11 over AC 16, and an unknown armor class last", () => {
    const o = opts("fresco", "chicory");
    const lowest = prof({ tactics: { targets: "lowest_armor" } });
    expect(pickTurn(o, lowest, ctxOf([OGRE, FRESCO, CHICORY], { fresco: 16, chicory: 11 }))?.optionId).toBe("attack:actions:Greatclub:chicory");
    expect(pickTurn(o, lowest, ctxOf([OGRE, FRESCO, CHICORY], { fresco: null, chicory: 20 }))?.optionId).toBe("attack:actions:Greatclub:chicory");
  });

  it("lowest_armor counts Shield of Faith: printed AC 14 + 2 = 16 loses to printed AC 15 (fails if the target's boon is not read)", () => {
    const shielded = who("fresco", { conditions: [{ name: "Shield of Faith", grants: { ac: 2 } }] });
    const lowest = prof({ tactics: { targets: "lowest_armor" } });
    expect(pickTurn(opts("fresco", "chicory"), lowest, ctxOf([OGRE, shielded, CHICORY], { fresco: 14, chicory: 15 }))?.optionId).toBe("attack:actions:Greatclub:chicory");
  });

  it("breaks a tie by the order of the fight: two equally near targets give the one listed first among combatants", () => {
    const o = [atk({ target: "chicory", distance: 5 }), atk({ target: "fresco", distance: 5 })];
    expect(pickTurn(o, prof({ tactics: { targets: "nearest" } }), BASIC)?.optionId).toBe("attack:actions:Greatclub:fresco");
  });

  it("says it is the only enemy in reach when there is just one target", () => {
    expect(pickTurn([atk({ target: "fresco" })], prof(), BASIC)?.reason).toBe("Attacks Fresco, the only enemy it can reach, with Greatclub.");
  });
});

describe("pickTurn: rule attack", () => {
  const profile = prof({ int: 5 }); // simple: nearest, ignores cover, does not mind provoking

  it("takes the highest expected damage against the chosen target and quotes it: 65% to hit for about 9", () => {
    const o = [atk({ target: "fresco", action: "Slam", expected: 4, hit: 0.5 }), atk({ target: "fresco", action: "Greatclub", expected: 8.6, hit: 0.65 })];
    const pick = pickTurn(o, profile, ctxOf([OGRE, FRESCO]));
    expect(pick).toEqual({ optionId: "attack:actions:Greatclub:fresco", reason: "Attacks Fresco, the only enemy it can reach, with Greatclub: 65% to hit for about 9 damage." });
  });

  it("rounds the chance and the damage to the nearest whole number: 65.5% reads 66%, 8.6 reads 9", () => {
    const pick = pickTurn([atk({ target: "fresco", expected: 8.6, hit: 0.655 })], profile, ctxOf([OGRE, FRESCO]));
    expect(pick?.reason).toContain("66% to hit for about 9 damage");
  });

  it("counts unknown damage lowest, so a known 1 beats an unknown", () => {
    const o = [atk({ target: "fresco", action: "Slam", expected: null }), atk({ target: "fresco", action: "Greatclub", expected: 1 })];
    expect(pickTurn(o, profile, ctxOf([OGRE, FRESCO]))?.optionId).toBe("attack:actions:Greatclub:fresco");
  });

  it("with no number known, prefers a Multiattack, then the list order", () => {
    const ctx = ctxOf([OGRE, FRESCO]);
    const withMulti = [atk({ target: "fresco", action: "Slam" }), atk({ target: "fresco", action: "Multiattack", steps: true })];
    expect(pickTurn(withMulti, profile, ctx)?.optionId).toBe("attack:actions:Multiattack:fresco");
    const plain = [atk({ target: "fresco", action: "Slam" }), atk({ target: "fresco", action: "Greatclub" })];
    expect(pickTurn(plain, profile, ctx)?.optionId).toBe("attack:actions:Slam:fresco");
  });

  it("a trained creature takes the option that provokes nothing over a stronger one that does", () => {
    const o = [atk({ target: "fresco", action: "Slam", expected: 5, provokes: 0 }), atk({ target: "fresco", action: "Greatclub", expected: 9, provokes: 1 })];
    expect(pickTurn(o, prof({ int: 8 }), ctxOf([OGRE, FRESCO]))?.optionId).toBe("attack:actions:Slam:fresco");
  });

  it("a simple creature does not mind: the stronger option wins even though it provokes", () => {
    const o = [atk({ target: "fresco", action: "Slam", expected: 5, provokes: 0 }), atk({ target: "fresco", action: "Greatclub", expected: 9, provokes: 1 })];
    expect(pickTurn(o, prof({ int: 7 }), ctxOf([OGRE, FRESCO]))?.optionId).toBe("attack:actions:Greatclub:fresco");
  });

  // RULE provokes, for casts as for attacks: a moved spell option that walks through a threatened square provokes. A trained caster
  // takes the cast that provokes nothing (Fire Bolt, 7) over a stronger one that walks into a reach (Fireball, 23); a simple one does not
  // mind. Bug caught: a cast weighed by its damage alone, so a clever mage walks into an opportunity attack to cast.
  it("fails if a trained caster walks into an opportunity attack to cast when a cast from where it stands is on offer", () => {
    const spellOf = (name: string, expected: number, provokes: number): TurnOption => ({
      id: `spell:${name}:3:fresco`, kind: "spell", targetId: "fresco", destination: provokes > 0 ? { x: 2, y: 0 } : null, path: null, feet: provokes > 0 ? 20 : null,
      attack: null, distanceFeet: null, provokes: Array.from({ length: provokes }, (_, i) => ({ enemyId: `e${i}`, step: 0 })), exposure: [], summary: name,
      spell: { name, castLevel: 3, kind: "save", targetIds: ["fresco"], friendsCaught: [], spends: true, distanceFeet: 30, hitChance: 0.6, expectedDamage: expected },
    });
    const o = [spellOf("Fire Bolt", 7, 0), spellOf("Fireball", 23, 1)];
    expect(pickTurn(o, prof({ int: 8 }), ctxOf([OGRE, FRESCO]))?.optionId).toBe("spell:Fire Bolt:3:fresco");
    expect(pickTurn(o, prof({ int: 7 }), ctxOf([OGRE, FRESCO]))?.optionId).toBe("spell:Fireball:3:fresco");
  });

  it("a trained creature still takes the best of the provoking options when all of them provoke", () => {
    const o = [atk({ target: "fresco", action: "Slam", expected: 5, provokes: 1 }), atk({ target: "fresco", action: "Greatclub", expected: 9, provokes: 1 })];
    expect(pickTurn(o, prof({ int: 8 }), ctxOf([OGRE, FRESCO]))?.optionId).toBe("attack:actions:Greatclub:fresco");
  });

  describe("a creature that fights from cover", () => {
    const bare: TurnOptionExposure[] = [{ enemyId: "fresco", cover: "none" }];
    const covered: TurnOptionExposure[] = [{ enemyId: "fresco", cover: "half" }];
    const tactical = prof({ int: 12 }); // fights_from

    it("takes the covered option when it is within 20% of the best: 8 against 10 is exactly 80%", () => {
      const o = [atk({ target: "fresco", action: "Slam", expected: 8, exposure: covered }), atk({ target: "fresco", action: "Greatclub", expected: 10, exposure: bare })];
      expect(pickTurn(o, tactical, ctxOf([OGRE, FRESCO]))?.optionId).toBe("attack:actions:Slam:fresco");
    });

    it("keeps the best damage when the covered option falls short of 80%: 7.9 against 10", () => {
      const o = [atk({ target: "fresco", action: "Slam", expected: 7.9, exposure: covered }), atk({ target: "fresco", action: "Greatclub", expected: 10, exposure: bare })];
      expect(pickTurn(o, tactical, ctxOf([OGRE, FRESCO]))?.optionId).toBe("attack:actions:Greatclub:fresco");
    });

    it("does not do so for a creature that ignores cover", () => {
      const o = [atk({ target: "fresco", action: "Slam", expected: 8, exposure: covered }), atk({ target: "fresco", action: "Greatclub", expected: 10, exposure: bare })];
      expect(pickTurn(o, prof({ int: 12, tactics: { cover: "ignores" } }), ctxOf([OGRE, FRESCO]))?.optionId).toBe("attack:actions:Greatclub:fresco");
    });
  });
});

describe("pickTurn: with no attack to make", () => {
  it("dashes toward the target its rule chooses, the one with the least distance left", () => {
    const o = [other("dash", "fresco", 40), other("dash", "chicory", 15), other("dodge")];
    const pick = pickTurn(o, prof({ int: 5 }), BASIC);
    expect(pick?.optionId).toBe("dash:chicory");
    expect(pick?.reason).toBe("Dashes toward Chicory, the nearest enemy: nothing it can attack is in reach this turn.");
  });

  it("takes the nearer of two approaches to the same target", () => {
    expect(pickTurn([other("move", "fresco", 20), other("dash", "fresco", 10), other("dodge")], prof({ int: 5 }), BASIC)?.optionId).toBe("dash:fresco");
  });

  it("closes in with a move as well as a dash", () => {
    expect(pickTurn([other("move", "fresco", 10), other("dodge")], prof({ int: 5 }), BASIC)?.optionId).toBe("move:fresco");
  });

  it("an artillery creature with no line to anyone moves to find one, where holding still would last the whole fight", () => {
    // Ranged only, so its role is artillery. No attack option means no square in reach has a line; Dodge is on
    // offer and must not win, or it never fires a shot.
    const bow = { name: "Bow", description: "", structured: { source: "manual" as const, kind: "attack" as const, attack: { delivery: "ranged" as const, bonus: 4, hit: [] } } };
    const o = [other("dash", "fresco", 40), other("dodge")];
    expect(pickTurn(o, prof({ int: 5, actions: [bow] }), BASIC)?.optionId).toBe("dash:fresco");
  });

  it("dodges when there is nobody to close on", () => {
    expect(pickTurn([other("hide"), other("dodge")], prof(), BASIC)?.optionId).toBe("dodge");
  });

  it("takes the first option when it is neither attacking, closing in nor dodging", () => {
    expect(pickTurn([other("hide"), other("flee")], prof(), BASIC)?.optionId).toBe("hide");
  });
});

describe("escape-first: a broken creature with a way out uses it before it runs or yields", () => {
  const entry = (name: string, description = ""): StatBlockEntry => ({ name, description, structured: { kind: "other", source: "manual", review: "unreadable" } });
  // SRD 5.1 night hag, "Etherealness". She yields (hags bargain), and at 20 of 112 she is under a quarter.
  const nightHag = (then: MoraleRule["then"] = "surrender") => prof({ actions: [entry("Etherealness")], tactics: { morale: morale(0.25, then) } });
  const dying = who("ogre", { hp: 20, max_hp: 112 });
  const menu = [atk({ target: "fresco", expected: 5 }), other("flee"), other("dodge")];
  const kinds = (o: TurnOption[]) => o.map((x) => x.kind);

  it("fails if a broken hag that yields is not given Etherealness first, with Surrender behind it", () => {
    const gated = gateOptions(menu, nightHag(), dying);
    expect(kinds(gated)).toEqual(["escape", "surrender"]);
    expect(gated[0]).toMatchObject({ id: "escape", summary: "Etherealness: leaves the fight", escape: { name: "Etherealness", effect: "leaves" } });
  });

  it("fails if a broken creature that flees loses its retreats behind the escape", () => {
    expect(kinds(gateOptions(menu, nightHag("flee"), dying))).toEqual(["escape", "flee", "dodge"]);
  });

  it("fails if the creature takes the surrender or the flee instead of the escape, or the reason is not in the house style", () => {
    const gated = gateOptions(menu, nightHag(), dying);
    expect(pickTurn(gated, nightHag(), ctxOf([dying, FRESCO]))).toEqual({
      optionId: "escape", reason: "Gets away: at 20 of 112 hit points it breaks and uses Etherealness to leave the fight.",
    });
    const passage = prof({ actions: [entry("Invisible Passage")], tactics: { morale: morale(0.25, "flee") } });
    expect(pickTurn(gateOptions(menu, passage, dying), passage, ctxOf([dying, FRESCO]))?.reason)
      .toBe("Gets away: at 20 of 112 hit points it breaks and uses Invisible Passage to go unseen.");
  });

  it("fails if fight_on is offered an escape", () => {
    expect(kinds(gateOptions(menu, nightHag("fight_on"), dying))).not.toContain("escape");
  });

  it("fails if a creature that has not broken is offered an escape (21 of 112 is 0.1875, 29 of 112 is over a quarter)", () => {
    expect(kinds(gateOptions(menu, nightHag(), who("ogre", { hp: 29, max_hp: 112 })))).not.toContain("escape");
  });

  it("fails if a creature with no way out gets one", () => {
    expect(kinds(gateOptions(menu, prof({ tactics: { morale: morale(0.25, "surrender") } }), dying))).toEqual(["surrender"]);
  });

  // The cornered hag: Plane Shift is 2/Day Each and both are spent, so she yields.
  it("fails if a hag whose only way out is spent does not fall back to Surrender", () => {
    const cornered = prof({
      actions: [entry("Spellcasting", "- **2/Day Each:** Plane Shift")], tactics: { morale: morale(0.25, "surrender") },
    });
    const spent = who("ogre", { hp: 20, max_hp: 112, action_uses: { "spell/plane shift": { used: 2 } } });
    const gated = gateOptions(menu, cornered, spent);
    expect(kinds(gated)).toEqual(["surrender"]);
    expect(pickTurn(gated, cornered, ctxOf([spent, FRESCO]))?.optionId).toBe("surrender");
  });

  it("fails if a spent Action does not stop the escape", () => {
    expect(kinds(gateOptions(menu, nightHag(), who("ogre", { hp: 20, max_hp: 112, action_used: true })))).toEqual(["surrender"]);
  });

  // The hag already slipped out of sight: a second Invisible Passage is not on offer, and she does not give up
  // where she hides, she runs like one that flees.
  it("fails if an already Invisible creature is offered a second unseen escape, or a surrender creature then yields", () => {
    const green = prof({ actions: [entry("Invisible Passage")], tactics: { morale: morale(0.25, "surrender") } });
    const hidden = who("ogre", { hp: 20, max_hp: 112, conditions: [{ name: "Invisible" }] });
    const gated = gateOptions(menu, green, hidden);
    expect(kinds(gated)).toEqual(["flee", "dodge"]);
    expect(pickTurn(gated, green, ctxOf([hidden, FRESCO]))?.optionId).toBe("flee");
  });
});

// SRD 5.1 Black Tentacles: "A creature restrained by the tentacles can use its action to make a Strength or Dexterity check
// (its choice) against your spell save DC. On a success, it frees itself." What a creature run by the game does about it is
// RULE break-free-first (app convention).
describe("rule break-free-first", () => {
  const restrained = { name: "Restrained", breakFree: { abilities: ["str" as const, "dex" as const], dc: 14 } };
  const heldOgre = (over: Partial<RunCombatant> = {}) => who("ogre", { conditions: [restrained], ...over });
  const tryFree = (name = "Restrained"): TurnOption => ({ ...other("break_free"), id: `break_free:${name}`, breakFree: { name, ability: "str" } });
  const pick = (options: TurnOption[], int: number, mover: RunCombatant) =>
    pickTurn(gateOptions(options, prof({ int }), mover), prof({ int }), ctxOf([mover, FRESCO, CHICORY]));

  // Bug caught: a held creature with nothing in reach dodges or stands (the option is offered and never chosen).
  it("breaks free when it is held and has no attack it can make from where it stands", () => {
    const mover = heldOgre();
    expect(pick([tryFree(), other("dodge")], 10, mover)?.optionId).toBe("break_free:Restrained");
    expect(pick([tryFree(), other("dodge")], 2, mover)?.optionId).toBe("break_free:Restrained");
  });

  // Bug caught: every held creature breaks free first, so a held brute with a target in reach never swings.
  it("attacks instead when it can and is of a low tier", () => {
    const mover = heldOgre();
    for (const int of [2, 6]) expect(pick([atk({ target: "fresco", expected: 8 }), tryFree()], int, mover)?.optionId).toBe("attack:actions:Greatclub:fresco");
  });

  // Attacks against a Restrained creature have advantage and its own have disadvantage (PHB 2014 appendix A "Restrained").
  // Bug caught: a creature that weighs its turn keeps swinging at disadvantage while held.
  it("breaks free first when it is trained or tactical and Restrained, even with a target in reach", () => {
    const mover = heldOgre();
    for (const int of [10, 14]) expect(pick([atk({ target: "fresco", expected: 8 }), tryFree()], int, mover)?.optionId).toBe("break_free:Restrained");
  });

  // Bug caught: a creature that is not held (the condition is some other one with a way out) is pushed through the rule.
  it("leaves a creature that is not Restrained or Grappled to its ordinary choice", () => {
    const mover = who("ogre", { conditions: [{ name: "Charmed", breakFree: restrained.breakFree }] });
    expect(pick([atk({ target: "fresco", expected: 8 }), tryFree("Charmed")], 14, mover)?.optionId).toBe("attack:actions:Greatclub:fresco");
  });

  // Bug caught: the rule fires for a creature the condition does not hold in place, and it spends its Action on a check instead of its ordinary turn.
  it("does not break free for a condition that holds nothing in place when there is nothing to attack", () => {
    const mover = who("ogre", { conditions: [{ name: "Charmed", breakFree: restrained.breakFree }] });
    expect(pick([tryFree("Charmed"), other("dodge")], 14, mover)?.optionId).toBe("dodge");
  });

  // A broken creature that would flee, and is held, cannot run. Bug caught: the gate drops the check with the other non-retreats and it Dodges while held.
  it("breaks free before it runs when it is broken, would flee and is held", () => {
    const mover = heldOgre({ hp: 5 });
    const gated = gateOptions([tryFree(), atk({ target: "fresco" }), other("dodge"), other("flee")], prof(), mover);
    expect(gated.map((o) => o.kind)).toEqual(["break_free", "dodge", "flee"]);
    expect(pickTurn(gated, prof(), ctxOf([mover, FRESCO]))?.optionId).toBe("break_free:Restrained");
  });

  // Bug caught: the rule changes the pick of a creature with no such condition (it has no such option, so nothing may differ).
  it("changes nothing for a creature that has no way to break free", () => {
    expect(pick([atk({ target: "fresco", expected: 8 }), other("dodge")], 14, OGRE)?.optionId).toBe("attack:actions:Greatclub:fresco");
    expect(pick([other("dodge")], 14, OGRE)?.optionId).toBe("dodge");
  });

  // Every tier that offers an attack offers the check. Bug caught: the gate drops it for a tier, and that creature stays held.
  it("is kept by the gate at every tier that offers an attack", () => {
    for (const int of [2, 6, 10, 14]) expect(gateOptions([tryFree(), other("dodge")], prof({ int }), who("ogre")).map((o) => o.kind)).toContain("break_free");
  });
});

// SRD 5.1 Fear: "While frightened by this spell, a creature must take the Dash action and move away from you by the safest
// available route on each of its turns, unless there is nowhere to move." RULE flee-by-spell (app convention).
describe("rule flee-by-spell", () => {
  const scared = (by: string, over: Partial<RunCombatant> = {}) =>
    who("ogre", { conditions: [{ name: "Frightened", source: { id: by, spell: "Fear", mustFlee: true } }], ...over });
  const fleeOpt = (): TurnOption => ({ ...other("flee"), summary: "flee" });
  const tryFree = (): TurnOption => ({ ...other("break_free"), id: "break_free:Restrained", breakFree: { name: "Restrained", ability: "str" } });
  const nearAttacks = [atk({ target: "chicory", expected: 20 }), atk({ target: "fresco", expected: 3 })];
  const run = (mover: RunCombatant, options: TurnOption[], combatants: RunCombatant[]) => {
    const gated = gateOptions(options, prof(), mover, combatants);
    return { gated, pick: pickTurn(gated, prof(), ctxOf(combatants)) };
  };

  // Bug caught: a creature frightened by a spell goes on attacking the best target it has, as if the spell did nothing.
  it("flees instead of attacking, though it could attack, and names the caster it flees", () => {
    const mover = scared("fresco");
    const { gated, pick } = run(mover, [...nearAttacks, other("dodge"), fleeOpt()], [mover, FRESCO, CHICORY]);
    expect(gated.map((o) => o.kind)).toEqual(["dodge", "flee"]);
    expect(pick?.optionId).toBe("flee");
    expect(pick?.reason).toContain("get away from Fresco");
  });

  // Bug caught: the compulsion outlives its caster: a creature keeps running from a mage who has left the fight or died.
  it("is not gated once the caster is no longer in the fight", () => {
    const mover = scared("fresco");
    const { gated, pick } = run(mover, [...nearAttacks, other("dodge"), fleeOpt()], [mover, CHICORY]);
    expect(gated.map((o) => o.kind)).toEqual(["attack", "attack", "dodge", "flee"]);
    expect(pick?.optionId).toBe("attack:actions:Greatclub:chicory");
    const down = run(mover, nearAttacks, [mover, who("fresco", { hp: 0 }), CHICORY]);
    expect(down.gated.map((o) => o.kind)).toEqual(["attack", "attack"]);
  });

  // "may still ... try to escape from an effect that prevents it from moving" (Turn Undead). Bug caught: a held, frightened creature Dodges or runs (it cannot) instead of breaking free first.
  it("breaks free of a hold before it runs, by the same rule as a broken creature", () => {
    const mover = scared("fresco", { conditions: [{ name: "Restrained", breakFree: { abilities: ["str", "dex"], dc: 14 } }, { name: "Frightened", source: { id: "fresco", mustFlee: true } }] });
    const { pick } = run(mover, [...nearAttacks, tryFree(), other("dodge"), fleeOpt()], [mover, FRESCO, CHICORY]);
    expect(pick?.optionId).toBe("break_free:Restrained");
  });

  // "unless there is nowhere to move": nothing is forced then. This follows the text; the creature neither runs nor attacks the one it fears, it
  // keeps what is left (Dodge), the same fall-through a broken creature with no flee option takes.
  // Bug caught: with no flee option the gate gives the creature its attacks back, and it turns on the caster it is afraid of.
  it("with nowhere to move does not attack, and takes Dodge", () => {
    const mover = scared("fresco");
    const { gated, pick } = run(mover, [...nearAttacks, other("dodge")], [mover, FRESCO, CHICORY]);
    expect(gated.map((o) => o.kind)).toEqual(["dodge"]);
    expect(pick?.optionId).toBe("dodge");
  });

  // Bug caught: the Action is spent and the gate empties the list, so the creature takes no turn at all.
  it("keeps what it is offered when no retreat is on offer at all", () => {
    const mover = scared("fresco");
    expect(gateOptions(nearAttacks, prof(), mover, [mover, FRESCO, CHICORY])).toHaveLength(2);
  });

  // Bug caught: the way out meant for broken morale is used by a turned creature (a Plane Shift home).
  it("does not use a way out", () => {
    const mover = scared("fresco");
    const p = { ...prof(), wayOuts: [{ name: "Plane Shift", effect: "leaves" as const, limit: null, cost: "action" as const }] } as unknown as ReturnType<typeof prof>;
    expect(gateOptions([other("dodge"), fleeOpt()], p, mover, [mover, FRESCO]).map((o) => o.kind)).toEqual(["dodge", "flee"]);
  });

  // Bug caught: a creature that is not under such a condition is gated by the new rule (it must offer exactly its old options).
  it("changes nothing for a creature with no such condition", () => {
    const all = [...nearAttacks, other("dodge"), other("flee")];
    expect(gateOptions(all, prof(), OGRE, [OGRE, FRESCO, CHICORY])).toEqual(gateOptions(all, prof(), OGRE));
    expect(gateOptions(all, prof(), OGRE, [OGRE, FRESCO, CHICORY]).map((o) => o.kind)).toEqual(["attack", "attack", "dodge", "flee"]);
    const plainFear = who("ogre", { conditions: [{ name: "Frightened", source: { id: "fresco", spell: "Fear" } }] });
    expect(gateOptions(all, prof(), plainFear, [plainFear, FRESCO]).map((o) => o.kind)).toEqual(["attack", "attack", "dodge", "flee"]);
  });

  // Bug caught: the shared steps change what a morale flee does or says.
  it("leaves a morale flee exactly as it was", () => {
    const mover = who("ogre", { hp: 5 });
    const { pick } = run(mover, [...nearAttacks, other("dodge"), fleeOpt()], [mover, FRESCO, CHICORY]);
    expect(pick).toEqual({ optionId: "flee", reason: "Falls back: at 5 of 20 hit points it breaks and flees." });
  });
});

// ── boons (#1021, `boonChoice.ts`) ──────────────────────────────────────────────────
describe("pickTurn: a boon is cast early", () => {
  const friends = [who("pip", { faction_id: "m" }), who("brug", { faction_id: "m" }), who("tam", { faction_id: "m" })];
  const roster = [OGRE, ...friends, FRESCO];
  const blessOf = (over: Partial<NonNullable<TurnOption["boon"]>> = {}): TurnOption => ({
    id: "boon:Bless:1", kind: "boon", targetId: "pip", destination: null, path: null, feet: null, attack: null, distanceFeet: null, provokes: [], exposure: [], summary: "bless",
    boon: { name: "Bless", castLevel: 1, slot: "action", targetIds: ["pip", "brug", "tam"], spends: true, distanceFeet: 5, targetCount: 3, concentration: true, ...over },
  });
  const flame: TurnOption = {
    id: "spell:Sacred Flame:0:fresco", kind: "spell", targetId: "fresco", destination: null, path: null, feet: null, attack: null, distanceFeet: null, provokes: [], exposure: [], summary: "flame",
    spell: { name: "Sacred Flame", castLevel: 0, kind: "save", targetIds: ["fresco"], friendsCaught: [], spends: false, distanceFeet: 30, hitChance: 0.6, expectedDamage: 4.5 },
  };
  const healOf = (): TurnOption => ({
    id: "heal:Cure Wounds:1:pip", kind: "heal", targetId: "pip", destination: null, path: null, feet: null, attack: null, distanceFeet: null, provokes: [], exposure: [], summary: "heal",
    heal: { name: "Cure Wounds", castLevel: 1, slot: "action", targetIds: ["pip"], downIds: ["pip"], lowIds: [], spends: true, expectedEach: 7.5, distanceFeet: 5 },
  });
  const pickAt = (round: number, options: TurnOption[], combatants: RunCombatant[] = roster) =>
    pickTurn(options, prof(), { ...ctxOf(combatants), round });

  // APP CONVENTION "cast early": in round 1 a cleric with three friends in range casts Bless before its Sacred Flame; in round 3 it attacks.
  // Bug caught: Bless never cast, or cast in every round.
  it("fails if Bless is not cast in round 1 or is cast in round 3", () => {
    const options = [flame, blessOf(), atk({ target: "fresco", expected: 6, hit: 0.7 })];
    expect(pickAt(1, options)?.optionId).toBe("boon:Bless:1");
    expect(pickAt(3, options)?.optionId).not.toBe("boon:Bless:1");
  });

  // RULE boon-concentration: a caster already concentrating attacks instead. Bug caught: the boon ends the spell the caster holds.
  it("fails if Bless is cast while the caster concentrates", () => {
    const busy = who("ogre", { concentration: { spellId: null, spellName: "Hold Person", castAtLevel: 2, startedRound: 1, appliedEffectIds: [] } });
    const options = [blessOf(), atk({ target: "fresco", expected: 6, hit: 0.7 })];
    expect(pickAt(1, options, [busy, ...friends, FRESCO])?.optionId).toBe("attack:actions:Greatclub:fresco");
  });

  // The maintainer's order, heal first: a friend down at 0 is healed (Cure Wounds) rather than Blessed. Bug caught: the boon checked before the heal.
  it("fails if a friend down is Blessed instead of healed", () => {
    expect(pickAt(1, [blessOf(), healOf()])?.optionId).toBe("heal:Cure Wounds:1:pip");
  });

  // RULE boon-reach: Bless reaching one creature (count 3) is not worth the Action; the creature attacks. Bug caught: the minimum of two targets missing.
  it("fails if Bless is cast when it reaches only one creature", () => {
    const options = [blessOf({ targetIds: ["pip"] }), atk({ target: "fresco", expected: 6, hit: 0.7 })];
    expect(pickAt(1, options)?.optionId).toBe("attack:actions:Greatclub:fresco");
  });

  // A Bonus Action boon is no turn of its own: with only it and a dodge on offer the turn is the dodge. Bug caught: Shield of Faith picked as the whole turn.
  it("fails if a Bonus Action boon is picked as the turn", () => {
    const shield = blessOf({ name: "Shield of Faith", slot: "bonus_action", targetIds: ["pip"], targetCount: 1 });
    expect(pickAt(1, [shield, other("dodge")])?.optionId).toBe("dodge");
  });

  // With only the Bonus Action boon on offer there is no turn to pick: it rides one, it is not one. Bug caught: the Bonus Action filter missing, so Shield of Faith is the whole turn.
  it("fails if a lone Bonus Action boon is taken as the only turn on offer", () => {
    expect(pickAt(1, [blessOf({ name: "Shield of Faith", slot: "bonus_action", targetIds: ["pip"], targetCount: 1 })])).toBeNull();
  });

  // Past its round a boon is no fallback either: with an attack on offer the creature attacks, and the boon is not "the first turn on offer". Bug caught: the filter of cast kinds missing "boon".
  it("fails if a boon that was ruled out is taken as the turn that is left", () => {
    expect(pickAt(5, [blessOf(), other("hide")])?.optionId).toBe("hide");
  });
});
