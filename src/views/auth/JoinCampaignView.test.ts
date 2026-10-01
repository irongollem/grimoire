import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import JoinCampaignView from "./JoinCampaignView.vue";

const mocks = vi.hoisted(() => ({
  join: vi.fn(),
  invoke: vi.fn(),
  report: vi.fn(),
  switchMode: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: mocks.invoke } },
  getCurrentUser: () => null,
}));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: mocks.report }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ joinCampaignViaInvite: mocks.join }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { token: "tok" } }),
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@tanstack/vue-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isAuthenticated: true, user: { id: "u1" }, refreshMembership: vi.fn() }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({}) }));
vi.mock("@/composables/useModeSwitch", () => ({ useModeSwitch: () => ({ switchMode: mocks.switchMode }) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({
  usePlayerCampaigns: () => ({ refetch: vi.fn() }),
}));
let pool: Array<{ id: string; name: string; class: string; level: number; ruleset: string; campaign_id: string | null }> = [];
vi.mock("@/composables/party/useCharacterPool", () => ({
  useCharacterPool: () => ({
    data: ref(pool),
    isPending: ref(false),
    refetch: () => Promise.resolve({ data: pool, error: null }),
  }),
}));
vi.mock("@/lib/ageGateSession", () => ({ wasAnsweredUnder16: () => false }));

function mountView() {
  return mount(JoinCampaignView, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        SignupConsent: true,
        AgeQuestionStep: true,
        ParentRequestForm: true,
        RulesetBounceDialog: true,
      },
    },
  });
}

beforeEach(() => {
  pool = [];
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.invoke.mockResolvedValue({ error: null });
});

describe("JoinCampaignView", () => {
  it("waits for a parent on a pending join, without navigating, and emails the parents", async () => {
    mocks.join.mockResolvedValue({ status: "pending", campaignId: "c1", requestId: "r1" });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find("[data-testid='join-waiting']").text()).toContain("A parent needs to say yes");
    expect(mocks.switchMode).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenCalledWith("notify-join-request", { body: { request_id: "r1" } });
  });

  it("keeps the waiting state when the notification fails, and reports it", async () => {
    mocks.join.mockResolvedValue({ status: "pending", campaignId: "c1", requestId: "r1" });
    mocks.invoke.mockResolvedValue({ error: new Error("boom") });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.find("[data-testid='join-waiting']").exists()).toBe(true);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it("shows a PostgREST error's message", async () => {
    mocks.join.mockRejectedValue({ code: "P0001", message: "Invite has expired" });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("Invite has expired");
  });

  it("offers a converted copy instead of 'Invalid Invite' when the table refuses the edition", async () => {
    pool = [{ id: "pm1", name: "Mira", class: "Wizard", level: 3, ruleset: "2024", campaign_id: null }];
    mocks.join.mockRejectedValue({
      code: "RS001",
      message: "This table plays the 2014 rules and does not take 2024 characters",
      details: JSON.stringify({ character_ruleset: "2024", campaign_ruleset: "2014" }),
    });
    const wrapper = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain("Wizard · Level 3 · 2024");
    await wrapper.get("input[type='radio'][value='pm1']").setValue();
    const join = wrapper.findAll("button").find((b) => b.text() === "Join");
    await join?.trigger("click");
    await flushPromises();
    const dialog = wrapper.findComponent({ name: "RulesetBounceDialog" });
    expect(dialog.exists()).toBe(true);
    expect(dialog.props("campaignRuleset")).toBe("2014");
    expect(dialog.props("campaignName")).toBeNull();
    expect(wrapper.text()).not.toContain("Invalid Invite");

    dialog.vm.$emit("chooseAnother");
    await flushPromises();
    expect(wrapper.findComponent({ name: "RulesetBounceDialog" }).exists()).toBe(false);
    expect(wrapper.text()).toContain("Bring a character?");
  });
});
