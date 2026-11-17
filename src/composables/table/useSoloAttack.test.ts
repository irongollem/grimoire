import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { PcAttackRow } from "@/composables/encounters/usePcAttackRows";
import type { RunCombatant } from "@/types/encounter.types";
import { useSoloAttack } from "./useSoloAttack";

const AC = 17;
const HP = 43;

function combatant(id: string, extra: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name: id, faction_id: "f", initiative: 10, hp: HP, max_hp: 50, ac: String(AC),
    conditions: [], curses: [], death_saves: { successes: 0, failures: 0 }, dex_mod: 0, ...extra,
  };
}

const sword = {
  key: "melee:1", name: "Longsword", kind: "melee", attackBonus: 5, damageDice: "1d8+3", damageFixed: null, modifier: 3,
  damageType: "slashing", baseDice: "1d8", shape: null, description: "", ammoTag: null, weaponInvId: "inv",
} as PcAttackRow;

function setup() {
  setActivePinia(createPinia());
  const store = useEncounterRunStore();
  store.combatants = [combatant("mira", { type: "player", name: "Mira", faction_id: "p", ac: "15", hp: 30 }), combatant("orc", { name: "Orc" })];
  const attack = useSoloAttack({ attackerId: () => "mira", ruleset: () => "2024" });
  const orc = () => store.combatants.find((c) => c.instance_id === "orc");
  const mira = () => store.combatants.find((c) => c.instance_id === "mira");
  async function toHit(faces: number[], atTable = false, row: PcAttackRow = sword) {
    attack.aim(row);
    attack.pickTarget("orc");
    return attack.rollToHit({ faces, atTable, mode: "normal" });
  }
  return { store, attack, orc, mira, toHit };
}

describe("useSoloAttack roll to hit", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("hits when the total equals the armour class and misses one under", async () => {
    // SRD 5.1 "Attack Rolls": a hit if the total equals or exceeds the target's AC (17). Bug caught: > instead of >=, or an off-by-one.
    const a = setup();
    await a.toHit([12]);
    expect(a.attack.state.value.step).toBe("damage");
    const b = setup();
    await b.toHit([11]);
    expect(b.attack.state.value.step).toBe("idle");
  });

  it("hits on a natural 20 whatever the armour class and misses on a natural 1 whatever the bonus", async () => {
    // SRD 5.1 "Attack Rolls": a 20 always hits, a 1 always misses. Bug caught: the bonus rescuing a 1, or AC 30 stopping a 20.
    const a = setup();
    a.orc()!.ac = "30";
    await a.toHit([20]);
    expect(a.attack.state.value).toMatchObject({ step: "damage", critical: true });
    const b = setup();
    b.orc()!.ac = "5";
    await b.toHit([1], false, { ...sword, attackBonus: 25 });
    expect(b.attack.state.value.step).toBe("idle");
    expect(b.orc()?.hp).toBe(HP);
  });

  it("a miss takes no hit points and still spends the Action", async () => {
    // Bug caught: the Action left unspent after a miss, letting the player attack again, or damage applied anyway.
    const a = setup();
    const lines = await a.toHit([3]);
    expect(a.orc()?.hp).toBe(HP);
    expect(a.mira()?.action_used).toBe(true);
    expect(lines[0]).toMatchObject({ kind: "roll", label: "Longsword against Orc: a miss" });
  });

  it("marks a typed roll as rolled at the table", async () => {
    // Bug caught: the atTable flag lost on the way to the story.
    const a = setup();
    const lines = await a.toHit([14], true);
    expect(lines[0]).toMatchObject({ detail: "d20 (14) + 5 · rolled at the table" });
  });

  it("keeps the better of two faces with advantage", async () => {
    // PHB 2014 "Advantage and Disadvantage". Bug caught: the first face used, so 3 (miss) beats the 15 (hit).
    const a = setup();
    a.attack.aim(sword);
    a.attack.pickTarget("orc");
    await a.attack.rollToHit({ faces: [3, 15], atTable: false, mode: "advantage" });
    expect(a.attack.state.value.step).toBe("damage");
  });

  it("never puts the armour class or the hit points in the state or in the lines", async () => {
    // The player must not learn the target's AC (17) or hit points (43). Bug caught: a line or the state carrying either.
    const a = setup();
    const missLines = await a.toHit([8]);
    const b = setup();
    const hitLines = await b.toHit([14]);
    const damageLines = await b.attack.rollDamage({ faces: [6], atTable: false });
    for (const text of [JSON.stringify(missLines), JSON.stringify(hitLines), JSON.stringify(damageLines), JSON.stringify(b.attack.state.value)]) {
      expect(text).not.toMatch(/\b17\b/);
      expect(text).not.toMatch(/\b43\b/);
    }
  });
});

describe("useSoloAttack damage", () => {
  it("takes the rolled damage off the target and spends the Action", async () => {
    // 1d8 face 4 + 3 = 7 slashing; 43 - 7 = 36. Bug caught: the modifier left out, or the Action left unspent.
    const a = setup();
    await a.toHit([14]);
    const lines = await a.attack.rollDamage({ faces: [4], atTable: true });
    expect(a.orc()?.hp).toBe(36);
    expect(a.mira()?.action_used).toBe(true);
    // The line carries the dice as they fell and what was added, as typed at the table.
    expect(lines).toEqual([{ kind: "roll", die: 7, label: "Mira deals 7 slashing", detail: "1d8 (4) + 3 · rolled at the table", critical: false }]);
    expect(a.attack.state.value.step).toBe("idle");
  });

  it("doubles the dice of a critical hit and not the modifier", async () => {
    // SRD 5.1 "Critical Hits": roll the damage dice twice. 2d8 faces 4 and 5 = 9, + 3 = 12; 43 - 12 = 31. Bug caught: 2 x (1d8+3) = 14 or dice not doubled.
    const a = setup();
    await a.toHit([20]);
    await a.attack.rollDamage({ faces: [4, 5], atTable: false });
    expect(a.orc()?.hp).toBe(31);
  });

  it("refuses typed dice that do not match the damage, and stays on the damage step", async () => {
    // Bug caught: a missing or oversized die accepted, damage applied wrongly, and the attack lost.
    const a = setup();
    await a.toHit([14]);
    await expect(a.attack.rollDamage({ faces: [9], atTable: false })).rejects.toThrow();
    await expect(a.attack.rollDamage({ faces: [4, 4], atTable: false })).rejects.toThrow();
    expect(a.attack.state.value.step).toBe("damage");
    expect(a.orc()?.hp).toBe(HP);
  });

  it("rolls the dice itself when asked to", async () => {
    // Bug caught: the "roll for me" answer dealing no damage. At least 1 + 3 and at most 8 + 3 off 43.
    const a = setup();
    await a.toHit([14]);
    await a.attack.rollDamage({ roll: true });
    const hp = a.orc()?.hp ?? 0;
    expect(hp).toBeGreaterThanOrEqual(HP - 11);
    expect(hp).toBeLessThanOrEqual(HP - 4);
  });

  it("does nothing when there is no hit waiting for damage", async () => {
    // Bug caught: damage applied with no attack in progress.
    const a = setup();
    expect(await a.attack.rollDamage({ roll: true })).toEqual([]);
    expect(a.orc()?.hp).toBe(HP);
  });
});

describe("useSoloAttack aiming", () => {
  it("cannot target oneself and can be cancelled", () => {
    // Bug caught: a character swinging at themself, or a cancelled attack still armed.
    const a = setup();
    a.attack.aim(sword);
    expect(() => a.attack.pickTarget("mira")).toThrow();
    expect(a.attack.state.value.step).toBe("aiming");
    a.attack.cancel();
    expect(a.attack.state.value.step).toBe("idle");
  });
});

describe("useSoloAttack: an opportunity attack", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // PHB 2014 "Opportunity Attacks": the strike is made with the Reaction. Bug caught: the strike spending the
  // character's Action, so an opportunity attack on a foe's turn costs them their own next attack.
  it("is paid with the Reaction and leaves the Action alone", async () => {
    const t = setup();
    t.attack.strike(sword, "orc");
    expect(t.attack.state.value.step).toBe("to_hit");
    await t.attack.rollToHit({ faces: [2], atTable: false, mode: "normal" });
    expect(t.mira()?.reactionUsed).toBe(true);
    expect(t.mira()?.action_used).not.toBe(true);
  });

  // Bug caught: the Reaction's payment sticking, so the next ordinary attack is charged to the Reaction too.
  it("an ordinary attack afterwards is paid with the Action again", async () => {
    const t = setup();
    t.attack.strike(sword, "orc");
    await t.attack.rollToHit({ faces: [2], atTable: false, mode: "normal" });
    await t.toHit([2]);
    expect(t.mira()?.action_used).toBe(true);
  });

  // PHB 2014 "Unseen Attackers and Targets": attacking gives a hider's place away, hit or miss.
  it("an attack ends the attacker's Hidden condition even on a miss", async () => {
    const t = setup();
    t.store.applyCondition("mira", { name: "Hidden" });
    await t.toHit([2]);
    expect(t.mira()?.conditions.some((c) => c.name === "Hidden")).toBe(false);
  });
});
