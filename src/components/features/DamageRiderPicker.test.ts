import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import DamageRiderPicker from "@/components/features/DamageRiderPicker.vue";
import type { GrantedFeature, OfferedRider, ResourcePool } from "@/rules/features/characterFeatures";
import { riderDice } from "@/rules/features/resolve";
import type { DamageRider } from "@/rules/features/mechanics.types";
import type { PartyMember } from "@/types/party.types";

const sneak: DamageRider = {
  label: "Sneak Attack", dice: { kind: "scaling" }, applies_to: "finesse_or_ranged", once_per_turn: true,
};
const rage: DamageRider = {
  label: "Rage", dice: { kind: "scaling" }, applies_to: "melee_strength", once_per_turn: false, requires_toggle: "rage",
};
const smite: DamageRider = {
  label: "Divine Smite", dice: { kind: "slot", base: "2d8", base_level: 1, per_level: "1d8", max_dice: 5 },
  applies_to: "melee_strength", once_per_turn: false, cost: { kind: "spell_slot" },
};
const stunning: DamageRider = {
  label: "Ki Burst", dice: { kind: "fixed", expression: "1d4" }, applies_to: "weapon", once_per_turn: false,
  cost: { kind: "uses", key: "ki", amount: 1 },
};

const offered = ref<OfferedRider[]>([]);
const pools = ref<ResourcePool[]>([
  { key: "ki", label: "Ki", max: 5, recharge: "short", shortRestRegain: null, pool: true, sources: [] },
]);
const granted = ref<GrantedFeature[]>([]);
const spendSlot = vi.fn().mockResolvedValue(undefined);
const sendRoll = vi.fn().mockResolvedValue(undefined);
const spend = vi.fn().mockResolvedValue(undefined);
const payable = vi.fn(() => true);
const promptRoll = vi.fn();

vi.mock("@/composables/features/useCharacterFeatures", () => ({
  // Like the real one: a slot rider's dice follow the slot level asked for.
  useCharacterFeatures: () => ({
    riders: (_attack: unknown, slotLevel?: number) =>
      offered.value.map(o => ({ ...o, dice: o.rider.dice.kind === "slot" ? riderDice(o.rider, { scalingValue: null, slotLevel }) : o.dice })),
    pools,
    granted,
  }),
}));
vi.mock("@/composables/features/useFeatureUses", () => ({
  useFeatureUses: () => ({ spend, payable: () => payable() }),
}));
vi.mock("@/composables/features/useSpendFeatureSpellSlot", () => ({ useSpendFeatureSpellSlot: () => ({ mutateAsync: spendSlot }) }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendRoll }) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll }) }));
const toastError = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: toastError, fromError: (_e: unknown, m: string) => m }),
}));

const props = {
  member: {
    id: "pm", str: 16, dex: 14,
    spell_slots: [
      { level: 1, max: 4, used: 4 },
      { level: 2, max: 3, used: 2 },
      { level: 3, max: 2, used: 0 },
      { level: 4, max: 1, used: 0, pool: "temporary" },
      { level: 2, max: 2, used: 0, pool: "pact" },
    ],
  } as unknown as PartyMember,
  attack: { kind: "weapon", melee: true, finesse: true, ranged: false, usesStrength: false } as const,
  base: "1d8",
  modifier: 3,
  label: "Rapier · Damage (piercing)",
};

describe("DamageRiderPicker", () => {
  beforeEach(() => {
    spend.mockClear(); spendSlot.mockClear(); sendRoll.mockClear(); toastError.mockClear(); promptRoll.mockReset();
    payable.mockReturnValue(true);
    promptRoll.mockResolvedValue({ total: 20, modifier: 3, label: "x", breakdown: [], isCrit: false, isFumble: false });
    offered.value = [{ featureId: "rogue", rider: sneak, dice: "3d6" }];
  });

  it("lists the offered riders with their dice and a once-per-turn hint", () => {
    const w = mount(DamageRiderPicker, { props });
    expect(w.text()).toContain("Sneak Attack 3d6");
    expect(w.text()).toContain("Once per turn");
  });

  it("rolls the weapon alone as damage when nothing is ticked", async () => {
    const w = mount(DamageRiderPicker, { props });
    await w.findAll("button").find(b => b.text().startsWith("Roll"))!.trigger("click");
    await flushPromises();
    expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 8: 1 }, modifier: 3, isDamage: true }));
    expect(w.emitted("rolled")).toHaveLength(1);
  });

  it("adds a ticked rider and doubles every die on a critical hit", async () => {
    const w = mount(DamageRiderPicker, { props: { ...props, defaultCritical: true } });
    await w.findAll('input[type="checkbox"]')[0].setValue(true);
    await w.findAll("button").find(b => b.text().startsWith("Roll"))!.trigger("click");
    await flushPromises();
    expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 8: 2, 6: 6 }, modifier: 3, isDamage: true }));
  });

  it("starts a toggle rider such as Rage ticked and adds its flat bonus to the modifier", async () => {
    offered.value = [{ featureId: "barb", rider: rage, dice: "+2" }];
    const w = mount(DamageRiderPicker, { props });
    expect((w.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
    await w.findAll("button").find(b => b.text().startsWith("Roll"))!.trigger("click");
    await flushPromises();
    expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 8: 1 }, modifier: 5 }));
  });

  it("spends a rider's use after the roll is made", async () => {
    offered.value = [{ featureId: "monk", rider: stunning, dice: "1d4" }];
    const w = mount(DamageRiderPicker, { props });
    await w.findAll('input[type="checkbox"]')[0].setValue(true);
    await w.findAll("button").find(b => b.text().startsWith("Roll"))!.trigger("click");
    await flushPromises();
    expect(spend).toHaveBeenCalledWith({ key: "ki", amount: 1 });
  });

  it("spends nothing when the dice prompt is cancelled", async () => {
    promptRoll.mockResolvedValue(null);
    offered.value = [{ featureId: "monk", rider: stunning, dice: "1d4" }];
    const w = mount(DamageRiderPicker, { props });
    await w.findAll('input[type="checkbox"]')[0].setValue(true);
    await w.findAll("button").find(b => b.text().startsWith("Roll"))!.trigger("click");
    await flushPromises();
    expect(spend).not.toHaveBeenCalled();
    expect(w.emitted("rolled")).toBeUndefined();
  });

  it("refuses a rider it cannot pay for", () => {
    payable.mockReturnValue(false);
    offered.value = [{ featureId: "monk", rider: stunning, dice: "1d4" }];
    const w = mount(DamageRiderPicker, { props });
    expect(w.text()).toContain("No Ki left");
    expect((w.get('input[type="checkbox"]').element as HTMLInputElement).disabled).toBe(true);
  });

  describe("a spell-slot rider", () => {
    beforeEach(() => { offered.value = [{ featureId: "pal", rider: smite, dice: null }]; });

    async function tick(w: ReturnType<typeof mount>) {
      await w.findAll('input[type="checkbox"]')[0].setValue(true);
    }
    const rollButton = (w: ReturnType<typeof mount>) => w.findAll("button").find(b => b.text().startsWith("Roll"))!;

    it("lists only slots with a use left, from both pools, never temporary ones", async () => {
      const w = mount(DamageRiderPicker, { props });
      await tick(w);
      const options = w.findAll("option").map(o => o.text());
      expect(options).toEqual(["Level 2 (1 left)", "Level 2 (2 left), Pact Magic", "Level 3 (2 left)"]);
    });

    it("rolls the dice of the chosen slot level and spends that slot after the roll", async () => {
      const w = mount(DamageRiderPicker, { props });
      await tick(w);
      await w.get("select").setValue("spellcasting:3");
      await rollButton(w).trigger("click");
      await flushPromises();
      // 2014 Smite at 3rd level: 2d8 + 1d8 x 2 = 4d8, next to the rapier's 1d8.
      expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 8: 5 } }));
      expect(spendSlot).toHaveBeenCalledWith({ partyMemberId: "pm", slotLevel: 3, pool: "spellcasting" });
    });

    it("spends a Pact Magic slot with its own pool", async () => {
      const w = mount(DamageRiderPicker, { props });
      await tick(w);
      await w.get("select").setValue("pact:2");
      await rollButton(w).trigger("click");
      await flushPromises();
      expect(spendSlot).toHaveBeenCalledWith({ partyMemberId: "pm", slotLevel: 2, pool: "pact" });
    });

    it("spends nothing when the dice prompt is cancelled", async () => {
      promptRoll.mockResolvedValue(null);
      const w = mount(DamageRiderPicker, { props });
      await tick(w);
      await rollButton(w).trigger("click");
      await flushPromises();
      expect(spendSlot).not.toHaveBeenCalled();
    });

    it("is not offered when no slot is left", () => {
      const w = mount(DamageRiderPicker, { props: { ...props, member: { ...props.member, spell_slots: [{ level: 1, max: 1, used: 1 }] } } });
      expect(w.text()).toContain("No spell slots left.");
      expect((w.get('input[type="checkbox"]').element as HTMLInputElement).disabled).toBe(true);
    });
  });

  describe("an Unarmed Strike", () => {
    const unarmed = { ...props, attack: { kind: "unarmed" } as const, base: undefined, modifier: undefined };
    const rollButton = (w: ReturnType<typeof mount>) => w.findAll("button").find(b => b.text().startsWith("Roll"))!;
    beforeEach(() => { offered.value = []; granted.value = []; });

    it("rolls 1 + Strength with no dice and posts it to the chat", async () => {
      const w = mount(DamageRiderPicker, { props: unarmed });
      await rollButton(w).trigger("click");
      await flushPromises();
      expect(promptRoll).not.toHaveBeenCalled();
      expect(sendRoll).toHaveBeenCalledWith(expect.objectContaining({ total: 4, isDamage: true }), null, undefined);
      expect(w.emitted("rolled")).toHaveLength(1);
    });

    it("uses a Monk's Martial Arts die with the better of Strength and Dexterity", async () => {
      granted.value = [{ mechanics: { scaling: { label: "Martial Arts Die", values: {} } }, scalingValue: "d6" } as unknown as GrantedFeature];
      const w = mount(DamageRiderPicker, { props: unarmed });
      await rollButton(w).trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 6: 1 }, modifier: 3 }));
    });
  });
});
