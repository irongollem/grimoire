import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HandoutShareControl from "./HandoutShareControl.vue";
import { useCampaignStore } from "@/stores/campaign";

const handout = { id: "d1", title: "T", campaign_id: "c1", player_visible_to: [] as string[], updated_at: "x", theme: "letter" as const };
const dialog = { props: ["open", "handout"], template: '<i data-testid="dialog" :data-open="open" />' };

function mountControl(props: Record<string, unknown> = {}, campaignId: string | null = "c1") {
  setActivePinia(createPinia());
  useCampaignStore().activeCampaignId = campaignId;
  return mount(HandoutShareControl, { props: { handout, ...props }, global: { stubs: { HandoutShareDialog: dialog } } });
}
const give = (w: ReturnType<typeof mountControl>) => w.findAll("button").find((b) => b.text().includes("Give to players"))!;

describe("HandoutShareControl", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the Give dialog", async () => {
    const w = mountControl();
    await give(w).trigger("click");
    expect(w.get('[data-testid="dialog"]').attributes("data-open")).toBe("true");
  });

  it("saves first, and a save that does not land cancels the give", async () => {
    const prepare = vi.fn().mockResolvedValue(false);
    const w = mountControl({ prepare });
    await give(w).trigger("click");
    await flushPromises();
    expect(prepare).toHaveBeenCalled();
    expect(w.get('[data-testid="dialog"]').attributes("data-open")).toBe("false");
  });

  it("cannot give a document that is not in the active campaign", () => {
    const w = mountControl({ handout: { ...handout, campaign_id: "other" } });
    expect(give(w).attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("Switch to this document's campaign");
  });

  it("offers to move an account-wide document into the active campaign", async () => {
    const w = mountControl({ handout: { ...handout, campaign_id: null }, activeCampaignName: "Sothery" });
    await w.findAll("button").find((b) => b.text().includes("Move it into Sothery"))!.trigger("click");
    expect(w.emitted("moveToCampaign")).toHaveLength(1);
  });
});
