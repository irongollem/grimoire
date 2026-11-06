import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCalendarAdapter } from "@/settings/index";
import { defaultCurrencyFor } from "@/systems/registry";
import NewCampaignModal from "./NewCampaignModal.vue";

/** The game system is asked first (#943, #934), with the choice of letting a compatible system's characters sit down. */
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
  it("renders the game system before the name", () => {
    const text = mountModal().text();
    expect(text.indexOf("GAME SYSTEM")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("GAME SYSTEM")).toBeLessThan(text.indexOf("NAME"));
    expect(text).not.toContain("RULES EDITION");
  });

  it("offers every game system, none chosen, and cannot create a campaign without one", async () => {
    const wrapper = mountModal();
    expect(wrapper.findAll('[role="radio"]').map((option) => option.attributes("aria-checked"))).toEqual(["false", "false", "false"]);
    await chooseCalendar(wrapper, "gregorian");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.createCampaign).not.toHaveBeenCalled();
  });

  it("submits the chosen game system and the mixed-characters choice", async () => {
    const wrapper = mountModal();
    await wrapper.findAll('[role="radio"]')[1].trigger("click");
    await chooseCalendar(wrapper, "gregorian");
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const [payload] = mocks.createCampaign.mock.calls[0] as [{ game_system: string; allows_mixed_rulesets: boolean }];
    expect(payload.game_system).toBe("dnd5e-2024");
    expect(payload.allows_mixed_rulesets).toBe(true);
    expect(payload).not.toHaveProperty("ruleset");
  });

  it("names the compatible system in the mixed-characters choice", async () => {
    const wrapper = mountModal();
    await wrapper.findAll('[role="radio"]')[0].trigger("click");
    expect(wrapper.text()).toContain("Allow characters built for D&D 5e (2024)");
  });

  // Fails if the currency is left to the database default: a Generic campaign would start with the five 5e coins.
  it("starts a campaign with its system's coins", async () => {
    const generic = mountModal();
    await generic.findAll('[role="radio"]')[2].trigger("click");
    await chooseCalendar(generic, "gregorian");
    await generic.find("form").trigger("submit");
    await flushPromises();
    const [genericPayload] = mocks.createCampaign.mock.calls[0] as [{ currency: { denominations: unknown[] } }];
    expect(genericPayload.currency).toEqual(defaultCurrencyFor("generic"));
    expect(genericPayload.currency.denominations).toHaveLength(1);

    mocks.createCampaign.mockClear();
    const fiveE = mountModal();
    await fiveE.findAll('[role="radio"]')[0].trigger("click");
    await chooseCalendar(fiveE, "gregorian");
    await fiveE.find("form").trigger("submit");
    await flushPromises();
    const [fiveEPayload] = mocks.createCampaign.mock.calls[0] as [{ currency: unknown }];
    expect(fiveEPayload.currency).toEqual(defaultCurrencyFor("dnd5e-2014"));
  });

  // Fails if the mixed toggle shows for Generic, or a box ticked under 5e follows the DM to Generic (the database refuses it).
  it("offers no mixed-characters choice for Generic and never sends one", async () => {
    const wrapper = mountModal();
    await wrapper.findAll('[role="radio"]')[0].trigger("click");
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.findAll('[role="radio"]')[2].trigger("click");
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    await chooseCalendar(wrapper, "gregorian");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    const [payload] = mocks.createCampaign.mock.calls[0] as [{ game_system: string; allows_mixed_rulesets: boolean }];
    expect(payload.game_system).toBe("generic");
    expect(payload.allows_mixed_rulesets).toBe(false);
  });

  it("defaults to a single-system table", async () => {
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
