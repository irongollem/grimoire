import { flushPromises, mount } from "@vue/test-utils";
import type { Directive } from "vue";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import PlayerCombatTab from "./PlayerCombatTab.vue";
import type { PartyMember } from "@/types/party.types";
import type { PlayerVisibleMonster } from "@/types/monster.types";
import type { StatBlockEntry } from "@/types/statBlock.types";

const promptRoll = vi.fn();

vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll }) }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendRoll: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/items/usePartyInventory", () => ({ usePartyInventory: () => ({ data: ref([]) }) }));
vi.mock("@/composables/items/useItems", () => ({ usePlayerItemProjection: () => ({ data: ref(null) }) }));
vi.mock("@/composables/items/useStoredItemRefs", () => ({ useStoredItemRefs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/encounters/useAmmoConsumption", () => ({ useAmmoConsumption: () => ({ consumeAmmo: vi.fn(), consumeWeaponCharge: vi.fn() }) }));
vi.mock("@/composables/encounters/useThrownWeapon", () => ({ useThrownWeapon: () => ({ throwWeapon: vi.fn() }) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useRuleset: () => ({ ruleset: ref("2024") }) }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }) }));

// The real directive wires long-press and right-click; a click is all this test needs.
const rollMode: Directive = {
  mounted(el, binding) {
    el.addEventListener("click", () => {
      const handler = typeof binding.value === "function" ? binding.value : binding.value.on;
      handler(null, new Event("click"));
    });
  },
};

const member = { id: "m1", name: "Wren", str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10, proficiency_bonus: 2, conditions: [] } as unknown as PartyMember;

function entry(name: string, structured: StatBlockEntry["structured"]): StatBlockEntry {
  return { name, description: `${name} prose with +9 to hit and 9d9 damage that must be ignored.`, structured };
}

function mountBeast(actions: StatBlockEntry[]) {
  const wildshapeMonster = { id: "w1", name: "Wolf", stat_block: { actions } } as unknown as PlayerVisibleMonster;
  return mount(PlayerCombatTab, {
    props: { member, attackDisadvantage: false, attackPenalty: 0, checkDisadvantage: false, checkPenalty: 0, wildshapeMonster },
    global: {
      directives: { "roll-mode": rollMode },
      stubs: { PlayerLoadout: true, PlayerCustomAttacks: true, FeatureActionsCard: true, DamageRiderPicker: true, PlayerRollModeControl: true },
    },
  });
}

describe("PlayerCombatTab beast actions", () => {
  it("rolls the attack from the structured bonus, not the prose", async () => {
    promptRoll.mockResolvedValue({ total: 15, modifier: 4, label: "x", breakdown: [{ val: 11, dropped: false }], isCrit: false });
    const w = mountBeast([entry("Bite", { kind: "attack", attack: { delivery: "melee", bonus: 4, hit: [{ dice: "2d6+2", type: "piercing" }] }, source: "parsed" })]);
    expect(w.text()).toContain("+4");
    await w.findAll("button").find((b) => b.text().includes("Attack"))?.trigger("click");
    expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 20: 1 }, modifier: 4 }));
  });

  it("rolls every hit part as one damage roll", async () => {
    promptRoll.mockClear();
    promptRoll.mockResolvedValue({ total: 12, modifier: 3, label: "x", breakdown: [], isCrit: false });
    const w = mountBeast([
      entry("Bite", { kind: "attack", attack: { delivery: "melee", bonus: 4, hit: [{ dice: "2d6+3", type: "piercing" }, { dice: "2d6", type: "poison" }] }, source: "parsed" }),
    ]);
    const damage = w.findAll("button").find((b) => b.text().includes("Damage"));
    expect(damage?.text()).toContain("2d6+3 piercing + 2d6 poison");
    await damage?.trigger("click");
    await flushPromises();
    expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 6: 4 }, modifier: 3 }));
  });

  it("shows a save as a label with no roll button", () => {
    const w = mountBeast([entry("Breath", { kind: "save", save: { ability: "dex", dc: 14, fail: [], success: "none", conditions: [] }, source: "parsed" })]);
    expect(w.text()).toContain("DC 14 Dex");
    expect(w.findAll("button").filter((b) => b.text().includes("Attack") || b.text().includes("Damage"))).toHaveLength(0);
  });

  it("offers no buttons for an other entry or one flagged for review", () => {
    const w = mountBeast([
      entry("Pack Tactics", { kind: "other", source: "parsed" }),
      entry("Odd", { kind: "other", source: "extracted", review: "bonus not in prose" }),
    ]);
    expect(w.findAll("button").filter((b) => b.text().includes("Attack") || b.text().includes("Damage"))).toHaveLength(0);
  });
});
