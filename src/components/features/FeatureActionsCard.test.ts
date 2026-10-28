import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { vRollMode } from "@/directives/vRollMode";
import FeatureActionsCard from "@/components/features/FeatureActionsCard.vue";
import type { ActionEntry, ResourcePool } from "@/rules/features/characterFeatures";
import type { FeatureEffect } from "@/rules/features/mechanics.types";
import type { PartyMember } from "@/types/party.types";

const entry = (over: Partial<ActionEntry>): ActionEntry => ({
  featureId: "f", featureName: "Feature", name: "Feature", activation: "action",
  spends: null, toggleKey: null, isSubAction: false, effect: null, effectLevel: 10, className: null, ...over,
});

const actions = ref({
  action: [entry({ featureId: "ki", featureName: "Flurry", name: "Flurry", spends: { key: "ki", amount: 1 } })],
  bonus_action: [
    entry({ featureId: "ca", featureName: "Cunning Action", name: "Disengage", activation: "bonus_action", isSubAction: true }),
    entry({ featureId: "rage", featureName: "Rage", name: "Rage", activation: "bonus_action", spends: { key: "rage", amount: 1 }, toggleKey: "rage" }),
  ],
  reaction: [],
  special: [],
});
const pools = ref<ResourcePool[]>([
  { key: "ki", label: "Ki", max: 5, recharge: "short", shortRestRegain: null, pool: true, sources: [] },
  { key: "rage", label: "Rage", max: 3, recharge: "long", shortRestRegain: null, pool: true, sources: [] },
]);

const spellcasting = ref([{ className: "Bard", dc: 15, attack: 7 }]);

const spend = vi.fn().mockResolvedValue(undefined);
const setToggle = vi.fn().mockResolvedValue(undefined);
const payable = vi.fn((_cost?: unknown) => true);
const on = ref(false);
const left = ref(3);

vi.mock("@/composables/features/useCharacterFeatures", () => ({
  useCharacterFeatures: () => ({ actions, pools, spellcasting }),
}));
const promptRoll = vi.fn();
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll }) }));
const sendRoll = vi.fn().mockResolvedValue(undefined);
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendRoll }) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/features/useFeatureUses", () => ({
  useFeatureUses: () => ({
    spend, setToggle, payable: (c: unknown) => payable(c), isOn: () => on.value,
    remaining: () => left.value, isSaving: ref(false), pools,
  }),
}));
const toastError = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: toastError, fromError: (_e: unknown, m: string) => m }),
}));

const member = { id: "pm", str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 18, proficiency_bonus: 4 } as PartyMember;

describe("FeatureActionsCard", () => {
  beforeEach(() => {
    spend.mockClear(); setToggle.mockClear(); toastError.mockClear();
    payable.mockReturnValue(true);
    on.value = false;
    left.value = 3;
  });

  it("groups by activation, skips empty groups and names sub-actions after their feature", () => {
    const w = mount(FeatureActionsCard, { props: { member } });
    const labels = w.findAll("section").map(s => s.attributes("aria-label"));
    expect(labels).toEqual(["Action", "Bonus Action"]);
    expect(w.text()).toContain("Cunning Action: Disengage");
  });

  it("shows what is left next to a row that spends", () => {
    const w = mount(FeatureActionsCard, { props: { member } });
    expect(w.text()).toContain("Ki 3/5");
    // A one-point cost is the norm and goes unremarked; only a dearer one says what it costs.
    expect(w.text()).not.toContain("Costs");
  });

  it("gives a free action no button", () => {
    const w = mount(FeatureActionsCard, { props: { member } });
    const row = w.findAll("li").find(li => li.text().includes("Disengage"))!;
    expect(row.find("button").exists()).toBe(false);
  });

  it("spends on Use", async () => {
    const w = mount(FeatureActionsCard, { props: { member } });
    await w.get('button[aria-label="Use Flurry"]').trigger("click");
    expect(spend).toHaveBeenCalledWith({ key: "ki", amount: 1 });
  });

  it("disables Use and says why when it cannot be paid", () => {
    payable.mockReturnValue(false);
    const w = mount(FeatureActionsCard, { props: { member } });
    expect(w.get('button[aria-label="Use Flurry"]').attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("No Ki left");
  });

  it("reports a spend that throws", async () => {
    spend.mockRejectedValueOnce(new Error("boom"));
    const w = mount(FeatureActionsCard, { props: { member } });
    await w.get('button[aria-label="Use Flurry"]').trigger("click");
    await Promise.resolve();
    expect(toastError).toHaveBeenCalled();
  });

  it("switches a toggle on paying its cost, and off for free", async () => {
    const w = mount(FeatureActionsCard, { props: { member } });
    await w.get('button[aria-label="Rage: off"]').trigger("click");
    expect(setToggle).toHaveBeenCalledWith("rage", true, { key: "rage", amount: 1 });
    on.value = true;
    const w2 = mount(FeatureActionsCard, { props: { member } });
    await w2.get('button[aria-label="Rage: on"]').trigger("click");
    expect(setToggle).toHaveBeenLastCalledWith("rage", false, null);
  });

  it("offers no buttons when readonly, but still shows a toggle's state", () => {
    on.value = true;
    const w = mount(FeatureActionsCard, { props: { member, readonly: true } });
    expect(w.findAll("button")).toHaveLength(0);
    expect(w.text()).toContain("On");
  });

  describe("effects", () => {
    const thunder: FeatureEffect = {
      kind: "save",
      save: { ability: "con", dc_ability: "cha", success: "none" },
      dice: { "3": "1d6", "10": "2d6" },
      damage_type: "thunder",
    };
    const original = {
      action: actions.value.action,
      bonus_action: actions.value.bonus_action,
      special: actions.value.special,
    };
    const result = (total: number, modifier: number, isCrit = false) => ({
      total, modifier, label: "", breakdown: [{ val: total - modifier, dropped: false }], isCrit, isFumble: false,
    });
    const mountWith = (entries: ActionEntry[], readonly = false) => {
      actions.value = { ...actions.value, action: entries };
      return mount(FeatureActionsCard, { props: { member, readonly }, global: { directives: { "roll-mode": vRollMode } } });
    };

    beforeEach(() => {
      promptRoll.mockReset();
      sendRoll.mockClear();
    });

    afterAll(() => {
      actions.value = { ...actions.value, ...original };
    });

    it("shows the DC and damage for this character, and rolls it labelled with the DC", async () => {
      promptRoll.mockResolvedValue(result(9, 0));
      const w = mountWith([entry({ featureId: "pb", featureName: "Psychic Blades", name: "Psychic Blades", activation: "special", effect: thunder, className: "Bard" })]);
      expect(w.text()).toContain("DC 16 Con save · 2d6 thunder");
      await w.get('button[aria-label="Psychic Blades: damage roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenCalledWith({ counts: { 6: 2 }, modifier: 0, label: "Psychic Blades · Damage (DC 16)", isDamage: true });
      expect(w.emitted("roll")?.[0]).toEqual([{ label: "Psychic Blades · Damage (DC 16)", dice: 9, modifier: 0, total: 9 }]);
    });

    it("spends once on the roll that uses it, and shows no separate Use", async () => {
      promptRoll.mockResolvedValue(result(7, 0));
      const w = mountWith([entry({ featureId: "ki", name: "Burst", effect: thunder, spends: { key: "ki", amount: 1 }, className: "Bard" })]);
      expect(w.find('button[aria-label="Use Burst"]').exists()).toBe(false);
      await w.get('button[aria-label="Burst: damage roll"]').trigger("click");
      await flushPromises();
      expect(spend).toHaveBeenCalledTimes(1);
      expect(spend).toHaveBeenCalledWith({ key: "ki", amount: 1 });
    });

    it("spends on the first roll only; Roll again is free until a new use starts", async () => {
      promptRoll.mockResolvedValue(result(7, 0));
      const w = mountWith([entry({ featureId: "ki", name: "Burst", effect: thunder, spends: { key: "ki", amount: 1 }, className: "Bard" })]);
      const roll = () => w.get('button[aria-label="Burst: damage roll"]');
      await roll().trigger("click");
      await flushPromises();
      expect(spend).toHaveBeenCalledTimes(1);
      expect(roll().text()).toBe("Roll again");
      await roll().trigger("click");
      await flushPromises();
      expect(spend).toHaveBeenCalledTimes(1);
      await w.get('button[aria-label="Burst: start a new use"]').trigger("click");
      expect(roll().text()).toBe("Damage");
      await roll().trigger("click");
      await flushPromises();
      expect(spend).toHaveBeenCalledTimes(2);
    });

    it("a toggle entry with an effect never spends on a roll and cannot roll while off", async () => {
      promptRoll.mockResolvedValue(result(7, 0));
      const w = mountWith([entry({ featureId: "fire", name: "Roaring Fire", effect: thunder, toggleKey: "fire", spends: { key: "ki", amount: 1 }, className: "Bard" })]);
      expect(w.get('button[aria-label="Roaring Fire: damage roll"]').attributes("disabled")).toBeDefined();
      expect(w.text()).toContain("Switch it on to roll.");
      on.value = true;
      const w2 = mountWith([entry({ featureId: "fire", name: "Roaring Fire", effect: thunder, toggleKey: "fire", spends: { key: "ki", amount: 1 }, className: "Bard" })]);
      const btn = w2.get('button[aria-label="Roaring Fire: damage roll"]');
      expect(btn.attributes("disabled")).toBeUndefined();
      await btn.trigger("click");
      await flushPromises();
      expect(spend).not.toHaveBeenCalled();
    });

    it("spends nothing when the roll is cancelled", async () => {
      promptRoll.mockResolvedValue(null);
      const w = mountWith([entry({ featureId: "ki", name: "Burst", effect: thunder, spends: { key: "ki", amount: 1 }, className: "Bard" })]);
      await w.get('button[aria-label="Burst: damage roll"]').trigger("click");
      await flushPromises();
      expect(spend).not.toHaveBeenCalled();
    });

    it("an attack spends on the attack roll, not on its damage, and a natural 20 doubles the dice", async () => {
      const bolt: FeatureEffect = { kind: "attack", attack: { delivery: "ranged", ability: "spell" }, dice: { "1": "2d8" }, damage_type: "force" };
      const w = mountWith([entry({ featureId: "fb", name: "Ballista", effect: bolt, spends: { key: "ki", amount: 1 }, className: "Bard" })]);
      expect(w.text()).toContain("+7 to hit · 2d8 force");
      promptRoll.mockResolvedValueOnce(result(27, 7, true));
      await w.get('button[aria-label="Ballista: attack roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenLastCalledWith({ counts: { 20: 1 }, modifier: 7, label: "Ballista · Attack", mode: "normal" });
      expect(spend).toHaveBeenCalledTimes(1);
      promptRoll.mockResolvedValueOnce(result(20, 0));
      await w.get('button[aria-label="Ballista: damage roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenLastCalledWith(expect.objectContaining({ counts: { 8: 4 }, isDamage: true }));
      expect(spend).toHaveBeenCalledTimes(1);
    });

    it("a toggle's attack never spends: the switch-on paid for it", async () => {
      on.value = true;
      const bolt: FeatureEffect = { kind: "attack", attack: { delivery: "melee", ability: "str" }, dice: { "1": "1d8" } };
      const w = mountWith([entry({ featureId: "fury", name: "Fury Strike", effect: bolt, toggleKey: "fury", spends: { key: "ki", amount: 1 } })]);
      promptRoll.mockResolvedValueOnce(result(15, 0));
      await w.get('button[aria-label="Fury Strike: attack roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenCalledTimes(1);
      expect(spend).not.toHaveBeenCalled();
    });

    it("doubles the dice for the damage that follows a natural 20 only, not for the next one", async () => {
      const bolt: FeatureEffect = { kind: "attack", attack: { delivery: "ranged", ability: "spell" }, dice: { "1": "2d8" }, damage_type: "force" };
      const w = mountWith([entry({ featureId: "fb", name: "Ballista", effect: bolt, className: "Bard" })]);
      promptRoll.mockResolvedValueOnce(result(27, 7, true));
      await w.get('button[aria-label="Ballista: attack roll"]').trigger("click");
      await flushPromises();
      promptRoll.mockResolvedValue(result(10, 0));
      await w.get('button[aria-label="Ballista: damage roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenLastCalledWith(expect.objectContaining({ counts: { 8: 4 } }));
      await w.get('button[aria-label="Ballista: damage roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenLastCalledWith(expect.objectContaining({ counts: { 8: 2 } }));
    });

    it("a cancelled attack roll clears the last natural 20: the next damage is not doubled", async () => {
      const bolt: FeatureEffect = { kind: "attack", attack: { delivery: "ranged", ability: "spell" }, dice: { "1": "2d8" }, damage_type: "force" };
      const w = mountWith([entry({ featureId: "fb", name: "Ballista", effect: bolt, className: "Bard" })]);
      promptRoll.mockResolvedValueOnce(result(27, 7, true));
      await w.get('button[aria-label="Ballista: attack roll"]').trigger("click");
      await flushPromises();
      promptRoll.mockResolvedValueOnce(null);
      await w.get('button[aria-label="Ballista: attack roll"]').trigger("click");
      await flushPromises();
      promptRoll.mockResolvedValue(result(10, 0));
      await w.get('button[aria-label="Ballista: damage roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenLastCalledWith(expect.objectContaining({ counts: { 8: 2 } }));
    });

    it("lets Roll again through after the use was paid, even when the pool has since run dry", async () => {
      promptRoll.mockResolvedValue(result(7, 0));
      const w = mountWith([entry({ featureId: "ki", name: "Burst", effect: thunder, spends: { key: "ki", amount: 1 }, className: "Bard" })]);
      const roll = () => w.get('button[aria-label="Burst: damage roll"]');
      await roll().trigger("click");
      await flushPromises();
      payable.mockReturnValue(false);
      // Nothing in the mock is reactive, so a prop flip is what makes the card read the pool again.
      await w.setProps({ readonly: true });
      await w.setProps({ readonly: false });
      expect(roll().text()).toBe("Roll again");
      expect(roll().attributes("disabled")).toBeUndefined();
      await w.get('button[aria-label="Burst: start a new use"]').trigger("click");
      expect(roll().attributes("disabled")).toBeDefined();
    });

    it("says what a multi-point cost is, ahead of what is left", () => {
      const w = mountWith([entry({ featureId: "ki", name: "Stunning", spends: { key: "ki", amount: 2 } })]);
      expect(w.text()).toContain("Costs 2. Ki 3/5");
    });

    it("rolls a flat heal straight to the chat", async () => {
      const heal: FeatureEffect = { kind: "heal", dice: { "1": "5" }, add: [{ kind: "ability", ability: "cha" }] };
      const w = mountWith([entry({ name: "Mend", effect: heal, className: "Bard" })]);
      expect(w.text()).toContain("Heals 9");
      await w.get('button[aria-label="Mend: healing roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).not.toHaveBeenCalled();
      expect(sendRoll).toHaveBeenCalledWith(expect.objectContaining({ total: 9, label: "Mend · Healing", isDamage: true }));
    });

    it("says why an effect cannot be worked out and offers no roll", () => {
      const bolt: FeatureEffect = { kind: "attack", attack: { delivery: "ranged", ability: "spell" }, dice: { "1": "1d10" } };
      const w = mountWith([entry({ name: "Zap", effect: bolt, className: "Fighter" })]);
      expect(w.text()).toContain("Needs a spellcasting class");
      expect(w.findAll("li").find(li => li.text().includes("Zap"))?.find("button").exists()).toBe(false);
      const early = mountWith([entry({ name: "Early", effect: thunder, effectLevel: 2, className: "Bard" })]);
      expect(early.text()).toContain("Available from level 3");
    });

    it("shows the numbers without buttons when readonly", () => {
      const w = mountWith([entry({ name: "Burst", effect: thunder, spends: { key: "ki", amount: 1 }, className: "Bard" })], true);
      expect(w.text()).toContain("DC 16 Con save · 2d6 thunder");
      expect(w.findAll("button")).toHaveLength(0);
    });

    it("labels temporary hit points as such, in the line, the button and the chat", async () => {
      const temp: FeatureEffect = { kind: "temp_hp", dice: { "1": "5" }, add: [{ kind: "ability", ability: "cha" }] };
      const w = mountWith([entry({ name: "Ward", effect: temp, className: "Bard" })]);
      expect(w.text()).toContain("Temporary hit points 9");
      expect(w.get('button[aria-label="Ward: temporary hit points roll"]').text()).toBe("Temp HP");
      await w.get('button[aria-label="Ward: temporary hit points roll"]').trigger("click");
      await flushPromises();
      expect(sendRoll).toHaveBeenCalledWith(expect.objectContaining({ total: 9, label: "Ward · Temporary hit points" }));
    });

    it("floors a flat amount at its minimum", async () => {
      const weak = { ...member, cha: 8 } as PartyMember;
      const flat: FeatureEffect = { kind: "heal", add: [{ kind: "ability", ability: "cha" }], min: 1 };
      actions.value = { ...actions.value, action: [entry({ name: "Mend", effect: flat, className: "Bard" })] };
      const w = mount(FeatureActionsCard, { props: { member: weak } });
      expect(w.text()).toContain("Heals 1 (minimum 1)");
      await w.get('button[aria-label="Mend: healing roll"]').trigger("click");
      await flushPromises();
      expect(sendRoll).toHaveBeenCalledWith(expect.objectContaining({ total: 1 }));
    });

    it("floors the modifier of a rolled amount, so the dice prompt and the total agree", async () => {
      const weak = { ...member, int: 6 } as PartyMember;
      const temp: FeatureEffect = { kind: "temp_hp", dice: { "1": "1d4" }, add: [{ kind: "ability", ability: "int" }], min: 3 };
      actions.value = { ...actions.value, action: [entry({ name: "Ward", effect: temp, className: "Bard" })] };
      promptRoll.mockResolvedValue(result(5, 3));
      const w = mount(FeatureActionsCard, { props: { member: weak } });
      await w.get('button[aria-label="Ward: temporary hit points roll"]').trigger("click");
      await flushPromises();
      expect(promptRoll).toHaveBeenCalledWith(expect.objectContaining({ counts: { 4: 1 }, modifier: 3 }));
      expect(w.emitted("roll")?.[0]).toEqual([expect.objectContaining({ modifier: 3, total: 5 })]);
    });

    it("spends a Wild Shape use through the reserved key, and says when none are left", async () => {
      const wild: ResourcePool = { key: "wild_shape", label: "Wild Shape", max: 2, recharge: "short", shortRestRegain: null, pool: false, sources: [] };
      pools.value = [...pools.value, wild];
      left.value = 1;
      const w = mountWith([entry({ featureId: "cow", name: "Lunar Form", spends: { key: "wild_shape", amount: 1 } })]);
      expect(w.text()).toContain("Wild Shape 1/2");
      await w.get('button[aria-label="Use Lunar Form"]').trigger("click");
      expect(spend).toHaveBeenCalledWith({ key: "wild_shape", amount: 1 });
      payable.mockReturnValue(false);
      const spent = mountWith([entry({ featureId: "cow", name: "Lunar Form", spends: { key: "wild_shape", amount: 1 } })]);
      expect(spent.text()).toContain("No Wild Shape left");
      pools.value = pools.value.filter(p => p.key !== "wild_shape");
    });

    it("keeps Use for a save that deals no damage", async () => {
      const impose: FeatureEffect = { kind: "save", save: { ability: "wis", dc_ability: "cha", success: "none" } };
      const w = mountWith([entry({ name: "Frighten", effect: impose, spends: { key: "ki", amount: 1 }, className: "Bard" })]);
      expect(w.text()).toContain("DC 16 Wis save");
      await w.get('button[aria-label="Use Frighten"]').trigger("click");
      expect(spend).toHaveBeenCalledWith({ key: "ki", amount: 1 });
    });
  });
});
