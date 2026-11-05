import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCharacterRolls } from "./useCharacterRolls";
import { liveState } from "@/composables/encounters/useEncounterLive";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";
import { setExhaustionLevel } from "@/rules/conditions";

const h = vi.hoisted(() => ({
  promptRoll: vi.fn(),
  updateMember: vi.fn(),
  toastError: vi.fn(),
  /** What the sheet shows while the class rows load, and what they settle to. */
  jack: "none" as "none" | "any_check" | "skill_check",
  settledJack: "none" as "none" | "any_check" | "skill_check",
}));

vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll: h.promptRoll }) }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: h.updateMember }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: h.toastError, fromError: (_e: unknown, msg: string) => msg }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("@/composables/party/useJackOfAllTrades", () => ({
  useJackOfAllTrades: () => ({ jack: { get value() { return h.jack; } }, settledJack: () => Promise.resolve(h.settledJack) }),
}));
vi.mock("@/composables/party/useWildshapeForm", () => ({
  useWildshapeForm: () => ({ activeWildshape: ref(null), beastMonster: ref(null) }),
}));
vi.mock("@/composables/encounters/useEncounterLive", async () => {
  const { ref: vueRef } = await import("vue");
  return { liveState: vueRef(null) };
});
// The roll-mode pick is cleared on unmount; there is no component here.
vi.mock("vue", async (orig) => ({ ...(await orig<typeof import("vue")>()), onBeforeUnmount: () => {} }));

// DEX 14 (+2) and Alert-style initiative_bonus 5: an initiative of +7.
const member = { id: "pm-1", dex: 14, initiative_bonus: 5, conditions: [] } as unknown as PartyMember;

function encounterWith(combatants: Partial<RunCombatant>[]) {
  liveState.value = { combatants_live: combatants, current_round: 1 } as unknown as EncounterState;
}

function rolled(total: number) {
  h.promptRoll.mockResolvedValue({ total, label: "Initiative", modifier: 7, breakdown: [{ val: total - 7, dropped: false }] });
}

beforeEach(() => {
  vi.clearAllMocks();
  liveState.value = null;
  h.updateMember.mockResolvedValue(undefined);
  h.jack = "none";
  h.settledJack = "none";
});

describe("rollAbility", () => {
  const bard = { ...member, proficiency_bonus: 4 } as unknown as PartyMember;

  it("a 2014 Bard's plain ability check adds half proficiency", async () => {
    // PHB 2014 "Bard": Jack of All Trades, half proficiency (4 -> +2) on any check without proficiency.
    h.jack = "any_check";
    h.settledJack = "any_check";
    rolled(12);
    await useCharacterRolls(() => bard).rollAbility("dex", "Dexterity", 2);
    expect(h.promptRoll.mock.calls[0][0].modifier).toBe(4);
  });

  it("a 2024 Bard's plain ability check gets nothing", async () => {
    // SRD 5.2 "Bard": Jack of All Trades applies to skill checks only.
    h.jack = "skill_check";
    h.settledJack = "skill_check";
    rolled(12);
    await useCharacterRolls(() => bard).rollAbility("dex", "Dexterity", 2);
    expect(h.promptRoll.mock.calls[0][0].modifier).toBe(2);
  });

  it("waits for the class rows rather than roll a Bard's check short while they load", async () => {
    // #1147 review: the sheet still reads "none", but the rows settle to a 2014 Bard; PB 4 -> +2.
    h.jack = "none";
    h.settledJack = "any_check";
    rolled(12);
    await useCharacterRolls(() => bard).rollAbility("dex", "Dexterity", 2);
    expect(h.promptRoll.mock.calls[0][0].modifier).toBe(4);
  });

  it("names the check's total for the ability table only when Jack of All Trades adds to it", () => {
    h.jack = "any_check";
    expect(useCharacterRolls(() => bard).abilityCheckBonus.value).toEqual({ amount: 2, source: "Jack of All Trades" });
    h.jack = "skill_check";
    expect(useCharacterRolls(() => bard).abilityCheckBonus.value).toBeNull();
  });
});

describe("rollInitiative with Jack of All Trades", () => {
  it("waits for the class rows, so a 2014 Bard's initiative is not rolled short", async () => {
    // PHB 2014: initiative is a Dexterity check. DEX +2, initiative_bonus 5, half of PB 3 is 1.
    h.settledJack = "any_check";
    rolled(18);
    await useCharacterRolls(() => ({ ...member, proficiency_bonus: 3 })).rollInitiative();
    expect(h.promptRoll.mock.calls[0][0].modifier).toBe(8);
  });
});

describe("rollInitiative", () => {
  it("rolls d20 + DEX mod + initiative_bonus and posts it to chat", async () => {
    rolled(18);
    await useCharacterRolls(() => member).rollInitiative();
    const args = h.promptRoll.mock.calls[0][0];
    expect(args.modifier).toBe(7);
    expect(args.silent).toBeFalsy();
  });

  it("Poisoned rolls it with disadvantage, as a DEX check", async () => {
    // SRD 5.2 "Poisoned": disadvantage on attack rolls and ability checks; initiative is a DEX check.
    rolled(10);
    const poisoned = { ...member, conditions: [{ name: "Poisoned" }] } as unknown as PartyMember;
    await useCharacterRolls(() => poisoned).rollInitiative();
    expect(h.promptRoll.mock.calls[0][0].mode).toBe("disadvantage");
  });

  it("takes the 2024 Exhaustion penalty, as every d20 Test does", async () => {
    // SRD 5.2 "Exhaustion": each level takes 2 from every d20 Test. Level 2 on +7 leaves +3.
    rolled(10);
    const tired = { ...member, conditions: setExhaustionLevel([], 2) } as unknown as PartyMember;
    await useCharacterRolls(() => tired).rollInitiative();
    expect(h.promptRoll.mock.calls[0][0].modifier).toBe(3);
  });

  it("sends the total to the running encounter when the character has no initiative there yet", async () => {
    rolled(18);
    encounterWith([{ party_member_id: "pm-1", initiative: null }]);
    await useCharacterRolls(() => member).rollInitiative();
    expect(h.updateMember).toHaveBeenCalledWith({ id: "pm-1", update: { current_initiative: 18 } });
  });

  it("leaves an initiative already in the fight alone, so a second roll cannot reorder it", async () => {
    rolled(18);
    encounterWith([{ party_member_id: "pm-1", initiative: 4 }]);
    await useCharacterRolls(() => member).rollInitiative();
    expect(h.updateMember).not.toHaveBeenCalled();
  });

  it("writes nothing when the character is not in the encounter", async () => {
    rolled(18);
    encounterWith([{ party_member_id: "someone-else", initiative: null }]);
    await useCharacterRolls(() => member).rollInitiative();
    expect(h.updateMember).not.toHaveBeenCalled();
  });

  it("writes nothing, and reports nothing, when the physical-dice prompt is cancelled", async () => {
    h.promptRoll.mockResolvedValue(null);
    encounterWith([{ party_member_id: "pm-1", initiative: null }]);
    await useCharacterRolls(() => member).rollInitiative();
    expect(h.updateMember).not.toHaveBeenCalled();
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("toasts when the encounter write fails", async () => {
    rolled(18);
    encounterWith([{ party_member_id: "pm-1", initiative: null }]);
    h.updateMember.mockRejectedValue(new Error("denied"));
    await useCharacterRolls(() => member).rollInitiative();
    expect(h.toastError).toHaveBeenCalled();
  });
});
