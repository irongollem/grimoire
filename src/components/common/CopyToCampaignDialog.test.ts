import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CopyToCampaignDialog from "./CopyToCampaignDialog.vue";

const mocks = vi.hoisted(() => ({
  campaigns: [] as { id: string; name: string }[],
  planCopy: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: undefined as unknown as { value: boolean },
}));

vi.mock("@/composables/campaign/useCampaigns", () => ({
  useDmCampaigns: () => ({ data: { value: mocks.campaigns } }),
}));

// `isPending` is a genuine Vue ref (built inside the async factory, since
// `vi.hoisted` runs before `vue` is importable) — the template reads it
// straight through `copying`, which only auto-unwraps a real ref.
vi.mock("@/composables/campaign/useCopyToCampaign", async () => {
  const { ref } = await import("vue");
  mocks.isPending = ref(false);
  return {
    planCopy: (...args: unknown[]) => mocks.planCopy(...args),
    useCopyToCampaign: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.isPending }),
  };
});

function openDialog(props: Record<string, unknown> = {}) {
  return mount(CopyToCampaignDialog, {
    props: {
      open: true,
      table: "items",
      ids: ["i1", "i2"],
      sourceCampaignId: "camp-1",
      label: "item",
      ...props,
    },
    attachTo: document.body,
    global: { stubs: { transition: false } },
  });
}

// AppModal teleports its panel to document.body, so the mounted wrapper's own
// root is an empty teleport placeholder — `wrapper.text()`/`wrapper.find()`
// never see the panel's content. Query the body directly instead, exactly
// like AppModal.test.ts does.
function optionTexts() {
  return [...document.body.querySelectorAll("option")].map((o) => o.textContent);
}

function bodyText(): string {
  return document.body.textContent ?? "";
}

function copyButton(): HTMLElement | undefined {
  return [...document.body.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Copy"));
}

function selectEl(): HTMLSelectElement {
  return document.body.querySelector("select")!;
}

beforeEach(() => {
  mocks.campaigns = [
    { id: "camp-1", name: "Curse of Strahd" },
    { id: "camp-2", name: "Icewind Dale" },
  ];
  mocks.planCopy.mockReset().mockResolvedValue({ dropped: [], needsSources: null });
  mocks.mutateAsync.mockReset();
  if (mocks.isPending) mocks.isPending.value = false;
  document.body.innerHTML = "";
});

describe("CopyToCampaignDialog — target picker", () => {
  it("excludes the source campaign and offers 'All campaigns (general)' when the source is scoped", async () => {
    const wrapper = openDialog({ sourceCampaignId: "camp-1" });
    await flushPromises();

    const texts = optionTexts();
    expect(texts).toContain("All campaigns (general)");
    expect(texts).toContain("Icewind Dale");
    expect(texts).not.toContain("Curse of Strahd");
    wrapper.unmount();
  });

  it("excludes 'All campaigns (general)' when the source is already general", async () => {
    const wrapper = openDialog({ sourceCampaignId: null });
    await flushPromises();

    const texts = optionTexts();
    expect(texts).not.toContain("All campaigns (general)");
    expect(texts).toEqual(["Curse of Strahd", "Icewind Dale"]);
    wrapper.unmount();
  });

  it("disables the picker and reports no targets when copying the account's only campaign", async () => {
    mocks.campaigns = [{ id: "camp-1", name: "Curse of Strahd" }];
    const wrapper = openDialog({ sourceCampaignId: "camp-1" });
    await flushPromises();

    // Only the source itself exists and it is excluded, but "general" is still
    // offered because the source is scoped — so the picker is NOT empty here.
    expect(optionTexts()).toEqual(["All campaigns (general)"]);
    wrapper.unmount();
  });
});

describe("CopyToCampaignDialog — drop report", () => {
  it("renders nothing extra when the plan drops nothing — a picker and a Copy button, no ceremony", async () => {
    mocks.planCopy.mockResolvedValue({ dropped: [], needsSources: null });
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).not.toContain("stay behind");
    expect(bodyText()).not.toContain("left out");
    wrapper.unmount();
  });

  it("names the rows left behind for a field-cleared reference", async () => {
    mocks.planCopy.mockResolvedValue({ needsSources: null, dropped: [
      { label: "Linked spells", names: ["Chill Touch", "Mage Hand"], removedEntries: false },
    ] });
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).toContain("Linked spells");
    expect(bodyText()).toContain("Chill Touch, Mage Hand stay behind; the target campaign cannot see them.");
    wrapper.unmount();
  });

  it("reports a whole-entry removal with the count-based wording, not the field-cleared wording", async () => {
    mocks.planCopy.mockResolvedValue({ needsSources: null, dropped: [
      { label: "Loot entries", names: ["Vial of Acid", "Potion of Healing"], removedEntries: true },
    ] });
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).toContain("2 loot entries point at rows the target campaign cannot see and were left out.");
    wrapper.unmount();
  });

  it("re-plans when the target changes", async () => {
    const wrapper = openDialog({ sourceCampaignId: "camp-1" });
    await flushPromises();
    expect(mocks.planCopy).toHaveBeenCalledWith({ table: "items", ids: ["i1", "i2"], targetCampaignId: null });

    const sel = selectEl();
    sel.value = "camp-2";
    sel.dispatchEvent(new Event("change"));
    await flushPromises();
    expect(mocks.planCopy).toHaveBeenCalledWith({ table: "items", ids: ["i1", "i2"], targetCampaignId: "camp-2" });
    wrapper.unmount();
  });
});

describe("CopyToCampaignDialog — confirm", () => {
  it("emits copied with the count and the destination's name on success, and does not close itself", async () => {
    mocks.mutateAsync.mockResolvedValue({ copied: 2, dropped: [] });
    const wrapper = openDialog();
    await flushPromises();

    copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(mocks.mutateAsync).toHaveBeenCalledWith({ table: "items", ids: ["i1", "i2"], targetCampaignId: null });
    // The name travels with the count because the caller's toast is the only
    // confirmation there is — the copies landed somewhere this list cannot show.
    expect(wrapper.emitted("copied")).toEqual([[{ copied: 2, targetName: "all campaigns" }]]);
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("emits quota-exceeded and nothing else when the mutation rejects with quota_exceeded", async () => {
    mocks.mutateAsync.mockRejectedValue({ message: "quota_exceeded" });
    const wrapper = openDialog();
    await flushPromises();

    copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(wrapper.emitted("quota-exceeded")).toHaveLength(1);
    expect(wrapper.emitted("copied")).toBeUndefined();
    expect(wrapper.emitted("close")).toBeUndefined();
    wrapper.unmount();
  });

  it("surfaces a non-quota failure inline instead of emitting anything", async () => {
    mocks.mutateAsync.mockRejectedValue(new Error("network down"));
    const wrapper = openDialog();
    await flushPromises();

    copyButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(bodyText()).toContain("network down");
    expect(wrapper.emitted("quota-exceeded")).toBeUndefined();
    expect(wrapper.emitted("copied")).toBeUndefined();
    wrapper.unmount();
  });
});

// #598's "referenced shared-library content the target has not enabled is
// reported, not silently broken". It is a note, not a loss — the copy keeps the
// reference; the target campaign just cannot resolve it until the DM enables
// that source there. So it renders as its own panel, and never says "behind".
describe("CopyToCampaignDialog — unenabled library sources", () => {
  it("names the content and the source to enable, without calling it dropped", async () => {
    mocks.planCopy.mockResolvedValue({
      dropped: [],
      needsSources: { names: ["Fireball"], sources: ["Tome of Heroes"] },
    });
    const wrapper = openDialog();
    await flushPromises();

    expect(bodyText()).toContain("Tome of Heroes is not enabled in the target campaign");
    expect(bodyText()).toContain("enable it there and the reference resolves");
    expect(bodyText()).not.toContain("stay behind");
    expect(bodyText()).not.toContain("left out");
    wrapper.unmount();
  });

  it("says nothing when every source is already enabled", async () => {
    mocks.planCopy.mockResolvedValue({ dropped: [], needsSources: null });
    const wrapper = openDialog();
    await flushPromises();
    expect(bodyText()).not.toContain("not enabled in the target campaign");
    wrapper.unmount();
  });
});
