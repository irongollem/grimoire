import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RulesTab from "./RulesTab.vue";
import type { PartyMember } from "@/types/party.types";

/** The Rules tab lists characters on the other edition and surfaces a failed save (#943). */
const mocks = vi.hoisted(() => ({
  updateCampaign: vi.fn(),
  toastError: vi.fn(),
  party: [] as Array<Pick<PartyMember, "id" | "name" | "ruleset" | "owner_user_id">>,
  active: { id: "c1", ruleset: "2024", allows_mixed_rulesets: false },
  upsert: vi.fn(),
  stored: [] as Array<{ rule_key: string; enabled: boolean; config: Record<string, number> | null }>,
  defs: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/composables/rules/useOptionalRules", () => ({
  useOptionalRules: () => ({ data: { get value() { return mocks.stored; } } }),
  useUpsertCampaignRule: () => ({ mutateAsync: mocks.upsert }),
  isRuleEffectivelyEnabled: (rows: typeof mocks.stored, key: string) => rows.find((r) => r.rule_key === key)?.enabled ?? false,
  resolveRuleConfig: (rows: typeof mocks.stored, key: string) => rows.find((r) => r.rule_key === key)?.config ?? {},
}));
vi.mock("@/rules/optionalRules", () => ({ listOptionalRules: () => mocks.defs }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useUpdateCampaign: () => ({ mutateAsync: mocks.updateCampaign }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: { value: mocks.party } }),
}));
vi.mock("@/composables/party/useCharacterRuleset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/party/useCharacterRuleset")>()),
  useConvertCharacterRuleset: () => ({ mutateAsync: vi.fn(), isPending: { value: false } }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaign: mocks.active, switchToCampaign: vi.fn() }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    error: mocks.toastError,
    success: vi.fn(),
    fromError: (e: unknown) => (e instanceof Error ? e.message : "failed"),
  }),
}));

beforeEach(() => {
  mocks.upsert.mockReset();
  mocks.stored = [];
  mocks.defs = [];
  mocks.active = { id: "c1", ruleset: "2024", allows_mixed_rulesets: false };
  mocks.updateCampaign.mockReset();
  mocks.toastError.mockClear();
  mocks.party = [
    { id: "a", name: "Matching", ruleset: "2024", owner_user_id: "u1" },
    { id: "b", name: "Orphan", ruleset: "2014", owner_user_id: null },
    { id: "c", name: "Owned", ruleset: "2014", owner_user_id: "u2" },
  ];
});

describe("RulesTab", () => {
  it("lists only characters on the other edition", () => {
    const text = mount(RulesTab).text();
    expect(text).toContain("Orphan");
    expect(text).toContain("Owned");
    expect(text).not.toContain("Matching");
  });

  it("offers Convert only for a character nobody owns", () => {
    const wrapper = mount(RulesTab);
    const rows = wrapper.findAll("li");
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("Convert to");
    expect(rows[1].text()).not.toContain("Convert to");
    expect(rows[1].text()).toContain("Its player converts this character.");
  });

  it("hides the list when every character matches", () => {
    mocks.party = [{ id: "a", name: "Matching", ruleset: "2024", owner_user_id: null }];
    expect(mount(RulesTab).text()).not.toContain("Characters on the other edition");
  });

  it("toasts when saving the edition fails", async () => {
    mocks.updateCampaign.mockRejectedValue(new Error("nope"));
    const wrapper = mount(RulesTab);
    await wrapper.find('[role="radio"]:not([aria-checked="true"])').trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalledWith("nope");
  });
});

describe("RulesTab optional rules", () => {
  const timer = {
    key: "turn_timer",
    name: "Turn timer",
    summary: "A clock on each turn.",
    config: [{ key: "seconds", label: "Seconds", type: "number", default: 60, min: 10, max: 120, unit: "seconds" }],
  };

  beforeEach(() => {
    mocks.party = [];
    mocks.defs = [timer];
    mocks.stored = [{ rule_key: "turn_timer", enabled: true, config: { seconds: 45 } }];
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("turning a rule off keeps the DM's tuned numbers", async () => {
    const wrapper = mount(RulesTab);
    await wrapper.get('button[aria-label="Disable Turn timer"], [aria-label="Disable Turn timer"]').trigger("click");
    await flushPromises();
    expect(mocks.upsert).toHaveBeenCalledWith({ ruleKey: "turn_timer", enabled: false, config: { seconds: 45 } });
  });

  it("shows a rule's settings only while it is on", () => {
    expect(mount(RulesTab).find('input[type="number"]').exists()).toBe(true);
    mocks.stored = [{ rule_key: "turn_timer", enabled: false, config: { seconds: 45 } }];
    expect(mount(RulesTab).find('input[type="number"]').exists()).toBe(false);
  });

  it.each([
    ["500", 120],
    ["3", 10],
    ["59.6", 60],
  ])("saves %s seconds as %i, held inside the rule's limits and rounded", async (typed, saved) => {
    const wrapper = mount(RulesTab);
    const input = wrapper.get('input[type="number"]');
    await input.setValue(typed);
    await input.trigger("change");
    await flushPromises();
    expect(mocks.upsert).toHaveBeenCalledWith({ ruleKey: "turn_timer", enabled: true, config: { seconds: saved } });
  });
});

describe("RulesTab edition changes", () => {
  it("does not save when the edition clicked is the one already in force", async () => {
    mocks.party = [];
    const wrapper = mount(RulesTab);
    await wrapper.get('[role="radio"][aria-checked="true"]').trigger("click");
    await flushPromises();
    expect(mocks.updateCampaign).not.toHaveBeenCalled();
  });

  it("saves the other edition on the active campaign", async () => {
    mocks.party = [];
    mocks.updateCampaign.mockResolvedValue({ id: "c1" });
    const wrapper = mount(RulesTab);
    await wrapper.get('[role="radio"]:not([aria-checked="true"])').trigger("click");
    await flushPromises();
    expect(mocks.updateCampaign).toHaveBeenCalledWith({ id: "c1", update: { ruleset: "2014" } });
  });

  it("saves the both-editions switch as a flag on the campaign", async () => {
    mocks.party = [];
    mocks.updateCampaign.mockResolvedValue({ id: "c1" });
    const wrapper = mount(RulesTab);
    await wrapper.get('[aria-label="Allow both editions"]').trigger("click");
    await flushPromises();
    expect(mocks.updateCampaign).toHaveBeenCalledWith({ id: "c1", update: { allows_mixed_rulesets: true } });
  });
});
