import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { VueQueryPlugin } from "@tanstack/vue-query";
import type { VueWrapper } from "@vue/test-utils";
import DowngradeCampaignPickerModal from "./DowngradeCampaignPickerModal.vue";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const mocks = vi.hoisted(() => ({ campaigns: [] as unknown[], dataRef: null as { value: unknown[] } | null, archive: vi.fn(), switchTo: vi.fn(), active: "c1" }));
vi.mock("@/composables/campaign/useCampaigns", async () => {
  const { ref } = await import("vue");
  return {
    useOwnedCampaigns: () => {
      const data = ref(mocks.campaigns);
      mocks.dataRef = data;
      return { data };
    },
    useArchiveCampaign: () => ({ mutateAsync: mocks.archive, isPending: ref(false) }),
  };
});
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get activeCampaignId() { return mocks.active; }, switchToCampaign: mocks.switchTo }),
}));

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

function render(childAccount: boolean, campaignLimit = 2) {
  wrapper = mount(DowngradeCampaignPickerModal, {
    props: { show: true, campaignLimit, childAccount },
    global: { plugins: [createPinia(), VueQueryPlugin], stubs: { teleport: true } },
    attachTo: document.body,
  });
  return wrapper;
}

describe("DowngradeCampaignPickerModal copy", () => {
  it("never shows a young player anything about plans, Pro or upgrading", () => {
    render(true);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Your account can have 2 active campaigns.");
    expect(text).not.toMatch(/upgrad|plan|pro\b/i);
  });

  it("keeps the adult copy for everyone else", () => {
    render(false, 1);
    const text = document.body.textContent ?? "";
    expect(text).toContain("You're now on the free plan (1 active campaign).");
    expect(text).toContain("restored by upgrading");
    expect(text).toContain("Upgrade to Pro instead");
  });
});

describe("DowngradeCampaignPickerModal archiving", () => {
  const camp = (id: string, name: string, demo_source: string | null = null) => ({
    id, name, demo_source, setting: "Forgotten Realms", updated_at: "2026-09-01T10:00:00Z",
  });
  beforeEach(() => {
    mocks.archive.mockReset().mockResolvedValue(undefined);
    mocks.switchTo.mockReset();
    mocks.active = "c1";
    mocks.campaigns = [camp("c1", "Alpha"), camp("c2", "Bravo"), camp("c3", "Charlie"), camp("demo", "Sugarwell", "tmpl")];
  });
  const keepButton = () => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("and archive the rest")) as HTMLButtonElement;
  const row = (name: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(name)) as HTMLButtonElement;

  it("keeps the first campaign by default and archives every other one, never the demo", async () => {
    render(false, 1);
    expect(keepButton().textContent).toContain('Keep "Alpha"');
    keepButton().click();
    await flushPromises();
    expect(mocks.archive.mock.calls.map((c) => c[0]).sort()).toEqual(["c2", "c3"]);
  });

  it("keeps the campaign the DM picked, archives the rest, and switches to it when the active one is archived", async () => {
    render(false, 1);
    row("Bravo").click();
    await flushPromises();
    expect(keepButton().textContent).toContain('Keep "Bravo"');
    keepButton().click();
    await flushPromises();
    expect(mocks.archive.mock.calls.map((c) => c[0]).sort()).toEqual(["c1", "c3"]);
    expect(mocks.switchTo).toHaveBeenCalledWith(expect.objectContaining({ id: "c2" }));
  });

  it("keeps the DM's choice when the campaign list reloads", async () => {
    render(false, 1);
    row("Charlie").click();
    await flushPromises();
    mocks.dataRef!.value = [...mocks.campaigns];
    await flushPromises();
    expect(keepButton().textContent).toContain('Keep "Charlie"');
  });

  it("marks only the campaign that will be kept as selected, and moves the mark when another is picked", async () => {
    render(false, 1);
    const w = wrapper!;
    const active = () => w.findAllComponents({ name: "AppButton" }).filter((c) => c.props("active")).map((c) => c.text());
    expect(active()).toHaveLength(1);
    expect(active()[0]).toContain("Alpha");
    row("Bravo").click();
    await flushPromises();
    expect(active()).toHaveLength(1);
    expect(active()[0]).toContain("Bravo");
    // The radio dot sits inside the picked row only.
    const dots = [...document.body.querySelectorAll("span.rounded-full.bg-primary-foreground")];
    expect(dots).toHaveLength(1);
    expect(row("Bravo").contains(dots[0])).toBe(true);
  });

  it("does not switch campaigns when the kept one is already active", async () => {
    render(false, 1);
    keepButton().click();
    await flushPromises();
    expect(mocks.switchTo).not.toHaveBeenCalled();
  });

  it("does not offer the demo campaign as one to keep", () => {
    render(false, 1);
    expect(row("Sugarwell")).toBeUndefined();
  });

  it("offers no Upgrade button to a child account, and one to everyone else", () => {
    render(true);
    expect([...document.body.querySelectorAll("button")].some((b) => b.textContent?.includes("Upgrade"))).toBe(false);
    wrapper?.unmount();
    render(false);
    expect([...document.body.querySelectorAll("button")].some((b) => b.textContent?.includes("Upgrade to Pro instead"))).toBe(true);
  });
});
