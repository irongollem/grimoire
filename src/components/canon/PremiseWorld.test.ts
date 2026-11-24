import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import type { Campaign } from "@/types/campaign.types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), switchTo: vi.fn(), toastError: vi.fn() }));
vi.mock("@/composables/campaign/useCampaigns", () => ({ useUpdateCampaign: () => ({ mutateAsync: mocks.update }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ switchToCampaign: mocks.switchTo }) }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.toastError, fromError: () => "Could not save" } }));

import PremiseWorld from "./PremiseWorld.vue";

const campaign = { id: "c1", setting: "Eberron" } as Campaign;

async function edit(w: ReturnType<typeof mount>, value: string) {
  await w.find("input").setValue(value);
  await w.find("input").trigger("change");
  await flushPromises();
}

describe("PremiseWorld", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.update.mockResolvedValue({ id: "c1" });
  });

  it("saves nothing for an edit that leaves the name as it was (spaces aside)", async () => {
    await edit(mount(PremiseWorld, { props: { campaign } }), "  Eberron ");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves a new name trimmed, and tells the campaign store", async () => {
    await edit(mount(PremiseWorld, { props: { campaign } }), " Ravenloft ");
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", update: { setting: "Ravenloft" } });
    expect(mocks.switchTo).toHaveBeenCalled();
  });

  it("saves null for a blank world, not an empty string", async () => {
    await edit(mount(PremiseWorld, { props: { campaign } }), "   ");
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", update: { setting: null } });
  });

  it("puts the saved name back and says so when the save fails", async () => {
    mocks.update.mockRejectedValue(new Error("no"));
    const w = mount(PremiseWorld, { props: { campaign } });
    await edit(w, "Ravenloft");
    expect((w.find("input").element as HTMLInputElement).value).toBe("Eberron");
    expect(mocks.toastError).toHaveBeenCalled();
  });
});

describe("PremiseWorld ids", () => {
  // Bug caught (#1255): the World field took the id of part V ("How the world works"), so choosing that part in the
  // contents column scrolled back to the top of the page, and the scroll-following highlight read part V at the top.
  it("does not take the id of the How the world works part", async () => {
    const source = (await import("./PremiseWorld.vue?raw")).default as string;
    expect(source).not.toMatch(/\bid="canon-world"/);
  });
});
