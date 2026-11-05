import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCalendarAdapter } from "@/settings/index";
import NewCampaignModal from "./NewCampaignModal.vue";

/** The edition is asked first (#943), with the choice of letting both editions sit down. */
const mocks = vi.hoisted(() => ({ createCampaign: vi.fn(), claim: vi.fn() }));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useCreateCampaign: () => ({ mutateAsync: mocks.createCampaign, isPending: { value: false } }),
  useClaimOrphanedData: () => ({ mutateAsync: mocks.claim }),
}));

const stubs = {
  AppModal: { template: "<div><slot /></div>" },
  ModalHeader: true,
  CalendarEditor: true,
  DemoCampaignOffer: true,
  PaywallModal: true,
};

function mountModal(props: { showClaimOption?: boolean } = {}) {
  return mount(NewCampaignModal, { props: { modelValue: true, ...props }, global: { stubs } });
}

async function chooseCalendar(wrapper: ReturnType<typeof mountModal>, id: string) {
  await wrapper.find("select").setValue(id);
}

beforeEach(() => {
  mocks.createCampaign.mockReset();
  mocks.claim.mockReset();
  mocks.createCampaign.mockResolvedValue({ id: "c1" });
});

describe("NewCampaignModal", () => {
  it("renders the edition before the name", () => {
    const text = mountModal().text();
    expect(text.indexOf("RULES EDITION")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("RULES EDITION")).toBeLessThan(text.indexOf("NAME"));
  });

  it("starts with no edition chosen and cannot create a campaign without one", async () => {
    const wrapper = mountModal();
    expect(wrapper.findAll('[role="radio"]').map((option) => option.attributes("aria-checked"))).toEqual(["false", "false"]);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.createCampaign).not.toHaveBeenCalled();
  });

  it("submits the chosen edition and the mixed-edition choice", async () => {
    const wrapper = mountModal();
    await wrapper.findAll('[role="radio"]')[1].trigger("click");
    await chooseCalendar(wrapper, "gregorian");
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const [payload] = mocks.createCampaign.mock.calls[0] as [{ ruleset: string; allows_mixed_rulesets: boolean }];
    expect(payload.ruleset).toBe("2024");
    expect(payload.allows_mixed_rulesets).toBe(true);
  });

  it("defaults to a single-edition table", async () => {
    const wrapper = mountModal();
    await wrapper.findAll('[role="radio"]')[0].trigger("click");
    await chooseCalendar(wrapper, "gregorian");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const [payload] = mocks.createCampaign.mock.calls[0] as [{ allows_mixed_rulesets: boolean }];
    expect(payload.allows_mixed_rulesets).toBe(false);
  });

  async function submitWithEdition(wrapper: ReturnType<typeof mountModal>) {
    await wrapper.findAll('[role="radio"]')[0].trigger("click");
    await chooseCalendar(wrapper, "gregorian");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
  }

  it("closes and hands back the new campaign, saving an unnamed world as no world", async () => {
    const wrapper = mountModal();
    await submitWithEdition(wrapper);
    expect(wrapper.emitted("created")).toEqual([[{ id: "c1" }]]);
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
    // Bug it fails on: an invented "Custom Setting" written into a world the DM never named.
    const [payload] = mocks.createCampaign.mock.calls[0] as [{ setting: string | null }];
    expect(payload.setting).toBeNull();
  });

  it("starts with no calendar chosen and cannot create a campaign without one", async () => {
    // Bug it fails on: a preselected calendar made every new campaign a Forgotten Realms one.
    const wrapper = mountModal();
    expect(wrapper.find("select").text()).toContain("Choose a calendar");
    await wrapper.findAll('[role="radio"]')[0].trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.createCampaign).not.toHaveBeenCalled();
    await wrapper.find("select").setValue("eberron");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.createCampaign).toHaveBeenCalledTimes(1);
  });

  it("takes the year from the chosen calendar and offers the blank calendar by a plain name", async () => {
    const wrapper = mountModal();
    await wrapper.find("select").setValue("eberron");
    const eberronYear = getCalendarAdapter("eberron").defaultYear;
    expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe(String(eberronYear));
    expect(wrapper.find("select").text()).toContain("Blank calendar (make your own)");
    await wrapper.findAll('[role="radio"]')[0].trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const [payload] = mocks.createCampaign.mock.calls[0] as [{ calendar_id: string; current_year: number }];
    expect(payload).toMatchObject({ calendar_id: "eberron", current_year: eberronYear });
  });

  it("claims the DM's orphaned data into the new campaign only when asked to offer it", async () => {
    await submitWithEdition(mountModal({ showClaimOption: true }));
    expect(mocks.claim).toHaveBeenCalledWith("c1");
    mocks.claim.mockReset();
    await submitWithEdition(mountModal());
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("answers the campaign limit with the paywall instead of a created campaign", async () => {
    mocks.createCampaign.mockRejectedValue(new Error("quota_exceeded"));
    const wrapper = mountModal();
    await submitWithEdition(wrapper);
    expect(wrapper.emitted("created")).toBeUndefined();
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });
});
