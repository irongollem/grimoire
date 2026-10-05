import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import FeatureActionsCard from "@/components/features/FeatureActionsCard.vue";
import type { ActionEntry, ResourcePool } from "@/rules/features/characterFeatures";
import type { PartyMember } from "@/types/party.types";

const entry = (over: Partial<ActionEntry>): ActionEntry => ({
  featureId: "f", featureName: "Feature", name: "Feature", activation: "action",
  spends: null, toggleKey: null, isSubAction: false, ...over,
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

const spend = vi.fn().mockResolvedValue(undefined);
const setToggle = vi.fn().mockResolvedValue(undefined);
const payable = vi.fn((_cost?: unknown) => true);
const on = ref(false);
const left = ref(3);

vi.mock("@/composables/features/useCharacterFeatures", () => ({
  useCharacterFeatures: () => ({ actions, pools }),
}));
vi.mock("@/composables/features/useFeatureUses", () => ({
  useFeatureUses: () => ({
    spend, setToggle, payable: (c: unknown) => payable(c), isOn: () => on.value,
    remaining: () => left.value, isSaving: ref(false),
  }),
}));
const toastError = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: toastError, fromError: (_e: unknown, m: string) => m }),
}));

const member = { id: "pm" } as PartyMember;

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
});
