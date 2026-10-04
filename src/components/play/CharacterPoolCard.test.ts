import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CharacterPoolCard from "./CharacterPoolCard.vue";
import type { PartyMember } from "@/types/party.types";
import type { Campaign } from "@/types/campaign.types";

const attach = vi.fn();
const toastError = vi.fn();
const toastInfo = vi.fn();
const refetchReviews = vi.fn();

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: vi.fn(), info: toastInfo, error: toastError, fromError: (e: unknown) => String(e) }),
}));
vi.mock("@/composables/party/useCharacterContentReviews", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/composables/party/useCharacterContentReviews")>();
  return { ...actual, useCharacterContentReviews: () => ({ refetch: refetchReviews }) };
});
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({}) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({}) }));
vi.mock("@/composables/party/useCharacterPool", () => ({
  useAttachCharacter: () => ({ mutateAsync: attach, isPending: false }),
  useDetachCharacter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCloneCharacter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePoolCharacter: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const character = { id: "pm1", name: "Mira", class: "Wizard", level: 3, ruleset: "2024", portrait_url: null } as unknown as PartyMember;
const strict = { id: "c14", name: "Old Keep", ruleset: "2014", allows_mixed_rulesets: false } as Campaign;
const open = { id: "c24", name: "New Keep", ruleset: "2024", allows_mixed_rulesets: false } as Campaign;

function mountCard() {
  return mount(CharacterPoolCard, {
    props: { character, attachedCampaign: null, availableCampaigns: [strict, open], waitingCount: 0 },
    global: { stubs: { FocalImage: true, RulesetBounceDialog: true } },
  });
}

async function openPicker(wrapper: ReturnType<typeof mountCard>) {
  await wrapper.findAll("button").find((b) => b.text() === "Attach")?.trigger("click");
}

function tableButton(wrapper: ReturnType<typeof mountCard>, name: string) {
  const found = wrapper.findAll("button").find((b) => b.text().includes(name));
  if (!found) throw new Error(`No table ${name}`);
  return found;
}

describe("CharacterPoolCard editions", () => {
  beforeEach(() => {
    attach.mockReset();
    toastError.mockReset();
    toastInfo.mockReset();
    refetchReviews.mockReset();
  });

  it("shows the character's edition and each table's", async () => {
    const wrapper = mountCard();
    expect(wrapper.text()).toContain("Level 3 · 2024");
    await openPicker(wrapper);
    expect(wrapper.text()).toContain("Old Keep · plays the 2014 rules");
    expect(wrapper.text()).toContain("New Keep · 2024");
  });

  it("opens the bounce dialog without attaching when the table will not take the character", async () => {
    const wrapper = mountCard();
    await openPicker(wrapper);
    await tableButton(wrapper, "Old Keep").trigger("click");
    expect(attach).not.toHaveBeenCalled();
    const dialog = wrapper.findComponent({ name: "RulesetBounceDialog" });
    expect(dialog.props("campaignRuleset")).toBe("2014");
    expect(dialog.props("campaignName")).toBe("Old Keep");
  });

  it("attaches directly to an admissible table", async () => {
    attach.mockResolvedValue(undefined);
    const wrapper = mountCard();
    await openPicker(wrapper);
    await tableButton(wrapper, "New Keep").trigger("click");
    expect(attach).toHaveBeenCalledWith({ partyMemberId: "pm1", campaignId: "c24" });
  });

  it("opens the dialog when an attach is refused anyway, and toasts any other failure", async () => {
    attach.mockRejectedValueOnce({
      code: "RS001",
      details: JSON.stringify({ character_ruleset: "2024", campaign_ruleset: "2014" }),
    });
    const wrapper = mountCard();
    await openPicker(wrapper);
    await tableButton(wrapper, "New Keep").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent({ name: "RulesetBounceDialog" }).exists()).toBe(true);
    expect(toastError).not.toHaveBeenCalled();

    attach.mockRejectedValueOnce(new Error("nope"));
    const second = mountCard();
    await openPicker(second);
    await tableButton(second, "New Keep").trigger("click");
    await flushPromises();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("says so when the table benched the character it just attached", async () => {
    attach.mockResolvedValue(undefined);
    refetchReviews.mockResolvedValue({ data: [{ status: "pending" }, { status: "approved" }] });
    const wrapper = mountCard();
    await openPicker(wrapper);
    await tableButton(wrapper, "New Keep").trigger("click");
    await flushPromises();
    expect(toastInfo).toHaveBeenCalledWith(
      "Mira joined New Keep, but 1 choice is waiting for the DM's approval. They cannot be made active yet.",
    );
  });

  it("stays quiet when nothing is waiting after the attach", async () => {
    attach.mockResolvedValue(undefined);
    refetchReviews.mockResolvedValue({ data: [] });
    const wrapper = mountCard();
    await openPicker(wrapper);
    await tableButton(wrapper, "New Keep").trigger("click");
    await flushPromises();
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("marks an attached character that is waiting", () => {
    const wrapper = mount(CharacterPoolCard, {
      props: { character, attachedCampaign: open, availableCampaigns: [], waitingCount: 1 },
      global: { stubs: { FocalImage: true, RulesetBounceDialog: true } },
    });
    expect(wrapper.get("[data-testid='waiting-marker']").text()).toBe("Waiting for approval");
  });
});
