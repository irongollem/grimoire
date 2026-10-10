// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
