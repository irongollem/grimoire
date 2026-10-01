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
}));

vi.mock("@/composables/rules/useOptionalRules", () => ({
  useOptionalRules: () => ({ data: { value: [] } }),
  useUpsertCampaignRule: () => ({ mutateAsync: vi.fn() }),
  isRuleEffectivelyEnabled: () => false,
  resolveRuleConfig: () => ({}),
}));
vi.mock("@/rules/optionalRules", () => ({ listOptionalRules: () => [] }));
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
