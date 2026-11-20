import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TemplateGallery from "./TemplateGallery.vue";
import { SCRIPTORIUM_TEMPLATES } from "@/scriptorium/data/templates";

const mocks = vi.hoisted(() => ({ startBook: vi.fn(), startBookFromCampaign: vi.fn(), canCreate: { value: true }, campaignId: "camp-1" as string | null }));
vi.mock("@/scriptorium/composables/useStartScriptoriumDocument", () => ({
  useStartScriptoriumDocument: () => ({ startBook: mocks.startBook, startBookFromCampaign: mocks.startBookFromCampaign, isStarting: ref(false) }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: mocks.campaignId }) }));
vi.mock("pinia", async (importOriginal) => ({ ...(await importOriginal<typeof import("pinia")>()), storeToRefs: (s: { activeCampaignId: string | null }) => ({ activeCampaignId: ref(s.activeCampaignId) }) }));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: mocks.canCreate }) }));

const mountGallery = () =>
  mount(TemplateGallery, { global: { stubs: { PaywallModal: { props: ["modelValue"], template: '<i data-testid="paywall" :data-open="modelValue" />' } } } });

describe("TemplateGallery", () => {
  beforeEach(() => {
    mocks.startBook.mockReset().mockResolvedValue("book-id");
    mocks.startBookFromCampaign.mockReset().mockResolvedValue("drawn-id");
    mocks.campaignId = "camp-1";
    mocks.canCreate.value = true;
  });

  it("picking a template creates the book from it and says so, leaving navigation to the view", async () => {
    const w = mountGallery();
    await w.findAll("button").find((b) => b.text().includes(SCRIPTORIUM_TEMPLATES[0].name))!.trigger("click");
    await flushPromises();
    expect(mocks.startBook).toHaveBeenCalledWith(SCRIPTORIUM_TEMPLATES[0]);
    expect(w.emitted("created")).toEqual([["book-id"]]);
  });

  it("creates nothing and shows the paywall when the quota is spent", async () => {
    mocks.canCreate.value = false;
    const w = mountGallery();
    await w.findAll("button")[0].trigger("click");
    await flushPromises();
    expect(mocks.startBook).not.toHaveBeenCalled();
    expect(w.emitted("created")).toBeUndefined();
    expect(w.get('[data-testid="paywall"]').attributes("data-open")).toBe("true");
  });

  it("says why when creating fails and emits nothing", async () => {
    mocks.startBook.mockRejectedValue(new Error("Offline"));
    const w = mountGallery();
    await w.findAll("button")[0].trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Offline");
    expect(w.emitted("created")).toBeUndefined();
  });

  const openChoice = async (w: ReturnType<typeof mountGallery>) => {
    await w.findAll("button").find((b) => b.text().includes("From this campaign"))!.trigger("click");
  };

  it("draws a book from the campaign for the audience chosen, and says so", async () => {
    const w = mountGallery();
    await openChoice(w);
    await w.findAll("button").find((b) => b.text() === "For the players")!.trigger("click");
    await flushPromises();
    expect(mocks.startBookFromCampaign).toHaveBeenCalledWith("players");
    expect(w.emitted("created")).toEqual([["drawn-id"]]);
  });

  it("offers no campaign book without an active campaign", () => {
    mocks.campaignId = null;
    expect(mountGallery().text()).not.toContain("From this campaign");
  });

  it("draws nothing and shows the paywall when the quota is spent", async () => {
    mocks.canCreate.value = false;
    const w = mountGallery();
    await openChoice(w);
    await w.findAll("button").find((b) => b.text() === "For the DM")!.trigger("click");
    await flushPromises();
    expect(mocks.startBookFromCampaign).not.toHaveBeenCalled();
    expect(w.get('[data-testid="paywall"]').attributes("data-open")).toBe("true");
  });

  it("says why when drawing fails", async () => {
    mocks.startBookFromCampaign.mockRejectedValue(new Error("Set the Open Book up first"));
    const w = mountGallery();
    await openChoice(w);
    await w.findAll("button").find((b) => b.text() === "For the players")!.trigger("click");
    await flushPromises();
    expect(w.text()).toContain("Set the Open Book up first");
    expect(w.emitted("created")).toBeUndefined();
  });
});
