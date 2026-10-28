// @vitest-environment jsdom
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RunnerAttackFlow from "./RunnerAttackFlow.vue";
import RunnerAttackOutcome from "./RunnerAttackOutcome.vue";
import RunnerSaveFlow from "./RunnerSaveFlow.vue";
import RunnerResolvePanel from "./RunnerResolvePanel.vue";
import type { AttackOutcome, SaveTargetResult } from "@/composables/encounters/useActionResolution";
import type { RunCombatant } from "@/types/encounter.types";
import type { Defenses, StatBlockEntry } from "@/types/statBlock.types";
import { emptyDefenses } from "@/types/statBlock.types";

function fighter(id: string, name: string, faction: string, extra: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id,
    name,
    faction_id: faction,
    ac: "15",
    hp: 20,
    max_hp: 20,
    conditions: [],
    type: "monster",
    initiative: 10,
    ...extra,
  } as unknown as RunCombatant;
}

const attacker = fighter("a1", "Drake", "monsters");
const goblin = fighter("g1", "Goblin", "party", { initiative: 20 });
const aria = fighter("p1", "Aria", "party", { type: "player", initiative: 5 });

const mocks = vi.hoisted(() => ({
  res: {
    armorClassFor: vi.fn(() => 14),
    defensesFor: vi.fn(),
    saveBonusFor: vi.fn(),
    resolveAttack: vi.fn(),
    overrideAttack: vi.fn(),
    rollDamage: vi.fn(),
    applyDamage: vi.fn(),
    rollConcentration: vi.fn(),
    resolveSaves: vi.fn(),
    settleSave: vi.fn(),
    applySaveOutcome: vi.fn(),
  },
  combatants: [] as RunCombatant[],
}));

vi.mock("@/composables/encounters/useActionResolution", () => ({ useActionResolution: () => mocks.res }));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: { value: "2014" } }) }));
vi.mock("@/stores/encounterRun", () => ({
  useEncounterRunStore: () => ({
    get combatants() {
      return mocks.combatants;
    },
  }),
}));

const claw: StatBlockEntry = {
  name: "Claw",
  description: "Claw prose",
  structured: {
    kind: "attack",
    source: "manual",
    attack: { delivery: "melee", bonus: 4, reach: 5, hit: [{ dice: "1d6+2", type: "slashing" }] },
  },
};

const scorch: StatBlockEntry = {
  name: "Breath Weapons: Fire",
  description: "",
  structured: {
    kind: "save",
    source: "manual",
    save: { ability: "dex", dc: 13, fail: [{ dice: "6d6", type: "fire" }], success: "half", conditions: [] },
  },
};

function mountPanel(entry: StatBlockEntry) {
  return mount(RunnerResolvePanel, { props: { attacker, entry, dmMode: "normal", silent: false } });
}

function button(w: ReturnType<typeof mountPanel>, text: string) {
  const found = w.findAll("button").find((b) => b.text() === text);
  if (!found) throw new Error(`No button "${text}"`);
  return found;
}

describe("RunnerResolvePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.combatants = [attacker, goblin, aria];
    mocks.res.defensesFor.mockReturnValue(emptyDefenses());
    mocks.res.saveBonusFor.mockImplementation((c: RunCombatant) => (c.instance_id === "p1" ? null : 2));
  });

  it("attack: rolls, lets the DM overrule a miss, rolls damage, previews resistance and applies", async () => {
    const missed = {
      attacker, target: goblin, entry: claw, delivery: "melee", mode: "normal", reasons: [],
      natural: 8, total: 12, targetAc: 15, hit: false, critical: false, fumble: false, autoCrit: false,
      damageParts: null, roll: {},
    } as unknown as AttackOutcome;
    const resistant: Defenses = {
      ...emptyDefenses(),
      resistances: [{ types: ["slashing"] }],
    };
    mocks.res.resolveAttack.mockResolvedValue(missed);
    mocks.res.overrideAttack.mockImplementation((o: AttackOutcome, over: { hit?: boolean }) => ({
      ...o, hit: over.hit, damageParts: claw.structured.attack?.hit,
    }));
    mocks.res.rollDamage.mockResolvedValue([{ amount: 8, type: "slashing" }]);
    mocks.res.defensesFor.mockReturnValue(resistant);
    mocks.res.applyDamage.mockReturnValue({
      target: goblin, parts: [], total: 4, notes: [], dying: null, concentrationDc: null,
    });

    const w = mountPanel(claw);
    // The first opponent is preselected.
    await button(w, "Roll attack +4").trigger("click");
    await flushPromises();
    expect(mocks.res.resolveAttack).toHaveBeenCalledWith(expect.objectContaining({ target: goblin, withinFiveFeet: true }));
    expect(w.emitted("first-roll")).toHaveLength(1);
    expect(w.text()).toContain("12");
    expect(w.text()).toContain("vs AC 15");

    await button(w, "Hit").trigger("click");
    await button(w, "Roll damage").trigger("click");
    await flushPromises();
    expect(mocks.res.rollDamage).toHaveBeenCalledWith(expect.objectContaining({ parts: claw.structured.attack?.hit, critical: false }));
    expect(w.text()).toContain("resistant");
    expect(w.text()).toContain("Takes 4");

    await w.find("[data-testid='apply-damage']").trigger("click");
    expect(mocks.res.applyDamage).toHaveBeenCalledWith(
      expect.objectContaining({ target: goblin, parts: [{ amount: 8, type: "slashing" }], defenses: resistant, magical: false }),
    );
    expect(w.text()).toContain("Goblin takes 4.");
  });

  it("save: a party member needs the player's total before the damage can be applied", async () => {
    const results = [
      { target: goblin, ability: "dex", dc: 13, bonus: 2, mode: "normal", reasons: [], autoFail: false, natural: 6, total: 8, success: false, roll: {} },
      { target: aria, ability: "dex", dc: 13, bonus: null, mode: "normal", reasons: [], autoFail: false, natural: null, total: null, success: null, roll: null },
    ] as unknown as SaveTargetResult[];
    mocks.res.resolveSaves.mockResolvedValue(results);
    mocks.res.settleSave.mockImplementation((r: SaveTargetResult, total: number) => ({ ...r, total, success: total >= r.dc }));
    mocks.res.rollDamage.mockResolvedValue([{ amount: 21, type: "fire" }]);
    mocks.res.applySaveOutcome.mockReturnValue([
      { target: goblin, share: "full", damage: { target: goblin, parts: [], total: 21, notes: [], dying: null, concentrationDc: null }, conditionsApplied: [], conditionsImmune: [] },
      { target: aria, share: "half", damage: { target: aria, parts: [], total: 10, notes: [], dying: null, concentrationDc: null }, conditionsApplied: [], conditionsImmune: [] },
    ]);

    const w = mountPanel(scorch);
    expect(w.find("[data-testid='roll-saves']").attributes("disabled")).toBeDefined();
    await w.find("[data-testid='target-g1']").trigger("click");
    await w.find("[data-testid='target-p1']").trigger("click");
    expect(w.text()).toContain("player rolls");
    await w.find("[data-testid='roll-saves']").trigger("click");
    await flushPromises();
    const asked = mocks.res.resolveSaves.mock.calls[0][0] as { entry: StatBlockEntry; targets: RunCombatant[] };
    expect(asked.entry).toEqual(scorch);
    expect(asked.targets.map((t) => t.name).sort()).toEqual(['Aria', 'Goblin']);

    await button(w, "Roll damage").trigger("click");
    await flushPromises();
    expect(w.find("[data-testid='apply-save']").attributes("disabled")).toBeDefined();

    await w.find("input[placeholder='Total']").setValue("17");
    await button(w, "Set").trigger("click");
    expect(mocks.res.settleSave).toHaveBeenCalledWith(expect.objectContaining({ target: aria }), 17);
    await w.find("[data-testid='apply-save']").trigger("click");

    expect(mocks.res.applySaveOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ entry: scorch, damageParts: [{ amount: 21, type: "fire" }], magical: false }),
    );
    expect(w.text()).toContain("Goblin takes 21.");
    expect(w.text()).toContain("Aria takes 10 (half).");
  });

  describe("the save a hit forces (#1050)", () => {
    const ghoulClaw: StatBlockEntry = {
      name: "Claws",
      description: "Claws prose",
      structured: {
        kind: "attack",
        source: "parsed",
        attack: { delivery: "melee", bonus: 4, reach: 5, hit: [{ dice: "2d4+2", type: "slashing" }] },
        save: { ability: "con", dc: 10, fail: [], success: "none", conditions: [{ name: "Paralyzed", ends: { kind: "save", at: "end" } }] },
      },
    };
    const outcome = (hit: boolean, entry: StatBlockEntry) =>
      ({
        attacker, target: goblin, entry, delivery: "melee", mode: "normal", reasons: [],
        natural: hit ? 15 : 3, total: hit ? 19 : 7, targetAc: 15, hit, critical: false, fumble: false, autoCrit: false,
        damageParts: hit ? entry.structured.attack?.hit : null, roll: {},
      }) as unknown as AttackOutcome;
    const failed = [
      { target: goblin, ability: "con", dc: 10, bonus: 2, mode: "normal", reasons: [], autoFail: false, natural: 4, total: 6, success: false, roll: {} },
    ] as unknown as SaveTargetResult[];

    it("follows the applied damage, for the creature that was hit only, and says what ends the condition", async () => {
      mocks.res.resolveAttack.mockResolvedValue(outcome(true, ghoulClaw));
      mocks.res.rollDamage.mockResolvedValue([{ amount: 7, type: "slashing" }]);
      mocks.res.applyDamage.mockReturnValue({ target: goblin, parts: [], total: 7, notes: [], dying: null, concentrationDc: null });
      mocks.res.resolveSaves.mockResolvedValue(failed);
      mocks.res.applySaveOutcome.mockImplementation(() => {
        // The store now holds the record impose() wrote.
        mocks.combatants = mocks.combatants.map((c) =>
          c.instance_id === "g1"
            ? { ...c, conditions: [{ name: "Paralyzed", source: { id: "a1", spell: "Claws" }, ends: { kind: "save", ability: "con", dc: 10, at: "end" } }] }
            : c,
        );
        return [{ target: goblin, share: "none", damage: null, conditionsApplied: ["Paralyzed"], conditionsImmune: [] }];
      });

      const w = mountPanel(ghoulClaw);
      await button(w, "Roll attack +4").trigger("click");
      await flushPromises();
      await button(w, "Roll damage").trigger("click");
      await flushPromises();
      expect(w.find("[data-testid='rider-save']").exists()).toBe(false);

      await w.find("[data-testid='apply-damage']").trigger("click");
      const rider = w.find("[data-testid='rider-save']");
      expect(rider.text()).toContain("Then DC 10 Con save · Paralyzed (save ends)");
      // One creature saves, so there is no one to pick.
      expect(rider.find("[data-testid='target-g1']").exists()).toBe(false);

      await button(w, "Roll CON save").trigger("click");
      await flushPromises();
      const asked = mocks.res.resolveSaves.mock.calls[0][0] as { entry: StatBlockEntry; targets: RunCombatant[] };
      expect(asked.entry).toEqual(ghoulClaw);
      expect(asked.targets.map((t) => t.instance_id)).toEqual(["g1"]);

      await w.find("[data-testid='apply-save']").trigger("click");
      expect(mocks.res.applySaveOutcome).toHaveBeenCalledWith(expect.objectContaining({ entry: ghoulClaw, damageParts: [] }));
      expect(w.text()).toContain("Goblin is now Paralyzed (save ends · CON 10).");
      // A save with no damage of its own says nothing about damage.
      expect(w.find("[data-testid='rider-save']").text()).not.toContain("takes no damage");
    });

    it("asks for no save on a miss", async () => {
      mocks.res.resolveAttack.mockResolvedValue(outcome(false, ghoulClaw));
      const w = mountPanel(ghoulClaw);
      await button(w, "Roll attack +4").trigger("click");
      await flushPromises();
      expect(w.find("[data-testid='rider-save']").exists()).toBe(false);
    });

    it("comes straight after the hit when the attack deals no damage of its own", async () => {
      const web: StatBlockEntry = {
        ...ghoulClaw,
        name: "Web",
        description: "Ranged Weapon Attack. Hit: The target is restrained. If the target is a creature other than a spider, it must succeed on a DC 12 Strength saving throw or be restrained.",
        structured: {
          ...ghoulClaw.structured,
          attack: { delivery: "ranged", bonus: 5, range: { normal: 30, long: 60 }, hit: [] },
          save: { ability: "str", dc: 12, fail: [], success: "none", conditions: [{ name: "Restrained" }] },
        },
      };
      mocks.res.resolveAttack.mockResolvedValue(outcome(true, web));
      const w = mountPanel(web);
      await button(w, "Roll attack +5").trigger("click");
      await flushPromises();
      expect(w.find("[data-testid='rider-save']").text()).toContain("Then DC 12 Str save · Restrained");
      expect(w.text()).not.toContain("deals no damage of its own");
      // Nothing to roll for a zero-damage attack: the save is the whole of it.
      expect(w.find("[data-testid='roll-damage']").exists()).toBe(false);
      expect(w.text()).not.toContain("Roll damage");
      // The gating prose stands beside the save, and the DM can skip it.
      expect(w.find("[data-testid='rider-prose']").text()).toContain("other than a spider");
      await w.find("[data-testid='skip-rider-save']").trigger("click");
      expect(w.find("[data-testid='rider-save']").text()).toContain("Save skipped.");
      expect(w.find("[data-testid='roll-save']").exists()).toBe(false);
    });

    it("inherits Magical, says a failed save with no structured effect failed, and locks the ruling once applied", async () => {
      const shove: StatBlockEntry = {
        ...ghoulClaw,
        name: "Slam",
        description: "Hit: The target must succeed on a DC 12 Strength saving throw or be pushed 10 feet.",
        structured: {
          ...ghoulClaw.structured,
          attack: { delivery: "melee", bonus: 5, reach: 5, hit: [] },
          save: { ability: "str", dc: 12, fail: [], success: "none", conditions: [] },
        },
      };
      mocks.res.resolveAttack.mockResolvedValue(outcome(true, shove));
      mocks.res.resolveSaves.mockResolvedValue(failed);
      mocks.res.applySaveOutcome.mockReturnValue([
        { target: goblin, share: "none", damage: null, conditionsApplied: [], conditionsImmune: [] },
      ]);
      const w = mountPanel(shove);
      await button(w, "Roll attack +5").trigger("click");
      await flushPromises();
      const magical = w.findAllComponents(AppCheckbox).find((c) => (c.props() as Record<string, unknown>).label === "Magical");
      expect(magical).toBeDefined();
      magical?.vm.$emit("update:modelValue", true);
      await flushPromises();
      // Magical is set before the rider mounts, so the rider's own flag starts from it.
      await button(w, "Roll STR save").trigger("click");
      await flushPromises();
      await w.find("[data-testid='apply-save']").trigger("click");
      expect(mocks.res.applySaveOutcome).toHaveBeenCalledWith(expect.objectContaining({ magical: true }));
      expect(w.text()).toContain("Goblin failed the save. See the action for the effect.");
      expect(w.text()).not.toContain("is unaffected");
      // Applied: the hit/miss ruling is locked, so the save cannot be applied twice.
      expect(w.find("[data-testid='skip-rider-save']").exists()).toBe(false);
      expect(w.findComponent(RunnerAttackOutcome).props("locked")).toBe(true);
    });
  });

  it("an option chosen from an options entry rolls its own save", async () => {
    mocks.res.resolveSaves.mockResolvedValue([]);
    const w = mountPanel(scorch);
    await w.find("[data-testid='target-g1']").trigger("click");
    await w.find("[data-testid='roll-saves']").trigger("click");
    await flushPromises();
    const call = mocks.res.resolveSaves.mock.calls[0][0] as { entry: StatBlockEntry };
    expect(call.entry.name).toBe("Breath Weapons: Fire");
    expect(call.entry.structured.save?.dc).toBe(13);
  });

  describe("wiring", () => {
    const mountWith = (entry: StatBlockEntry, dmMode: "normal" | "advantage" = "advantage", silent = true) =>
      mount(RunnerResolvePanel, { props: { attacker, entry, dmMode, silent } });

    it("closes from Done", async () => {
      const w = mountPanel(claw);
      await w.get("[data-testid=resolve-done]").trigger("click");
      expect(w.emitted("close")).toHaveLength(1);
    });

    it("hands the DM's roll mode and the silent flag to the attack flow", () => {
      const flow = mountWith(claw).getComponent(RunnerAttackFlow);
      expect(flow.props("dmMode")).toBe("advantage");
      expect(flow.props("silent")).toBe(true);
    });

    it("hands the silent flag to the save flow and forwards its first roll", () => {
      const w = mountWith(scorch);
      const flow = w.getComponent(RunnerSaveFlow);
      expect(flow.props("silent")).toBe(true);
      flow.vm.$emit("first-roll");
      expect(w.emitted("first-roll")).toHaveLength(1);
    });

    it("shows the flow for the entry's kind, not for a leftover attack or save block on another kind", () => {
      const asSave: StatBlockEntry = { ...scorch, structured: { ...scorch.structured, attack: claw.structured.attack } };
      expect(mountWith(asSave).findComponent(RunnerAttackFlow).exists()).toBe(false);
      expect(mountWith(asSave).findComponent(RunnerSaveFlow).exists()).toBe(true);
      const asAttack: StatBlockEntry = { ...claw, structured: { ...claw.structured, save: scorch.structured.save } };
      expect(mountWith(asAttack).findComponent(RunnerSaveFlow).exists()).toBe(false);
      const asTrait: StatBlockEntry = { ...claw, structured: { ...claw.structured, kind: "other", save: scorch.structured.save } };
      expect(mountWith(asTrait).findComponent(RunnerSaveFlow).exists()).toBe(false);
    });
  });
});
