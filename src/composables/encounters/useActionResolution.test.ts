import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { RollResult } from "@/lib/dice/dice";
import type { Monster } from "@/types/monster.types";
import type { RunCombatant } from "@/types/encounter.types";
import { emptyDefenses, type StatBlockEntry } from "@/types/statBlock.types";
import { useEncounterRunStore } from "@/stores/encounterRun";

const promptRoll = vi.fn();
const ruleset = ref<"2014" | "2024">("2024");
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll }) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset }) }));
// A party member whose sheet AC (17) differs from the stale copy on the combatant.
const party = ref([{ id: "pm-1", ac: 17, wildshape_state: null as { beast_ac: string } | null }]);
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: party }) }));
vi.mock("@/composables/party/useArmorClass", () => ({ useArmorClass: () => ({ acFor: (m: { ac: number }) => m.ac }) }));

import { useActionResolution } from "./useActionResolution";

/** A d20 result; with `dropped` the die that adv/dis threw away. */
function d20(kept: number, modifier = 0, dropped?: number): RollResult {
  return {
    total: kept + modifier,
    label: "",
    modifier,
    breakdown: [{ val: kept, dropped: false }, ...(dropped === undefined ? [] : [{ val: dropped, dropped: true }])],
    isCrit: kept === 20,
    isFumble: kept === 1,
  };
}
function dmg(total: number): RollResult {
  return { total, label: "", modifier: 0, breakdown: [], isCrit: false, isFumble: false, isDamage: true };
}

function combatant(id: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    type: "monster",
    name: id,
    faction_id: "f",
    initiative: 10,
    hp: 30,
    max_hp: 30,
    ac: "14 (natural armor)",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    ...over,
  };
}

const bite: StatBlockEntry = {
  name: "Bite",
  description: "",
  structured: {
    kind: "attack",
    source: "manual",
    attack: {
      delivery: "melee",
      bonus: 5,
      hit: [
        { dice: "1d8+3", type: "piercing" },
        { dice: "1d6", type: "fire" },
      ],
    },
  },
};

const breath: StatBlockEntry = {
  name: "Frost Breath",
  description: "",
  structured: {
    kind: "save",
    source: "manual",
    save: { ability: "dex", dc: 13, fail: [{ dice: "4d6", type: "cold" }], success: "half", conditions: ["Poisoned", "Prone"] },
  },
};

function monsterSource(id: string, over: Partial<Monster["stat_block"]> = {}): Monster {
  return {
    id,
    stat_block: {
      armor_class: 12,
      hit_points: "1d8",
      speed: "30 ft.",
      str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10,
      challenge_rating: "1",
      defenses: emptyDefenses(),
      ...over,
    },
  } as unknown as Monster;
}

describe("useActionResolution", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    promptRoll.mockReset();
    ruleset.value = "2024";
  });

  describe("resolveAttack", () => {
    it("hits on the total, passes the bonus and mode, and offers the damage parts", async () => {
      promptRoll.mockResolvedValue(d20(10, 5));
      const { resolveAttack } = useActionResolution();
      const out = await resolveAttack({
        attacker: combatant("wolf"),
        entry: bite,
        target: combatant("pc", { ac: "15" }),
        withinFiveFeet: true,
      });
      expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 20: 1 }, modifier: 5, mode: "normal" }));
      expect(out).toMatchObject({ natural: 10, total: 15, targetAc: 15, hit: true, critical: false, delivery: "melee" });
      expect(out?.damageParts).toHaveLength(2);
    });

    it("misses below AC and offers no damage", async () => {
      promptRoll.mockResolvedValue(d20(9, 5));
      const out = await useActionResolution().resolveAttack({
        attacker: combatant("wolf"), entry: bite, target: combatant("pc", { ac: "15" }), withinFiveFeet: true,
      });
      expect(out).toMatchObject({ hit: false, damageParts: null });
    });

    it("rolls with advantage against a Paralyzed target and reads the kept die; auto-crits within 5 ft", async () => {
      promptRoll.mockResolvedValue(d20(7, 5, 3));
      const out = await useActionResolution().resolveAttack({
        attacker: combatant("wolf"),
        entry: bite,
        target: combatant("pc", { ac: "10", conditions: [{ name: "Paralyzed" }] }),
        withinFiveFeet: true,
      });
      expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ mode: "advantage" }));
      expect(out).toMatchObject({ natural: 7, hit: true, critical: true, autoCrit: true });
    });

    it("applies the 2024 exhaustion penalty to the attacker's roll, not in 2014", async () => {
      promptRoll.mockResolvedValue(d20(10, 1));
      const attacker = combatant("wolf", { conditions: [{ name: "Exhaustion", level: 2 }] });
      const target = combatant("pc", { ac: "15" });
      const out = await useActionResolution().resolveAttack({ attacker, entry: bite, target, withinFiveFeet: false });
      expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ modifier: 1 }));
      expect(out).toMatchObject({ total: 11, hit: false });
    });

    it("natural 20 hits and crits, natural 1 misses, whatever the AC", async () => {
      const args = { attacker: combatant("wolf"), entry: bite, target: combatant("pc", { ac: "30" }), withinFiveFeet: false };
      promptRoll.mockResolvedValueOnce(d20(20, 5));
      expect(await useActionResolution().resolveAttack(args)).toMatchObject({ hit: true, critical: true });
      promptRoll.mockResolvedValueOnce(d20(1, 5));
      expect(await useActionResolution().resolveAttack({ ...args, target: combatant("pc", { ac: "1" }) })).toMatchObject({
        hit: false,
        fumble: true,
      });
    });

    it("leaves hit undecided when AC is unreadable, and null when the roll is cancelled", async () => {
      const args = { attacker: combatant("wolf"), entry: bite, target: combatant("pc", { ac: "" }), withinFiveFeet: false };
      promptRoll.mockResolvedValueOnce(d20(12, 5));
      expect(await useActionResolution().resolveAttack(args)).toMatchObject({ targetAc: null, hit: null, damageParts: null });
      promptRoll.mockResolvedValueOnce(null);
      expect(await useActionResolution().resolveAttack(args)).toBeNull();
    });

    it("overrideAttack turns a miss into a hit with damage, and a hit into a critical", async () => {
      promptRoll.mockResolvedValue(d20(2, 5));
      const { resolveAttack, overrideAttack } = useActionResolution();
      const miss = await resolveAttack({
        attacker: combatant("wolf"), entry: bite, target: combatant("pc", { ac: "20" }), withinFiveFeet: false,
      });
      if (!miss) throw new Error("no outcome");
      const hit = overrideAttack(miss, { hit: true, critical: true });
      expect(hit).toMatchObject({ hit: true, critical: true });
      expect(hit.damageParts).toHaveLength(2);
      expect(overrideAttack(hit, { hit: false })).toMatchObject({ critical: false, damageParts: null });
    });
  });

  describe("rollDamage", () => {
    it("rolls each part separately with its type, doubling dice but not the modifier on a crit", async () => {
      promptRoll.mockResolvedValueOnce(dmg(11)).mockResolvedValueOnce(dmg(5));
      const out = await useActionResolution().rollDamage({
        parts: [{ dice: "1d8+3", type: "piercing" }, { dice: "1d6", type: "fire" }],
        critical: true,
        label: "Bite",
      });
      expect(out).toEqual([{ amount: 11, type: "piercing" }, { amount: 5, type: "fire" }]);
      expect(promptRoll).toHaveBeenNthCalledWith(1, expect.objectContaining({ counts: { 8: 2 }, modifier: 3, isDamage: true }));
      expect(promptRoll).toHaveBeenNthCalledWith(2, expect.objectContaining({ counts: { 6: 2 }, modifier: 0 }));
    });

    it("does not prompt for a flat part, and returns null when a roll is cancelled", async () => {
      const { rollDamage } = useActionResolution();
      expect(await rollDamage({ parts: [{ dice: "1", type: "piercing" }], critical: false, label: "Sting" })).toEqual([
        { amount: 1, type: "piercing" },
      ]);
      expect(promptRoll).not.toHaveBeenCalled();
      promptRoll.mockResolvedValueOnce(null);
      expect(await rollDamage({ parts: [{ dice: "1d6", type: "fire" }], critical: false, label: "x" })).toBeNull();
    });
  });

  describe("applyDamage", () => {
    it("runs the parts through defenses, takes HP, and offers the concentration DC", () => {
      const store = useEncounterRunStore();
      const target = combatant("mage", {
        concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] },
      });
      store.combatants = [target];
      const defenses = { ...emptyDefenses(), immunities: [{ types: ["fire" as const] }], resistances: [{ types: ["piercing" as const] }] };
      const out = useActionResolution().applyDamage({
        target,
        defenses,
        parts: [{ amount: 11, type: "piercing" }, { amount: 5, type: "fire" }],
      });
      expect(out.total).toBe(5);
      expect(out.parts.map((p) => p.applied)).toEqual(["resistant", "immune"]);
      expect(store.combatants[0].hp).toBe(25);
      expect(out.concentrationDc).toBe(10);
    });

    it("magical damage bypasses a nonmagical resistance, and zero damage forces no check or HP change", () => {
      const store = useEncounterRunStore();
      const target = combatant("ghoul", {
        concentration: { spellId: null, spellName: "X", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] },
      });
      store.combatants = [target];
      const defenses = { ...emptyDefenses(), resistances: [{ types: ["slashing" as const], unless: ["magical" as const] }] };
      const { applyDamage } = useActionResolution();
      expect(applyDamage({ target, defenses, parts: [{ amount: 10, type: "slashing" }], magical: true }).total).toBe(10);
      const none = applyDamage({ target, defenses: { ...emptyDefenses(), immunities: [{ types: ["slashing"] }] }, parts: [{ amount: 9, type: "slashing" }] });
      expect(none).toMatchObject({ total: 0, concentrationDc: null });
      expect(store.combatants[0].hp).toBe(20);
    });

    it("reports the dying outcome of a player and passes the critical flag", () => {
      const store = useEncounterRunStore();
      const pc = combatant("pc", { type: "player", party_member_id: "pm", hp: 5, max_hp: 20 });
      store.combatants = [pc];
      const out = useActionResolution().applyDamage({ target: pc, defenses: emptyDefenses(), parts: [{ amount: 40, type: "cold" }] });
      expect(out.dying).toBe("died");
    });
  });

  describe("saves", () => {
    const sources = () => {
      const store = useEncounterRunStore();
      store.availableMonsters = [monsterSource("m-goblin"), monsterSource("m-ogre", { dex: 8, saving_throws: "Dex +4" })];
      return store;
    };

    it("rolls monsters with their stat-block bonus, auto-fails the paralyzed, and leaves party members unrolled", async () => {
      sources();
      promptRoll.mockResolvedValueOnce(d20(8, 2)).mockResolvedValueOnce(d20(10, 4));
      const goblin = combatant("g", { monster_id: "m-goblin" });
      const ogre = combatant("o", { monster_id: "m-ogre" });
      const stunned = combatant("s", { monster_id: "m-goblin", conditions: [{ name: "Stunned" }] });
      const hero = combatant("h", { type: "player", party_member_id: "pm" });
      const { resolveSaves, settleSave } = useActionResolution();
      const results = await resolveSaves({ entry: breath, targets: [goblin, ogre, stunned, hero] });
      expect(promptRoll).toHaveBeenCalledTimes(2);
      expect(promptRoll).toHaveBeenNthCalledWith(1, expect.objectContaining({ modifier: 2 }));
      expect(promptRoll).toHaveBeenNthCalledWith(2, expect.objectContaining({ modifier: 4 }));
      expect(results.map((r) => [r.bonus, r.total, r.success, r.autoFail])).toEqual([
        [2, 10, false, false],
        [4, 14, true, false],
        [2, null, false, true],
        [null, null, null, false],
      ]);
      expect(settleSave(results[3], 13)).toMatchObject({ total: 13, success: true });
      expect(settleSave(results[3], 12).success).toBe(false);
    });

    it("never lets the attacker's roll-mode toggle reach the targets' own saves", async () => {
      sources();
      promptRoll.mockResolvedValue(d20(10, 2));
      const leaked = { dmMode: "advantage" as const };
      await useActionResolution().resolveSaves({
        entry: breath,
        targets: [combatant("g", { monster_id: "m-goblin", conditions: [{ name: "Restrained" }] }), combatant("o", { monster_id: "m-goblin" })],
        ...leaked,
      });
      expect(promptRoll).toHaveBeenNthCalledWith(1, expect.objectContaining({ mode: "disadvantage" }));
      expect(promptRoll).toHaveBeenNthCalledWith(2, expect.objectContaining({ mode: "normal" }));
    });

    it("halves the rolled damage once on a successful half save", () => {
      const store = sources();
      const saver = combatant("b", { monster_id: "m-goblin" });
      store.combatants = [saver];
      const base = { dc: 13, ability: "dex" as const, bonus: 0, mode: "normal" as const, reasons: [], autoFail: false, natural: null, total: null, roll: null };
      const [applied] = useActionResolution().applySaveOutcome({
        attacker: combatant("x"),
        entry: breath,
        damageParts: [{ amount: 7, type: "fire" }, { amount: 7, type: "poison" }],
        results: [{ ...base, target: saver, success: true }],
      });
      expect(applied.damage?.total).toBe(7);
    });

    it("gives Restrained dex saves disadvantage and leaves a cancelled roll unresolved", async () => {
      sources();
      promptRoll.mockResolvedValueOnce(null);
      const [r] = await useActionResolution().resolveSaves({
        entry: breath,
        targets: [combatant("g", { monster_id: "m-goblin", conditions: [{ name: "Restrained" }] })],
      });
      expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ mode: "disadvantage" }));
      expect(r.success).toBeNull();
    });

    it("applies full, half and no damage per result, imposes conditions on failures minus immunities", async () => {
      const store = sources();
      store.availableMonsters.push(
        monsterSource("m-undead", { defenses: { ...emptyDefenses(), condition_immunities: ["Poisoned"], resistances: [{ types: ["cold"] }] } }),
      );
      const failer = combatant("a", { monster_id: "m-goblin" });
      const saver = combatant("b", { monster_id: "m-goblin" });
      const undead = combatant("c", { monster_id: "m-undead" });
      const pending = combatant("d", { monster_id: "m-goblin" });
      store.combatants = [failer, saver, undead, pending];
      const { applySaveOutcome } = useActionResolution();
      const base = { dc: 13, ability: "dex" as const, bonus: 0, mode: "normal" as const, reasons: [], autoFail: false, natural: null, total: null, roll: null };
      const applied = applySaveOutcome({
        attacker: combatant("x"),
        entry: breath,
        damageParts: [{ amount: 15, type: "cold" }],
        results: [
          { ...base, target: failer, success: false },
          { ...base, target: saver, success: true },
          { ...base, target: undead, success: false },
          { ...base, target: pending, success: null },
        ],
      });
      expect(applied.map((a) => [a.share, a.damage?.total ?? null])).toEqual([
        ["full", 15],
        ["half", 7],
        ["full", 7],
        [null, null],
      ]);
      const hp = (id: string) => store.combatants.find((c) => c.instance_id === id)?.hp;
      expect([hp("a"), hp("b"), hp("c"), hp("d")]).toEqual([15, 23, 23, 30]);
      expect(applied[0].conditionsApplied).toEqual(["Poisoned", "Prone"]);
      expect(applied[2]).toMatchObject({ conditionsApplied: ["Prone"], conditionsImmune: ["Poisoned"] });
      expect(store.combatants.find((c) => c.instance_id === "a")?.conditions).toEqual([
        { name: "Poisoned", source: { id: "x", spell: "Frost Breath" } },
        { name: "Prone", source: { id: "x", spell: "Frost Breath" } },
      ]);
      expect(store.combatants.find((c) => c.instance_id === "b")?.conditions).toEqual([]);
    });

    it("a successful save against a no-damage save takes nothing, and an existing condition is not toggled off", () => {
      const store = sources();
      const prone = combatant("p", { monster_id: "m-goblin", conditions: [{ name: "Prone" }] });
      store.combatants = [prone];
      const base = { dc: 13, ability: "dex" as const, bonus: 0, mode: "normal" as const, reasons: [], autoFail: false, natural: null, total: null, roll: null };
      const web: StatBlockEntry = {
        ...breath,
        structured: { ...breath.structured, save: { ability: "dex", dc: 13, fail: [], success: "none", conditions: ["Prone"] } },
      };
      const { applySaveOutcome } = useActionResolution();
      const [saved] = applySaveOutcome({ attacker: combatant("x"), entry: web, damageParts: [], results: [{ ...base, target: prone, success: true }] });
      expect(saved).toMatchObject({ share: "none", damage: null, conditionsApplied: [] });
      applySaveOutcome({ attacker: combatant("x"), entry: web, damageParts: [], results: [{ ...base, target: prone, success: false }] });
      expect(store.combatants[0].conditions).toEqual([{ name: "Prone" }]);
    });

    it("records what ends an imposed condition, a save-ends repeat taking the save's ability and DC (#1050)", () => {
      const store = sources();
      const target = combatant("t", { monster_id: "m-goblin" });
      store.combatants = [target];
      const base = { dc: 10, ability: "con" as const, bonus: 0, mode: "normal" as const, reasons: [], autoFail: false, natural: null, total: null, roll: null };
      const claws: StatBlockEntry = {
        ...breath,
        name: "Claws",
        structured: {
          ...breath.structured,
          save: { ability: "con", dc: 10, fail: [], success: "none", conditions: ["Paralyzed"], ends: { kind: "save", at: "end" } },
        },
      };
      useActionResolution().applySaveOutcome({ attacker: combatant("x"), entry: claws, damageParts: [], results: [{ ...base, target, success: false }] });
      expect(store.combatants[0].conditions).toEqual([
        { name: "Paralyzed", source: { id: "x", spell: "Claws" }, ends: { kind: "save", ability: "con", dc: 10, at: "end" } },
      ]);
    });
  });

  describe("rollConcentration", () => {
    it("rolls Con against max(10, half the damage)", async () => {
      useEncounterRunStore().availableMonsters = [monsterSource("m-goblin")];
      promptRoll.mockResolvedValue(d20(10, 1));
      const out = await useActionResolution().rollConcentration({ target: combatant("g", { monster_id: "m-goblin" }), damage: 30 });
      expect(out).toMatchObject({ dc: 15, total: 11, maintained: false });
    });

    it("refuses a combatant with no stat block", async () => {
      await expect(
        useActionResolution().rollConcentration({ target: combatant("h", { type: "player", party_member_id: "pm" }), damage: 5 }),
      ).rejects.toThrow(/no stat block/);
    });
  });
});

describe("useActionResolution condition saves (#1018)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    promptRoll.mockReset();
    ruleset.value = "2024";
    const store = useEncounterRunStore();
    store.availableMonsters = [monsterSource("m-goblin")];
  });

  const goblin = () => combatant("g", { monster_id: "m-goblin" });

  it("rolls a monster's save against the condition's DC and reports success", async () => {
    promptRoll.mockResolvedValue(d20(12, 2));
    const out = await useActionResolution().rollConditionSave({ target: goblin(), ability: "wis", dc: 14, label: "Paralyzed" });
    expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ modifier: 0 }));
    expect(out).toEqual({ total: 12, success: false });
    promptRoll.mockResolvedValue(d20(15));
    const pass = await useActionResolution().rollConditionSave({ target: goblin(), ability: "wis", dc: 14, label: "Paralyzed" });
    expect(pass).toEqual({ total: 15, success: true });
  });

  it("fails automatically, without a die, a paralyzed creature's Strength or Dexterity save", async () => {
    const store = useEncounterRunStore();
    store.combatants = [combatant("g", { monster_id: "m-goblin", conditions: [{ name: "Paralyzed" }] })];
    const out = await useActionResolution().rollConditionSave({ target: goblin(), ability: "dex", dc: 10, label: "Burning" });
    expect(out).toEqual({ total: null, success: false });
    expect(promptRoll).not.toHaveBeenCalled();
  });

  it("returns null for a party member (the player rolls at the table) and for a cancelled roll", async () => {
    const hero = combatant("h", { type: "player", party_member_id: "pm" });
    expect(await useActionResolution().rollConditionSave({ target: hero, ability: "wis", dc: 14, label: "x" })).toBeNull();
    promptRoll.mockResolvedValue(null);
    expect(await useActionResolution().rollConditionSave({ target: goblin(), ability: "wis", dc: 14, label: "x" })).toBeNull();
  });

  it("offers the damage-time concentration DC only to a combatant with a concentration of its own: a holder is prompted by the turn reducer", () => {
    const store = useEncounterRunStore();
    const mage = combatant("mage", { monster_id: "m-goblin" });
    const held = combatant("g", { monster_id: "m-goblin", conditions: [{ name: "Paralyzed", source: { id: "mage", spell: "Hold Person", concentration: true } }] });
    store.combatants = [mage, held];
    const { applyDamage, defensesFor } = useActionResolution();
    const hit = applyDamage({ target: mage, parts: [{ amount: 4, type: null }], defenses: defensesFor(mage) });
    expect(hit.concentrationDc).toBeNull();
    expect(store.concentrationChecks).toEqual([expect.objectContaining({ instanceId: "mage", damage: 4 })]);
  });

  it("a lost concentration roll does not end conditions itself: the due strip resolves the check", async () => {
    const store = useEncounterRunStore();
    const held = combatant("g", { monster_id: "m-goblin", conditions: [{ name: "Paralyzed", source: { id: "mage", spell: "Hold Person", concentration: true } }] });
    store.combatants = [combatant("mage", { monster_id: "m-goblin" }), held];
    promptRoll.mockResolvedValue(d20(1));
    const check = await useActionResolution().rollConcentration({ target: store.combatants[0]!, damage: 4 });
    expect(check?.maintained).toBe(false);
    expect(store.combatants[1]!.conditions).toHaveLength(1);
  });
});

describe("useActionResolution armorClassFor", () => {
  beforeEach(() => setActivePinia(createPinia()));
  const pc = { instance_id: "p-1", type: "player", party_member_id: "pm-1", ac: "12" } as RunCombatant;

  it("rolls against a party member's live sheet AC, not the combatant's stale copy", () => {
    party.value[0].wildshape_state = null;
    expect(useActionResolution().armorClassFor(pc)).toBe(17);
  });

  it("rolls against the beast's AC in Wild Shape", () => {
    party.value[0].wildshape_state = { beast_ac: "13" };
    expect(useActionResolution().armorClassFor(pc)).toBe(13);
    party.value[0].wildshape_state = null;
  });

  it("reads a monster's printed AC", () => {
    const goblin = { instance_id: "m-1", type: "monster", ac: "15 (leather armor)" } as RunCombatant;
    expect(useActionResolution().armorClassFor(goblin)).toBe(15);
  });
});
